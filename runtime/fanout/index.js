'use strict';
// Fan-out runtime (E5.9): one lease for N parallel worker slices; verdicts merge worst-wins.
const leases = require('../leases');
const gates = require('../gates');
const { loadAgents } = require('../agents');

const VERDICTS = ['APPROVED', 'NEEDS REVISION', 'BLOCKED'];
const RULES = 'no gates, no plan changes, no delegation, write only inside owned_paths, return verdict JSON';

function sessionOf(s) {
  if (!s || !s.root) throw new Error('fanout requires a resolved session');
  return s;
}

function card(lease, slice) {
  return {
    lease_id: lease.id, slice_id: slice.id, owned_paths: slice.paths,
    acceptance: (lease.meta && lease.meta.acceptance && lease.meta.acceptance[slice.id]) || '', rules: RULES,
  };
}

async function startFanout(session, { agent, slices, ttl_ms } = {}) {
  sessionOf(session);
  if (session.state) {
    const frames = session.state.read('frames').frames || [];
    const frame = frames[frames.length - 1];
    if (frame) {
      const p = gates.pendingForFrame(session, frame.id);
      if (p) throw new Error(`fanout_start refused: the active frame has a pending gate (${p.id}). Resolve the pending gate before fanning out.`);
    }
  }
  const a = loadAgents().get(agent);
  if (!a || a.error) throw new Error(`fanout_start: unknown agent "${agent}"`);
  if (!Array.isArray(a.activation) || !a.activation.includes('fanout_worker')) throw new Error(`fanout_start: agent "${agent}" does not declare activation fanout_worker`);
  if (!Array.isArray(slices) || !slices.length) throw new Error('fanout_start: slices must be a non-empty array');
  const ids = new Set();
  const norm = [];
  for (const s of slices) {
    if (!s || typeof s.id !== 'string' || !s.id) throw new Error('fanout_start: each slice requires a string id');
    if (ids.has(s.id)) throw new Error(`fanout_start: duplicate slice id "${s.id}"`);
    ids.add(s.id);
    if (typeof s.acceptance !== 'string' || !s.acceptance.trim()) throw new Error(`fanout_start: slice "${s.id}" requires non-empty acceptance`);
    if (!Array.isArray(s.paths) || !s.paths.length) throw new Error(`fanout_start: slice "${s.id}" requires at least one path`);
    norm.push({ id: s.id, paths: s.paths.map(leases.normalizeRel), acceptance: s.acceptance });
  }
  for (let i = 0; i < norm.length; i++) for (let j = i + 1; j < norm.length; j++) {
    for (const p of norm[i].paths) for (const q of norm[j].paths) {
      if (leases.pathsOverlap(p, q)) throw new Error(`fanout_start: slices "${norm[i].id}" and "${norm[j].id}" have overlapping paths (${p} vs ${q})`);
    }
  }
  const acceptance = {};
  for (const s of norm) acceptance[s.id] = s.acceptance;
  const lease = await leases.openLease(session, {
    owner: 'fanout', worker_type: agent, slices: norm.map(({ id, paths }) => ({ id, paths })), ttl_ms,
    meta: { acceptance, fanout: true },
  });
  return { lease, cards: lease.slices.map((s) => card(lease, s)) };
}

function getLease(session, leaseId) {
  const l = leases.listActive(session).find((x) => x.id === leaseId && x.owner === 'fanout');
  if (!l) throw new Error(`no active fanout lease ${leaseId}`);
  return l;
}

function claimSlice(session, leaseId, sliceId) {
  const l = getLease(session, leaseId);
  const s = l.slices.find((x) => x.id === sliceId);
  if (!s) throw new Error(`lease ${leaseId} has no slice "${sliceId}"`);
  return card(l, s);
}

// mergeVerdicts(results, lease?): with a lease, every slice needs exactly one result and unknown slices are errors.
function mergeVerdicts(results, lease) {
  if (!Array.isArray(results) || !results.length) throw new Error('mergeVerdicts: results must be a non-empty array');
  const want = lease && Array.isArray(lease.slices) ? new Set(lease.slices.map((s) => s.id)) : null;
  const per_slice = {};
  for (const r of results) {
    if (!r || typeof r.slice_id !== 'string' || !r.slice_id || (want && !want.has(r.slice_id))) throw new Error(`mergeVerdicts: unknown slice "${r && r.slice_id}"`);
    if (Object.prototype.hasOwnProperty.call(per_slice, r.slice_id)) throw new Error(`mergeVerdicts: duplicate result for slice "${r.slice_id}"`);
    if (!VERDICTS.includes(r.verdict)) throw new Error(`mergeVerdicts: invalid verdict "${r.verdict}" for slice "${r.slice_id}"`);
    per_slice[r.slice_id] = { verdict: r.verdict, ...(r.summary !== undefined ? { summary: r.summary } : {}), ...(r.findings !== undefined ? { findings: r.findings } : {}) };
  }
  const missing = [...(want || [])].filter((id) => !(id in per_slice));
  if (missing.length) throw new Error(`mergeVerdicts: missing result for slice(s): ${missing.join(', ')}`);
  const vs = Object.values(per_slice).map((x) => x.verdict);
  const verdict = vs.includes('BLOCKED') ? 'BLOCKED' : vs.includes('NEEDS REVISION') ? 'NEEDS REVISION' : 'APPROVED';
  return { verdict, per_slice };
}

async function collectFanout(session, leaseId, results) {
  const l = getLease(session, leaseId);
  const merged = mergeVerdicts(results, l);
  await leases.closeLease(session, leaseId);
  return merged;
}

module.exports = { startFanout, claimSlice, mergeVerdicts, collectFanout, VERDICTS, RULES };
