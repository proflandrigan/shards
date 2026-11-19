'use strict';
// task_dispatch (E12.1): validate dispatchability atomically, open one lease per non-inline task.
const { defineTool } = require('../registry');
const T = require('../tasks');

// Reasons the ids can't be dispatched given the current task states ([] when all are dispatchable).
function dispatchProblems(ids, tasks, byId) {
  const problems = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (!t) { problems.push(`${id}: unknown task`); continue; }
    const s = tasks[id];
    if (!s) { problems.push(`${id}: unknown task`); continue; }
    if (s.paused_reason || s.status === 'paused') problems.push(`${id}: paused (${s.paused_reason || 'no reason recorded'})`);
    else if (s.status === 'failed' && (s.attempts || 0) >= T.MAX_ATTEMPTS) problems.push(`${id}: failed after ${s.attempts} attempts (2 retries used); escalate to the user instead of re-dispatching`);
    else if (s.status !== 'pending' && s.status !== 'failed') problems.push(`${id}: status is ${s.status}, only pending or failed tasks can be dispatched`);
    const unmet = (t.depends_on || []).filter((d) => !tasks[d] || !T.SATISFIED.includes(tasks[d].status));
    if (unmet.length) problems.push(`${id}: unmet dependencies: ${unmet.map((d) => `${d} (${tasks[d] ? tasks[d].status : 'missing'})`).join(', ')}`);
  }
  return problems;
}

module.exports = defineTool({
  name: 'task_dispatch',
  description: 'Dispatch ready tasks. Each id must be pending (or failed with attempts < 3, for a retry; the card then carries `feedback`), have all depends_on done, and not be paused; otherwise the whole call is refused and nothing is dispatched. Opens a lease on each non-inline task\'s owned_paths and returns one task card per id. Hand each card to a worker subagent (card.entry_file says what the worker reads first); the worker returns task-result JSON; pass it to task_report. Inline cards (inline:true) are done by you directly and hold no lease.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['ids'],
    properties: { ids: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 1 } } },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('task_dispatch requires a resolved session');
    const st0 = T.readTasksState(ctx.state);
    if (!st0.manifest) throw new Error('task_dispatch: no task manifest registered. Call tasks_set first.');
    const byId = new Map(st0.manifest.tasks.map((t) => [t.id, t]));
    const problems = dispatchProblems(args.ids, st0.tasks, byId);
    if (problems.length) throw new Error(`task_dispatch refused; nothing was dispatched:\n${problems.map((p) => `  - ${p}`).join('\n')}`);

    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const leases = require('../leases');
    const opened = [];
    const leaseIds = {};
    try {
      for (const id of args.ids) {
        const t = byId.get(id);
        if (t.delegate === 'inline') { leaseIds[id] = null; continue; }
        const lease = await leases.openLease(session, {
          owner: 'task', worker_type: t.worker, slices: [{ id: t.id, paths: t.owned_paths }],
          ttl_ms: T.DEFAULT_TTL_MS, meta: { task_id: t.id },
        });
        const lid = typeof lease === 'string' ? lease : (lease && (lease.id || lease.lease_id));
        leaseIds[id] = lid;
        opened.push(lid);
      }
    } catch (e) {
      for (const lid of opened) { try { await leases.closeLease(session, lid); } catch (_) { /* best effort */ } }
      throw e;
    }

    const now = new Date().toISOString();
    let next;
    try {
      next = await ctx.state.update(T.STATE_NAME, (cur) => {
        // Re-check under the state lock: a concurrent dispatch may have taken these ids since st0 was read.
        const late = dispatchProblems(args.ids, cur.tasks, byId);
        if (late.length) throw new Error(`task_dispatch refused; nothing was dispatched (state changed concurrently):\n${late.map((p) => `  - ${p}`).join('\n')}`);
        for (const id of args.ids) {
          const s = cur.tasks[id];
          cur.tasks[id] = { ...s, status: 'dispatched', lease_id: leaseIds[id], attempts: (s.attempts || 0) + 1, paused_reason: null, updated_at: now };
        }
        return cur;
      });
    } catch (e) {
      for (const lid of opened) { try { await leases.closeLease(session, lid); } catch (_) { /* best effort */ } }
      throw e;
    }
    const mirror = T.mirrorTasksMd(ctx, { ...next, manifest: st0.manifest, path: st0.path });
    const cards = args.ids.map((id) => {
      const t = byId.get(id);
      return {
        id, goal: t.goal, plan_ref: t.plan_ref, inputs: t.inputs, owned_paths: t.owned_paths, acceptance: t.acceptance,
        worker: t.worker, size: t.size, feedback: (st0.tasks[id] && st0.tasks[id].feedback) || null, lease_id: leaseIds[id], inline: t.delegate === 'inline',
        entry_file: `Entry worker: read agents/${t.worker}/modes/worker.md first`,
      };
    });
    const text = [
      `Dispatched ${cards.length} task(s): ${args.ids.join(', ')}.`,
      'Hand each card to a worker subagent (inline cards: do the work yourself). The worker returns task-result JSON; call task_report({id, result}) with it.',
      mirror.mirrored ? `TASKS.md updated (${mirror.path}).` : mirror.note,
      '', JSON.stringify({ cards }, null, 2),
    ].filter((x) => x !== undefined).join('\n');
    return { text };
  },
});
