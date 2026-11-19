'use strict';
// Gate state machine (E11.1). State lives in <session>/gates.json = {gates: {<id>: Entry}}.
// Frames are owned by runtime/stack.js; gates reference them by `frame` id only.
// All mutations run inside state.update('gates', fn); fn is synchronous and does no slow work.
const path = require('path');
const { StateStore } = require('../state/store');

const KINDS = ['phase', 'final', 'execute', 'handoff', 'checkpoint', 'confirm'];
const ADVANCING_KINDS = ['phase', 'final', 'execute', 'handoff'];

function now() { return new Date().toISOString(); }
function storeOf(session) {
  if (!session || !session.root) throw new Error('session.root required');
  if (session.state) return session.state;
  if (!session.sessionKey) throw new Error('session.sessionKey required');
  return new StateStore(session.root, session.sessionKey);
}
function transition(e, to, by) {
  e.history = e.history || [];
  e.history.push({ ts: now(), from: e.status, to, ...(by ? { by } : {}) });
  e.status = to;
  e.updated_at = now();
}
function requireProof(proof, what) {
  if (!proof || typeof proof !== 'object' || typeof proof.tier !== 'string' || !proof.tier.trim()) {
    throw new Error(`${what} requires human proof (object with non-empty string tier)`);
  }
}

async function requestGate(session, req) {
  const { frame, id, kind } = req || {};
  if (!frame || !frame.id) throw new Error('requestGate requires a frame object with an id');
  if (typeof id !== 'string' || !id) throw new Error('requestGate requires a gate id');
  if (!KINDS.includes(kind)) throw new Error(`Unknown gate kind ${JSON.stringify(kind)}; expected one of ${KINDS.join(', ')}`);
  const state = storeOf(session);
  let result; let entry;
  await state.update('gates', (cur) => {
    const gates = cur.gates = cur.gates || {};
    let existing = gates[id];
    const project = req.project !== undefined ? req.project : (frame.project || null);
    const track = req.track !== undefined ? req.track : (frame.track || null);
    // Phase gate ids (`<agent>-phase-N`) repeat across runs: a closed gate only counts for the same
    // agent/project/track. Otherwise the id starts over as a fresh gate (old one kept in `previous`).
    let previous;
    const same = existing && existing.agent === frame.agent && (existing.project || null) === (project || null)
      && (!existing.track || !track || existing.track === track);
    if (existing && !same && (existing.status === 'pending' || existing.status === 'suspended')) {
      throw new Error(`gate ${id} is already ${existing.status} for ${existing.agent}${existing.project ? ` (project ${existing.project})` : ''}; resolve it or use a different gate id`);
    }
    if (existing && existing.status === 'confirmed' && same) { result = 'already_confirmed'; entry = existing; return cur; }
    if (existing && !same) {
      const { previous: older, ...rest } = existing;
      previous = [...(older || []), rest];
      existing = null;
    }
    if (existing && existing.status === 'suspended') throw new Error(`gate ${id} is suspended; resume it first`);
    const other = Object.values(gates).find((g) => g && g.id !== id && g.frame === frame.id && (g.status === 'pending' || g.status === 'suspended'));
    if (other) throw new Error(`Frame ${frame.id} already has ${other.status} gate ${other.id}; resolve it before requesting ${id}`);
    const ts = now();
    const stack = (state.read('frames').frames || []).map((f) => f.id);
    const rehome = (e) => { if (e.frame !== frame.id && !stack.includes(e.frame)) e.frame = frame.id; };
    if (existing && existing.status === 'pending') {
      rehome(existing);
      if (req.summary !== undefined) existing.summary = req.summary;
      if (req.record_ref !== undefined) existing.record_ref = req.record_ref;
      existing.updated_at = ts;
      result = 'already_pending'; entry = existing; return cur;
    }
    if (existing && (existing.status === 'changes_requested' || existing.status === 'force_closed')) {
      transition(existing, 'pending');
      // Reopened from a (possibly dead) frame: it belongs to the requesting frame now.
      existing.frame = frame.id; existing.agent = frame.agent;
      Object.assign(existing, {
        summary: req.summary !== undefined ? req.summary : existing.summary,
        record_ref: req.record_ref !== undefined ? req.record_ref : existing.record_ref,
        requested_at: ts,
      });
      result = 'reopened'; entry = existing; return cur;
    }
    entry = gates[id] = {
      id, status: 'pending', kind,
      phase: req.phase === undefined ? (frame.phase === undefined ? null : frame.phase) : req.phase,
      track, project,
      agent: frame.agent, frame: frame.id,
      summary: req.summary || '', record_ref: req.record_ref || null, validates: req.validates || null,
      requested_at: ts, updated_at: ts,
      history: [{ ts, from: null, to: 'pending' }],
      ...(previous ? { previous } : {}),
    };
    result = 'opened';
    return cur;
  });
  return { result, entry };
}

