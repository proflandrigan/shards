'use strict';
// Gate policies (E11.8): strict | phase | plan. Decides who must confirm a gate and records
// evidence / plan notices through the public machine API. Never confirms a gate that needs a human.
//
//  strict: every kind needs a human.
//  phase : phase/final/execute/handoff need a human. checkpoint/confirm with evidence.status 'pass'
//          are auto-recorded (proof tier 'auto-evidence'); fail/anomaly/no evidence -> human.
//  plan  : after a human confirms a plan approval, every kind becomes a notice
//          (proof tier 'plan-notice') until evidence fails/anomalies or the budget is exhausted.
//          Without a confirmed plan approval it behaves like 'phase'.
//
// Plan approvals are per run. A plan gate is the reserved id `plan-approval`, a scoped id
// `plan-approval.<run>`, or any gate requested with `plan_approval: "<run>"` (stored as
// `plan_run`; e.g. an agent's Phase 1 gate). The active plan for a gate is the most recently
// requested plan gate in the same project; it applies only once confirmed, so requesting a new
// run's plan gate suspends notices until a human confirms it. The notice budget is counted per
// plan gate (keyed by id and run).
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

function isPlanGate(g) {
  if (!g || typeof g.id !== 'string') return false;
  return g.id === PLAN_GATE_ID || g.id.startsWith(`${PLAN_GATE_ID}.`) || !!g.plan_run;
}

function planKey(g) { return g.plan_run ? `${g.id}:${g.plan_run}` : g.id; }

// The plan gate governing `entry`: the most recently requested plan gate in the same project
// (unscoped legacy entries match any project). null when there is none.
function activePlan(session, entry) {
  const project = entry ? (entry.project || null) : undefined;
  let best = null;
  for (const g of machine.listGates(session)) {
    if (!isPlanGate(g)) continue;
    if (project !== undefined && g.agent && (g.project || null) !== project) continue;
    if (!best || String(g.requested_at || '') >= String(best.requested_at || '')) best = g;
  }
  return best;
}

function stateOf(session) {
  return session.state || new (require('../state/store').StateStore)(session.root, session.sessionKey);
}

// `cur`: policy state already read under the lock (apply() checks and increments in one update).
// `entry`: the gate being decided (scopes the plan to its project); omitted means any project.
function planStatus(session, budget, cur, entry) {
  const plan = activePlan(session, entry);
  if (!plan || plan.status !== 'confirmed') return { active: false };
  const key = planKey(plan);
  const st = cur || stateOf(session).read('policy') || {};
  // Notices count per plan gate: a counter left by another plan starts over at 0.
  const used = st.plan_gate && st.plan_gate !== key ? 0 : (Number(st.notices) || 0);
  const maxGates = budget && budget.max_gates != null ? budget.max_gates : DEFAULT_MAX_GATES;
  if (used >= maxGates) return { active: true, key, exhausted: `max_gates (${maxGates}) exhausted` };
  if (budget && budget.max_minutes != null) {
    const start = Date.parse(plan.decided_at || plan.updated_at);
    if (Number.isFinite(start) && (Date.now() - start) / 60000 >= budget.max_minutes) return { active: true, key, exhausted: `max_minutes (${budget.max_minutes}) exhausted` };
  }
  if (budget && budget.max_tool_calls != null && Number(st.tool_calls) >= budget.max_tool_calls) return { active: true, key, exhausted: `max_tool_calls (${budget.max_tool_calls}) exhausted` };
  return { active: true, key, used, maxGates };
}

// apply(session, entry, evidence, {policy, budget}, deps) ->
//   { handled:false, reason? }                          (needs a human: fall through to normal tiers)
//   { handled:true, mode:'evidence'|'notice', entry, commit }
async function apply(session, entry, evidence, cfg = {}, deps = {}) {
  const policy = cfg.policy || 'phase';
  const ev = evidenceOf(evidence);
  if (ev) entry = await recordEvidence(session, entry, ev, policy);
  if (entry.status !== 'pending') return { handled: false };
  if (isPlanGate(entry)) return { handled: false, reason: 'plan-approval needs a human' };
  if (policy === 'strict') return { handled: false, reason: 'strict policy: human required' };
  const failed = ev && ev.status !== 'pass';

  if (policy === 'plan') {
    const ps = planStatus(session, cfg.budget, undefined, entry);
    if (ps.active) {
      if (failed) return { handled: false, reason: `evidence ${ev.status}: human required` };
      if (ps.exhausted) return { handled: false, reason: `budget exhausted: ${ps.exhausted}` };
      // Re-check the budget under the policy lock so concurrent gates cannot overspend it.
      let exhausted = null; let key = ps.key;
      await stateOf(session).update('policy', (cur) => {
        const inner = planStatus(session, cfg.budget, cur, entry);
        exhausted = !inner.active ? 'plan approval no longer active' : (inner.exhausted || null);
        if (exhausted) return cur;
        key = inner.key;
        if (cur.plan_gate && cur.plan_gate !== key) cur.notices = 0;
        cur.notices = (Number(cur.notices) || 0) + 1; cur.plan_gate = key; return cur;
      });
      if (exhausted) return { handled: false, reason: `budget exhausted: ${exhausted}` };
      const { entry: done, commit } = await machine.confirmGate(session, entry.id, { decision: 'confirmed', proof: { tier: 'plan-notice', level: 0, plan_gate: key, ts: new Date().toISOString() }, ...(ev && ev.summary ? { note: ev.summary } : {}) }, deps);
      return { handled: true, mode: 'notice', entry: done, commit: commit || done.commit || null };
    }
  }
  // phase behaviour (also plan without a confirmed plan approval)
  if (decide('phase', entry.kind) === 'evidence' && ev && ev.status === 'pass') {
    const { entry: done, commit } = await machine.confirmGate(session, entry.id, { decision: 'confirmed', proof: { tier: 'auto-evidence', level: 0, ts: new Date().toISOString(), policy: 'phase' }, ...(ev.summary ? { note: ev.summary } : {}) }, deps);
    return { handled: true, mode: 'evidence', entry: done, commit: commit || done.commit || null };
  }
  return { handled: false, reason: NON_ADVANCING.includes(entry.kind) ? (ev ? `evidence ${ev.status}: human required` : 'no evidence: human required') : 'human required' };
}

// Resolve the gates config for a tool call. Fails closed: if the config cannot be loaded or
// validated, the policy is `strict` (every gate needs a human) and the error is returned so the
// tool result can surface it. A missing getConfig (no config in play) keeps the defaults.
function resolveGatesConfig(ctx) {
  if (!ctx || typeof ctx.getConfig !== 'function') return { gates: {}, error: null };
  try {
    const c = ctx.getConfig();
    return { gates: (c && c.config && c.config.gates) || {}, error: null };
  } catch (e) {
    return { gates: { policy: 'strict' }, error: (e && e.message) || String(e) };
  }
}

module.exports = { resolveGatesConfig, PLAN_GATE_ID, DEFAULT_MAX_GATES, decide, recordEvidence, isPlanGate, activePlan, planStatus, apply };
