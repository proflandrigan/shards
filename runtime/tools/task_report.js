'use strict';
const { defineTool } = require('../registry');
const T = require('../tasks');

const MAP = { done: 'reported', failed: 'failed', blocked: 'blocked' };

module.exports = defineTool({
  name: 'task_report',
  description: 'Record a worker\'s task-result for a dispatched task. `result` must match task-result.schema.json: {status: done|failed|blocked, files_changed[], check:{command, exit_code, output_excerpt}, deviations[], open_questions[]}. done becomes "reported" (still to be independently verified by you before it counts as done), failed and blocked are stored as-is. Closes the task\'s lease.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'result'],
    properties: { id: { type: 'string', minLength: 1 }, result: { type: 'object' } },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('task_report requires a resolved session');
    const st0 = T.readTasksState(ctx.state);
    if (!st0.manifest) throw new Error('task_report: no task manifest registered.');
    const s0 = st0.tasks[args.id];
    if (!s0) throw new Error(`task_report: unknown task "${args.id}"`);
    if (s0.status !== 'dispatched' && !(s0.status === 'paused' && s0.lease_id)) throw new Error(`task_report: task ${args.id} is ${s0.status}, not dispatched; dispatch it first.`);
    const v = T.validateResult(args.result);
    if (!v.ok) throw new Error(`task_report: result rejected:\n${v.errors.map((e) => `  - ${e}`).join('\n')}`);

    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    if (s0.lease_id) { try { await require('../leases').closeLease(session, s0.lease_id); } catch (_) { /* already closed/expired */ } }
    const status = MAP[args.result.status];
    const next = await ctx.state.update(T.STATE_NAME, (cur) => {
      cur.tasks[args.id] = { ...cur.tasks[args.id], status, result: args.result, updated_at: new Date().toISOString() };
      return cur;
    });
    const hookOut = await T.onDeviations(session, args.id, args.result);
    const mirror = T.mirrorTasksMd(ctx, { ...next, manifest: st0.manifest, path: st0.path });
    const st = { ...next, manifest: st0.manifest };
    const lines = [
      `Task ${args.id} recorded as ${status}.`,
      status === 'reported' ? 'Verify the acceptance check independently before treating it as done.' : null,
      args.result.deviations.length ? `Deviations: ${args.result.deviations.join('; ')}` : null,
      args.result.open_questions.length ? `Open questions: ${args.result.open_questions.join('; ')}` : null,
      `Ready now: ${T.readyIds(st).join(', ') || 'none'}`,
      mirror.mirrored ? null : mirror.note,
      hookOut ? (typeof hookOut === 'string' ? hookOut : JSON.stringify(hookOut)) : null,
    ].filter(Boolean);
    return { text: lines.join('\n') };
  },
});