function getGate(session, id) { const g = storeOf(session).read('gates').gates || {}; return g[id] || null; }
function listGates(session) { return Object.values(storeOf(session).read('gates').gates || {}); }
function pendingForFrame(session, frameId) {
  return listGates(session).find((g) => g && g.frame === frameId && g.status === 'pending') || null;
}

function defaultResolveOutputDirs(root, entry) {
  const { loadAgents } = require('../agents');
  const a = loadAgents().get(entry.agent);
  if (!a || a.error || !a.output_dir) return [];
  const proj = entry.project;
  if (String(a.output_dir).includes('{project}') && !proj) return [];
  const rel = String(a.output_dir).replace(/\{project\}/g, proj || '');
  const abs = path.resolve(root, rel);
  const r = path.relative(path.resolve(root), abs);
  if (r.startsWith('..') || path.isAbsolute(r)) return [];
  return [rel];
}
function defaultLoadConfig(root) { return require('../config').loadOrCreateConfig(root).config; }

async function confirmGate(session, id, opts = {}, deps = {}) {
  const { decision, proof, note, reply } = opts;
  // TODO(E11.3-E11.5): Stage 5 tiers supply `proof`; there is no agent-callable confirm tool (D8).
  requireProof(proof, 'confirmGate');
  if (decision !== 'confirmed' && decision !== 'changes_requested') throw new Error(`Invalid decision ${JSON.stringify(decision)}`);
  const state = storeOf(session);
  let entry; let result;
  await state.update('gates', (cur) => {
    const g = (cur.gates || {})[id];
    if (!g) throw new Error(`Unknown gate ${id}`);
    if (g.status === 'confirmed' && decision === 'confirmed') { result = 'already_confirmed'; entry = g; return cur; }
    if (g.status !== 'pending') throw new Error(`Gate ${id} is ${g.status}, not pending`);
    const ts = now();
    transition(g, decision);
    g.decided_at = ts; g.decision = decision; g.proof = proof;
    if (note !== undefined) g.note = note;
    if (reply !== undefined) g.reply = reply;
    if (decision === 'confirmed') {
      g.commit = ADVANCING_KINDS.includes(g.kind) ? { outcome: 'in_progress' } : { outcome: 'skipped', reason: 'non_advancing_kind' };
    }
    result = decision; entry = g; return cur;
  });
  if (result !== 'confirmed') return { entry, result };
  if (entry.commit.outcome === 'skipped') return { entry, result, commit: entry.commit };

  let commit;
  try {
    const commitGate = deps.commitGate || require('../git').commitGate;
    const replayPending = deps.replayPending || (require('../git').replayPending);
    const config = (deps.loadConfig || defaultLoadConfig)(session.root);
    const gitCfg = config && config.git !== undefined ? config.git : config;
    const outputDirs = (deps.resolveOutputDirs || defaultResolveOutputDirs)(session.root, entry);
    if (typeof replayPending === 'function') {
      try { await replayPending(session.root, { config: gitCfg }); } catch (_) { /* ordering is also guarded by commitGate */ }
    }
    commit = await commitGate({
      root: session.root, session: state.sessionKey, gate: entry.id,
      agent: entry.agent, outputDirs, config: gitCfg,
      // Gate ids repeat across projects/tracks; the pending-commit store keys records by instance.
      project: entry.project || null, track: entry.track || null,
      // Leases need the session object (root + store), not just its key.
      getLeasedPaths: () => require('../git/leases').getLeasedPaths({ root: session.root, sessionKey: state.sessionKey, state }),
    });
    if (!commit || typeof commit !== 'object') commit = { outcome: 'commit_pending', reason: 'no_result' };
  } catch (e) {
    commit = { outcome: 'commit_pending', reason: `commit_error: ${e && e.message ? e.message : e}` };
  }
  await state.update('gates', (cur) => {
    const g = (cur.gates || {})[id];
    if (g) { g.commit = commit; g.updated_at = now(); entry = g; }
    return cur;
  });
  return { entry, result, commit };
}

