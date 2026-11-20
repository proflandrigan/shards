'use strict';
// Path lease store (E12.1). Leases are persisted in state store name `leases`
// as {leases: {<id>: lease}}; every mutation goes through state.update (locked).
// A lease grants a worker (worker_type) exclusive-ish slices of the project.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { StateStore } = require('../state/store');

const OWNERS = ['task', 'fanout'];
const DEFAULT_TTL_MS = 900000;

function storeOf(session) {
  if (!session || !session.root) throw new Error('session.root required');
  if (session.state) return session.state;
  if (!session.sessionKey) throw new Error('session.sessionKey required');
  return new StateStore(session.root, session.sessionKey);
}

function normalizeRel(p) {
  if (typeof p !== 'string' || !p.trim()) throw new Error('lease path must be a non-empty string');
  const s = p.replace(/\\/g, '/');
  if (s.startsWith('/') || /^[A-Za-z]:/.test(s)) throw new Error(`lease path must be project-root-relative, got absolute: ${p}`);
  const segs = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') throw new Error(`lease path must not contain "..": ${p}`);
    segs.push(seg);
  }
  if (!segs.length) throw new Error(`lease path is empty after normalization: ${p}`);
  return segs.join('/');
}

function pathsOverlap(a, b) {
  const x = String(a).replace(/\/+$/, ''); const y = String(b).replace(/\/+$/, '');
  return x === y || y.startsWith(`${x}/`) || x.startsWith(`${y}/`);
}

function validateSlices(slices) {
  if (!Array.isArray(slices) || !slices.length) throw new Error('slices must be a non-empty array');
  return slices.map((s) => {
    if (!s || typeof s.id !== 'string' || !s.id) throw new Error('each slice requires a string id');
    if (!Array.isArray(s.paths) || !s.paths.length) throw new Error(`slice ${s.id} requires at least one path`);
    return { id: s.id, paths: s.paths.map(normalizeRel) };
  });
}

const iso = (ms) => new Date(ms).toISOString();
const leasesOf = (cur) => (cur && cur.leases) || {};
const isLive = (l, now) => l.status === 'active' && Date.parse(l.expires_at) > now;

async function openLease(session, opts = {}) {
  const { owner, worker_type, ttl_ms, meta } = opts;
  if (!OWNERS.includes(owner)) throw new Error(`owner must be one of ${OWNERS.join('|')}`);
  if (typeof worker_type !== 'string' || !worker_type) throw new Error('worker_type required');
  const slices = validateSlices(opts.slices);
  const ttl = ttl_ms === undefined ? DEFAULT_TTL_MS : ttl_ms;
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error('ttl_ms must be a positive number');
  const t = Date.now();
  const lease = {
    id: `lease-${crypto.randomBytes(4).toString('hex')}`, session: session.sessionKey, owner, worker_type,
    slices, meta: meta || {}, status: 'active', opened_at: iso(t), heartbeat_at: iso(t), expires_at: iso(t + ttl), ttl_ms: ttl,
  };
  await storeOf(session).update('leases', (cur) => {
    cur.leases = leasesOf(cur);
    cur.leases[lease.id] = lease;
    return cur;
  });
  return lease;
}

async function heartbeat(session, id) {
  let out;
  await storeOf(session).update('leases', (cur) => {
    const l = leasesOf(cur)[id];
    if (!l) throw new Error(`unknown lease ${id}`);
    if (l.status !== 'active') throw new Error(`lease ${id} is ${l.status}`);
    const t = Date.now();
    if (Date.parse(l.expires_at) <= t) throw new Error(`lease ${id} is expired`);
    l.heartbeat_at = iso(t); l.expires_at = iso(t + l.ttl_ms);
    out = l;
    return cur;
  });
  return out;
}

async function closeLease(session, id) {
  let out;
  await storeOf(session).update('leases', (cur) => {
    const l = leasesOf(cur)[id];
    if (!l) throw new Error(`unknown lease ${id}`);
    if (l.status !== 'closed') { l.status = 'closed'; l.closed_at = iso(Date.now()); }
    out = l;
    return cur;
  });
  return out;
}

function listActive(session, now = Date.now()) {
  return Object.values(leasesOf(storeOf(session).read('leases'))).filter((l) => isLive(l, now));
}

async function expireStale(session, now = Date.now()) {
  const expired = [];
  await storeOf(session).update('leases', (cur) => {
    for (const l of Object.values(leasesOf(cur))) {
      if (l.status === 'active' && Date.parse(l.expires_at) <= now) { l.status = 'expired'; expired.push(l.id); }
    }
    return cur;
  });
  return expired;
}

