'use strict';
// Auto-verify blocks (E11.12). A scope-bounded, budgeted, time-limited block during which
// hardcoded read-only tool calls are auto-approved (see runtime/lib/auto-allowlist.js).
// State: <session>/auto-verify.json {active, agent, phase, tool_budget, used, started_at,
// ttl_s, expires_at, ended_at?, end_reason?}. Gates always win: a pending/suspended gate
// on the top frame ends the block.
const fs = require('fs');
const { StateStore } = require('../state/store');
const { isAutoApprovable } = require('../lib/auto-allowlist');

const NAME = 'auto-verify';
const BUDGET = { min: 1, max: 200 };
const TTL = { min: 30, max: 3600 };

function storeOf(session) {
  if (session.state) return session.state;
  return new StateStore(session.root, session.sessionKey);
}

function topFrame(store) {
  const frames = store.read('frames').frames || [];
  return frames[frames.length - 1] || null;
}

function openGateOnFrame(store, frame) {
  if (!frame) return null;
  const gates = store.read('gates').gates || {};
  return Object.values(gates).find((g) => g && g.frame === frame.id && (g.status === 'pending' || g.status === 'suspended')) || null;
}

function expired(st, now) { return Number.isFinite(st.expires_at) && now >= st.expires_at; }
function liveBlock(st, now) { return !!(st && st.active && !expired(st, now) && st.used < st.tool_budget); }

function get(session) { return storeOf(session).read(NAME); }

// Sync fast path: reads the file without a lock. True iff a block looks active (not expired).
function isActive(session) {
  try {
    const store = storeOf(session);
    const st = JSON.parse(fs.readFileSync(store.file(NAME), 'utf8'));
    return !!(st && st.active && Date.now() < st.expires_at && st.used < st.tool_budget);
  } catch (_) { return false; }
}

async function start(session, { agent, phase, tool_budget, ttl_s } = {}, { now = Date.now() } = {}) {
  if (!Number.isInteger(tool_budget) || tool_budget < BUDGET.min || tool_budget > BUDGET.max) throw new Error(`tool_budget must be an integer ${BUDGET.min}..${BUDGET.max}`);
  if (!Number.isInteger(ttl_s) || ttl_s < TTL.min || ttl_s > TTL.max) throw new Error(`ttl_s must be an integer ${TTL.min}..${TTL.max}`);
  if (typeof agent !== 'string' || !agent) throw new Error('agent is required');
  const store = storeOf(session);
  return store.update(NAME, (cur) => {
    if (liveBlock(cur, now)) throw new Error(`An auto-verify block is already active (agent ${cur.agent}, ${cur.tool_budget - cur.used} of ${cur.tool_budget} tool calls left). End it first with auto_verify_end.`);
    const frame = topFrame(store);
    const open = openGateOnFrame(store, frame);
    if (open) throw new Error(`auto-verify refused: gate ${open.id} is ${open.status} on the active frame. Gates always win; resolve it first.`);
    return {
      active: true, agent, phase: phase === undefined ? null : phase, tool_budget, used: 0,
      started_at: now, ttl_s, expires_at: now + ttl_s * 1000,
    };
  });
}

async function end(session, reason = 'ended', { now = Date.now() } = {}) {
  const store = storeOf(session);
  let was = null;
  const next = await store.update(NAME, (cur) => {
    if (!cur.active) return cur;
    was = cur;
    return { ...cur, active: false, ended_at: now, end_reason: reason };
  });
  return { ended: !!was, state: next };
}

// -> {approve, reason}. Approves only inside a live block for an allowlisted call; consumes
// one unit of budget per approval. Non-approved calls never consume budget.
async function check(session, toolName, toolInput, { now = Date.now() } = {}) {
  const store = storeOf(session);
  let res = { approve: false, reason: 'no result' };
  await store.update(NAME, (cur) => {
    if (!cur.active) { res = { approve: false, reason: 'no active auto-verify block' }; return cur; }
    const endWith = (why) => { res = { approve: false, reason: `auto-verify block ended: ${why}` }; return { ...cur, active: false, ended_at: now, end_reason: why }; };
    if (expired(cur, now)) return endWith('ttl_expired');
    if (cur.used >= cur.tool_budget) return endWith('budget_exhausted');
    const open = openGateOnFrame(store, topFrame(store));
    if (open) return endWith(`gate_${open.status}:${open.id}`);
    if (!isAutoApprovable(toolName, toolInput)) { res = { approve: false, reason: 'not on the read-only auto-verify allowlist' }; return cur; }
    const used = cur.used + 1;
    res = { approve: true, reason: `auto-verify (${used}/${cur.tool_budget})` };
    const out = { ...cur, used };
    if (used >= cur.tool_budget) { out.active = false; out.ended_at = now; out.end_reason = 'budget_exhausted'; }
    return out;
  });
  return res;
}

module.exports = { start, end, get, check, isActive, BUDGET, TTL };
