'use strict';
// PreToolUse enforcement (E11.6 + E5.9 lease scheduling). Runtime state only; never reads the host's
// session log. Returns {deny: reason} to block the call, or null. Fail-open: callers catch errors.
//
// Rules (write/exec tools only: Write, Edit, MultiEdit, NotebookEdit, Bash writes):
//  1. caller agent_id bound to a slice of an active lease: heartbeat the lease; writes allowed only
//     inside that slice. Exempt from the pending-gate block.
//  2. fanout_claim tool calls bind agent_id -> {lease_id, slice_id} (works even with a gate pending).
//  3. unbound callers (lead, unleased subagent, any Codex caller: no agent_id, CX-6): denied while the
//     active frame has a pending gate, and denied writes into an active fan-out lease's slice paths.
// SHARDS_GATE_ENFORCE=0 disables every deny path (rules 1 and 3); binding (rule 2) still records.
const fs = require('fs');
const path = require('path');
const host = require('./host');
const { writesOf } = require('./writes');

const CLAIM_RE = /__fanout_claim$/;

const enforceOff = (env) => String(env.SHARDS_GATE_ENFORCE) === '0';

function pendingGate(session) {
  const frames = session.state.read('frames').frames || [];
  const top = frames[frames.length - 1];
  if (!top) return null;
  return require('../../runtime/gates/machine').pendingForFrame(session, top.id);
}

async function enforce(n, root, env = process.env) {
  const key = host.toSessionKey(n.sessionId);
  if (!key) return null;
  const { StateStore } = require('../../runtime/state/store');
  const state = new StateStore(root, key);
  const session = { root, sessionKey: key, state };
  const leases = require('../../runtime/leases');
  const claim = CLAIM_RE.test(n.toolName || '');
  const hasLeases = fs.existsSync(state.file('leases'));
  const hasGates = fs.existsSync(state.file('gates'));

  if (claim) {
    if (!n.agentId) return null; // Codex: cannot bind without agent_id
    const i = n.toolInput || {};
    try {
      await leases.bindWorker(session, { agentId: n.agentId, agentType: n.agentType, leaseId: i.lease_id || i.leaseId, sliceId: i.slice_id || i.sliceId });
    } catch (e) {
      return enforceOff(env) ? null : { deny: `shards fanout_claim refused: ${e.message}` };
    }
    return null;
  }
  if (!hasLeases && !hasGates) return null;

  const now = Date.now();
  if (hasLeases) {
    const l = state.read('leases').leases || {};
    if (Object.values(l).some((x) => x && x.status === 'active' && Date.parse(x.expires_at) <= now)) await leases.expireStale(session, now);
  }
  const bound = hasLeases ? leases.findWorkerLease(session, n.agentId, now) : null;
  if (bound) await leases.touchWorker(session, n.agentId, now);

  const w = writesOf(n);
  if (!w.write || enforceOff(env)) return null;

  if (bound) {
    const { lease, slice } = bound;
    if (w.unknown && !w.paths.length) return { deny: `shards: write target could not be determined; worker for slice ${slice.id} (lease ${lease.id}) may only write inside ${slice.paths.join(', ')}` };
    for (const p of w.paths) {
      const r = leases.isPathAllowed(session, n.agentId, p, now);
      if (!r.allowed) return { deny: `shards: ${r.reason} (slice ${slice.id}; allowed: ${slice.paths.join(', ')}; path ${path.relative(root, p) || p})` };
    }
    if (w.unknown) return { deny: `shards: a write target could not be determined; worker for slice ${slice.id} may only write inside ${slice.paths.join(', ')}` };
    return null;
  }
  if (hasGates) {
    const g = pendingGate(session);
    if (g) return { deny: `shards: gate ${g.id} is pending; write/exec tools are blocked until it is confirmed (a subagent needs a fanout_claim lease binding to keep working)` };
  }
  if (hasLeases) {
    for (const p of w.paths) {
      const o = leases.findSliceOwning(session, p, now);
      if (o) return { deny: `shards: ${path.relative(root, p) || p} is inside slice owned by worker ${o.slice.id} (lease ${o.lease.id}); do not edit it from the lead` };
    }
  }
  return null;
}

function denyOutput(reason) {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
}

module.exports = { enforce, denyOutput, CLAIM_RE };