// Resolve symlinks on the longest existing prefix of p (the rest may not exist yet: a new file).
function realish(p) {
  let cur = path.resolve(p); const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync.native(cur), ...tail); } catch (_) { /* not there yet */ }
    const parent = path.dirname(cur);
    if (parent === cur) return path.join(cur, ...tail);
    tail.unshift(path.basename(cur)); cur = parent;
  }
}

// macOS and Windows file systems are case-insensitive by default: `Models/A` is `models/a`.
const CASE_INSENSITIVE = process.platform === 'darwin' || process.platform === 'win32';
const fold = (s) => (CASE_INSENSITIVE ? s.toLowerCase() : s);

function rawRel(session, filePath) {
  const s = String(filePath || '').replace(/\\/g, '/');
  const abs = path.isAbsolute(filePath) || /^[A-Za-z]:\//.test(s) ? filePath : path.resolve(session.root, path.posix.normalize(s || '.'));
  const rel = path.relative(realish(session.root), realish(abs)).replace(/\\/g, '/');
  return rel.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
}

function relOf(session, filePath) {
  const rel = rawRel(session, filePath);
  if (!rel || rel === '.' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return null;
  return rel;
}

// The project root itself or one of its ancestors (`.`, `..`, the absolute root): contains every slice.
function containsRoot(session, filePath) {
  const rel = rawRel(session, filePath);
  return !rel || rel === '.' || /^\.\.(\/\.\.)*$/.test(rel);
}

const inside = (rel, p) => { const r = fold(rel); const q = fold(p); return r === q || r.startsWith(`${q}/`); };

// Mutate the leases state under the state lock. bump=false (hook-owned writes: worker binding and
// heartbeats) does NOT bump the session version, so they never trigger version-change re-grounding.
async function mutate(session, fn, { bump = true } = {}) {
  const st = storeOf(session);
  if (bump) return st.update('leases', fn);
  const { atomicWrite } = require('../state/store');
  return st.withLock(() => {
    const cur = st.read('leases');
    const next = fn(cur);
    atomicWrite(st.file('leases'), JSON.stringify(next === undefined ? cur : next, null, 2));
    return next;
  });
}

const typeTail = (t) => String(t || '').toLowerCase().split(':').pop();
function typesMatch(a, b) {
  if (!a || !b) return true;
  const x = String(a).toLowerCase(); const y = String(b).toLowerCase();
  return x === y || typeTail(x) === typeTail(y);
}

// Bind a host agent_id (from the hook payload) to one slice of an active lease (E5.9/E12).
async function bindWorker(session, { agentId, agentType, leaseId, sliceId } = {}, now = Date.now()) {
  if (!agentId) throw new Error('agentId required (host did not report agent_id)');
  let out;
  await mutate(session, (cur) => {
    const l = leasesOf(cur)[leaseId];
    if (!l) throw new Error(`unknown lease ${leaseId}`);
    if (!isLive(l, now)) throw new Error(`lease ${leaseId} is ${l.status === 'active' ? 'expired' : l.status}`);
    if (!OWNERS.includes(l.owner)) throw new Error(`lease ${leaseId} owner ${l.owner} does not allow workers`);
    if (!l.slices.some((s) => s.id === sliceId)) throw new Error(`lease ${leaseId} has no slice ${sliceId}`);
    if (!typesMatch(agentType, l.worker_type)) throw new Error(`agent_type ${agentType} does not match lease worker_type ${l.worker_type}`);
    const workers = l.workers || {};
    const prev = workers[agentId];
    if (prev && prev.slice_id !== sliceId) throw new Error(`agent ${agentId} is already bound to slice ${prev.slice_id}`);
    for (const [id, w] of Object.entries(workers)) {
      if (id !== agentId && w.slice_id === sliceId) throw new Error(`slice ${sliceId} is already bound to a different worker`);
    }
    if (!prev && Object.keys(workers).length + 1 > l.slices.length) throw new Error(`lease ${leaseId} already has ${l.slices.length} bound worker(s) (one per slice)`);
    l.workers = { ...workers, [agentId]: prev || { slice_id: sliceId, agent_type: agentType || null, bound_at: iso(now) } };
    out = { lease: l, slice: l.slices.find((s) => s.id === sliceId) };
    return cur;
  }, { bump: false });
  return out;
}

// SubagentStop (S5F): release the lease binding held by a worker that exited. The worker loses its
// write rights at once. Its slice becomes claimable again (retry). Task-owned leases are
// single-worker, so they are closed outright. Fan-out leases stay open until fanout_collect (collect needs
// the active lease and the lead must not edit slice paths in the meantime). Idempotent: returns
// {released:false} for an unbound or already released agent.
async function releaseWorker(session, agentId, now = Date.now()) {
  if (!agentId) return { released: false };
  let out = { released: false };
  await mutate(session, (cur) => {
    for (const l of Object.values(leasesOf(cur))) {
      if (l.status !== 'active' || !l.workers || !l.workers[agentId]) continue;
      const w = l.workers[agentId];
      const { [agentId]: _gone, ...rest } = l.workers;
      l.workers = rest;
      l.released = { ...(l.released || {}), [agentId]: { slice_id: w.slice_id, released_at: iso(now) } };
      let closed = false;
      if (l.owner === 'task') { l.status = 'closed'; l.closed_at = iso(now); closed = true; }
      out = { released: true, lease_id: l.id, slice_id: w.slice_id, closed };
      break;
    }
    return cur;
  }, { bump: false });
  return out;
}

function findWorkerLease(session, agentId, now = Date.now()) {
  if (!agentId) return null;
  for (const l of listActive(session, now)) {
    const w = l.workers && l.workers[agentId];
    if (!w) continue;
    const slice = l.slices.find((s) => s.id === w.slice_id);
    if (slice) return { lease: l, slice };
  }
  return null;
}

// Extend the lease expiry when a bound worker acts. Throttled (a quarter of the TTL, max 5s) to keep
// the hook cheap. Returns true when the lease was refreshed.
async function touchWorker(session, agentId, now = Date.now()) {
  const f = findWorkerLease(session, agentId, now);
  if (!f) return false;
  const l = f.lease;
  if (now - Date.parse(l.heartbeat_at) < Math.min(5000, l.ttl_ms / 4)) return false;
  let did = false;
  await mutate(session, (cur) => {
    const x = leasesOf(cur)[l.id];
    if (x && isLive(x, now)) { x.heartbeat_at = iso(now); x.expires_at = iso(now + x.ttl_ms); did = true; }
    return cur;
  }, { bump: false });
  return did;
}

// Active fanout-owned slice that contains (or is contained by) rel, or null. For the lead/unbound caller.
function findSliceOwning(session, filePath, now = Date.now()) {
  const rel = relOf(session, filePath);
  if (!rel) {
    // A write aimed at the root or an ancestor (`rm -rf .`, `unzip x.zip`) reaches every slice.
    if (!containsRoot(session, filePath)) return null;
    for (const l of listActive(session, now)) if (l.owner === 'fanout' && l.slices.length) return { lease: l, slice: l.slices[0], rel: '.' };
    return null;
  }
  for (const l of listActive(session, now)) {
    if (l.owner !== 'fanout') continue;
    for (const sl of l.slices) for (const p of sl.paths) if (inside(rel, p) || inside(p, rel)) return { lease: l, slice: sl, rel };
  }
  return null;
}

function isPathAllowed(session, agentId, filePath, now = Date.now()) {
  const bound = findWorkerLease(session, agentId, now);
  const mine = bound ? [] : listActive(session, now).filter((l) => l.worker_type === agentId);
  if (!bound && !mine.length) return { allowed: true, lease_id: null, reason: 'no active lease for agent' };
  const rel = relOf(session, filePath);
  const leaseId = bound ? bound.lease.id : mine[0].id;
  if (!rel) return { allowed: false, lease_id: leaseId, reason: `path outside project root or not a file: ${filePath}` };
  if (bound) {
    for (const p of bound.slice.paths) if (inside(rel, p)) return { allowed: true, lease_id: leaseId, reason: `within slice ${bound.slice.id}`, slice_id: bound.slice.id };
    return { allowed: false, lease_id: leaseId, slice_id: bound.slice.id, reason: `path ${rel} is outside slice ${bound.slice.id} of lease ${leaseId}` };
  }
  for (const l of mine) {
    for (const sl of l.slices) {
      for (const p of sl.paths) {
        if (inside(rel, p)) return { allowed: true, lease_id: l.id, reason: `within slice ${sl.id}` };
      }
    }
  }
  return { allowed: false, lease_id: mine[0].id, reason: `path ${rel} is outside leased slices for ${agentId}` };
}

module.exports = { releaseWorker, bindWorker, findWorkerLease, touchWorker, findSliceOwning, openLease, heartbeat, closeLease, listActive, expireStale, isPathAllowed, pathsOverlap, normalizeRel, OWNERS, DEFAULT_TTL_MS };
