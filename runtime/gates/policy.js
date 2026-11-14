'use strict';
// Gate policies (E11.8): strict | phase | plan. Decides who must confirm a gate and records
// evidence / plan notices through the public machine API. Never confirms a gate that needs a human.
//
//  strict: every kind needs a human.
//  phase : phase/final/execute/handoff need a human. checkpoint/confirm with evidence.status 'pass'
//          are auto-recorded (proof tier 'auto-evidence'); fail/anomaly/no evidence -> human.
//  plan  : after a human confirms the reserved gate `plan-approval`, every kind becomes a notice
//          (proof tier 'plan-notice') until evidence fails/anomalies or the budget is exhausted.
//          Without a confirmed plan-approval it behaves like 'phase'.
//
// Counters live in <session>/policy.json: {notices:int, plan_gate, started_at}.
const machine = require('./machine');

const PLAN_GATE_ID = 'plan-approval';
const NON_ADVANCING = ['checkpoint', 'confirm'];
const DEFAULT_MAX_GATES = 100;

// decide(policy, kind) -> what the policy allows for a kind in the best case.
function decide(policy, kind) {
  if (policy === 'strict') return 'human';
  if (policy === 'plan') return 'notice';
  return NON_ADVANCING.includes(kind) ? 'evidence' : 'human';
}

function evidenceOf(ev) {
  if (!ev || typeof ev !== 'object') return null;
  return ['pass', 'fail', 'anomaly'].includes(ev.status) ? ev : null;
}

// Stores evidence on the gate entry (any status) via the state store.
async function recordEvidence(session, entry, evidence, policy) {
  const ev = evidenceOf(evidence);
  if (!ev) return entry;
  const state = session.state || new (require('../state/store').StateStore)(session.root, session.sessionKey);
  let out = entry;
  await state.update('gates', (cur) => {
    const g = (cur.gates || {})[entry.id];
    if (g) { g.evidence = { ...ev, ts: new Date().toISOString(), ...(policy ? { policy } : {}) }; out = g; }
    return cur;
  });
  return out;
}

function stateOf(session) {
  return session.state || new (require('../state/store').StateStore)(session.root, session.sessionKey);
}

function planStatus(session, budget) {
  const plan = machine.getGate(session, PLAN_GATE_ID);
  if (!plan || plan.status !== 'confirmed') return { active: false };
  const st = stateOf(session).read('policy') || {};
  const used = Number(st.notices) || 0;
  const maxGates = budget && budget.max_gates != null ? budget.max_gates : DEFAULT_MAX_GATES;
  if (used >= maxGates) return { active: true, exhausted: `max_gates (${maxGates}) exhausted` };
  if (budget && budget.max_minutes != null) {
    const start = Date.parse(plan.decided_at || plan.updated_at);
    if (Number.isFinite(start) && (Date.now() - start) / 60000 >= budget.max_minutes) return { active: true, exhausted: `max_minutes (${budget.max_minutes}) exhausted` };
  }
  if (budget && budget.max_tool_calls != null && Number(st.tool_calls) >= budget.max_tool_calls) return { active: true, exhausted: `max_tool_calls (${budget.max_tool_calls}) exhausted` };
  return { active: true, used, maxGates };
}

// apply(session, entry, evidence, {policy, budget}, deps) ->
//   { handled:false, reason? }                          (needs a human: fall through to normal tiers)
//   { handled:true, mode:'evidence'|'notice', entry, commit }
async function apply(session, entry, evidence, cfg = {}, deps = {}) {
  const policy = cfg.policy || 'phase';
  const ev = evidenceOf(evidence);
  if (ev) entry = await recordEvidence(session, entry, ev, policy);
  if (entry.status !== 'pending') return { handled: false };
  if (entry.id === PLAN_GATE_ID) return { handled: false, reason: 'plan-approval needs a human' };
  if (policy === 'strict') return { handled: false, reason: 'strict policy: human required' };
  const failed = ev && ev.status !== 'pass';

  if (policy === 'plan') {
    const ps = planStatus(session, cfg.budget);
    if (ps.active) {
      if (failed) return { handled: false, reason: `evidence ${ev.status}: human required` };
      if (ps.exhausted) return { handled: false, reason: `budget exhausted: ${ps.exhausted}` };
      await stateOf(session).update('policy', (cur) => { cur.notices = (Number(cur.notices) || 0) + 1; cur.plan_gate = PLAN_GATE_ID; return cur; });
      const { entry: done, commit } = await machine.confirmGate(session, entry.id, { decision: 'confirmed', proof: { tier: 'plan-notice', level: 0, plan_gate: PLAN_GATE_ID, ts: new Date().toISOString() }, ...(ev && ev.summary ? { note: ev.summary } : {}) }, deps);
      return { handled: true, mode: 'notice', entry: done, commit: commit || done.commit || null };
    }
  }
  // phase behaviour (also plan without confirmed plan-approval)
  if (decide('phase', entry.kind) === 'evidence' && ev && ev.status === 'pass') {
    const { entry: done, commit } = await machine.confirmGate(session, entry.id, { decision: 'confirmed', proof: { tier: 'auto-evidence', level: 0, ts: new Date().toISOString(), policy: 'phase' }, ...(ev.summary ? { note: ev.summary } : {}) }, deps);
    return { handled: true, mode: 'evidence', entry: done, commit: commit || done.commit || null };
  }
  return { handled: false, reason: NON_ADVANCING.includes(entry.kind) ? (ev ? `evidence ${ev.status}: human required` : 'no evidence: human required') : 'human required' };
}

module.exports = { PLAN_GATE_ID, DEFAULT_MAX_GATES, decide, recordEvidence, planStatus, apply };
