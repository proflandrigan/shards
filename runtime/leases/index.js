'use strict';
// Path lease store (E12.1). Leases are persisted in state store name `leases`
// as {leases: {<id>: lease}}; every mutation goes through state.update (locked).
// A lease grants a worker (worker_type) exclusive-ish slices of the project.
const crypto = require('crypto');
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

function isPathAllowed(session, agentId, filePath, now = Date.now()) {
  const mine = listActive(session, now).filter((l) => l.worker_type === agentId);
  if (!mine.length) return { allowed: true, lease_id: null, reason: 'no active lease for agent' };
  let rel;
  const s = String(filePath || '').replace(/\\/g, '/');
  if (path.isAbsolute(filePath) || /^[A-Za-z]:\//.test(s)) rel = path.relative(session.root, filePath).replace(/\\/g, '/');
  else rel = path.posix.normalize(s || '.');
  rel = rel.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  if (!rel || rel === '.' || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) {
    return { allowed: false, lease_id: mine[0].id, reason: `path outside project root or not a file: ${filePath}` };
  }
  for (const l of mine) {
    for (const sl of l.slices) {
      for (const p of sl.paths) {
        if (rel === p || rel.startsWith(`${p}/`)) return { allowed: true, lease_id: l.id, reason: `within slice ${sl.id}` };
      }
    }
  }
  return { allowed: false, lease_id: mine[0].id, reason: `path ${rel} is outside leased slices for ${agentId}` };
}

module.exports = { openLease, heartbeat, closeLease, listActive, expireStale, isPathAllowed, pathsOverlap, normalizeRel, OWNERS, DEFAULT_TTL_MS };