async function setSuspension(session, id, proof, from, to, what, check) {
  // TODO(E5.5, E11.3-5): human-proof verification belongs to Stage 5; not exposed as a tool.
  requireProof(proof, what);
  let entry;
  await storeOf(session).update('gates', (cur) => {
    const g = (cur.gates || {})[id];
    if (!g) throw new Error(`Unknown gate ${id}`);
    if (g.status !== from) throw new Error(`Gate ${id} is ${g.status}; can only ${what} a ${from} gate`);
    if (check) check(g, cur.gates);
    if (to === 'suspended') g.suspended_from = g.status;
    transition(g, to, proof.tier);
    if (to === 'pending') delete g.suspended_from;
    entry = g; return cur;
  });
  return entry;
}
const suspendGate = (s, id, { proof } = {}) => setSuspension(s, id, proof, 'pending', 'suspended', 'suspendGate');
// `frame`: re-home the gate to that frame in the same update, refusing if it already has an open gate.
const resumeGate = async (s, id, { proof, frame } = {}) => {
  const entry = await setSuspension(s, id, proof, 'suspended', 'pending', 'resumeGate', frame ? (g, all) => {
    const other = Object.values(all).find((o) => o && o.id !== id && o.frame === frame && (o.status === 'pending' || o.status === 'suspended'));
    if (other) throw new Error(`Frame ${frame} already has ${other.status} gate ${other.id}; resolve it before resuming ${id}`);
    g.frame = frame;
  } : undefined);
  // E11.5: a chat reply sent while suspended can never confirm; move the high-water mark.
  await require('./tier3').markRequest(s, id);
  return entry;
};

// Operator force-close (E11.13): terminal, NOT confirmed (never satisfies a phase gate), not open.
const FORCE_CLOSABLE = ['pending', 'suspended', 'changes_requested'];
async function forceCloseGate(session, id, { actor, via, reason } = {}) {
  let entry;
  await storeOf(session).update('gates', (cur) => {
    const g = (cur.gates || {})[id];
    if (!g) throw new Error(`Unknown gate ${id}`);
    if (!FORCE_CLOSABLE.includes(g.status)) throw new Error(`Gate ${id} is ${g.status}; only pending, suspended or changes_requested gates can be force-closed`);
    transition(g, 'force_closed', via || actor);
    delete g.suspended_from;
    g.force_closed = { actor: actor || null, via: via || null, ts: now(), reason: reason || null };
    entry = g; return cur;
  });
  return entry;
}

function formatConfirmedMessage(entry) {
  const c = entry.commit || {};
  let what;
  if (c.outcome === 'in_progress') what = 'commit in progress';
  else if (c.sha) what = String(c.sha).slice(0, 7);
  else what = 'commit_pending';
  return `Gate ${entry.id} already confirmed (${what}), continue.`;
}

function describeInterimConfirm(gateId, sessionKey) {
  return [
    `Gate ${gateId} is waiting for human confirmation. Ask the user to run:`,
    `  node cli/shards.js gates confirm ${gateId} --session ${sessionKey}`,
    `or, to request changes:`,
    `  node cli/shards.js gates confirm ${gateId} --session ${sessionKey} --changes "<note>"`,
    `(Interim Milestone A operator CLI; replaced by Stage 5 confirmation tiers.)`,
  ].join('\n');
}

function confirmedGates(session) {
  return listGates(session).filter((g) => g.status === 'confirmed')
    .map((g) => ({ id: g.id, sha: (g.commit && g.commit.sha) || null, outcome: (g.commit && g.commit.outcome) || null }));
}

module.exports = {
  KINDS, ADVANCING_KINDS, requestGate, getGate, listGates, pendingForFrame, confirmGate,
  suspendGate, resumeGate, forceCloseGate, FORCE_CLOSABLE, formatConfirmedMessage, describeInterimConfirm, confirmedGates,
};
