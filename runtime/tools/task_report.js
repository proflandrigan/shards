'use strict';
const { defineTool } = require('../registry');
const T = require('../tasks');

const MAP = { done: 'reported', failed: 'failed', blocked: 'blocked' };

module.exports = defineTool({
  name: 'task_report',
  description: 'Record a worker\'s task-result for a dispatched task. `result` must match task-result.schema.json: {status: done|failed|blocked, files_changed[], check:{command, exit_code, output_excerpt}, deviations[], open_questions[]}. done becomes "reported" (not done until you verify it with task_verify), failed and blocked are stored as-is. Closes the task\'s lease. Workstream leads under PM mode: pass the same `scope` you gave tasks_set (given by the lead contract); omit otherwise.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'result'],
    properties: { id: { type: 'string', minLength: 1 }, result: { type: 'object' }, scope: T.SCOPE_PROP },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('task_report requires a resolved session');
    const scope = T.normalizeScope(args.scope);
    const st0 = T.readTasksState(ctx.state, scope);
    if (!st0.manifest) throw new Error('task_report: no task manifest registered.');
    const s0 = st0.tasks[args.id];
    if (!s0) throw new Error(`task_report: unknown task "${args.id}"`);
    if (s0.status !== 'dispatched' && !(s0.status === 'paused' && s0.lease_id)) throw new Error(`task_report: task ${args.id} is ${s0.status}, not dispatched; dispatch it first.`);
    const v = T.validateResult(args.result);
    if (!v.ok) throw new Error(`task_report: result rejected:\n${v.errors.map((e) => `  - ${e}`).join('\n')}`);

    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    let status = MAP[args.result.status];
    const escalate = status === 'failed' && (s0.attempts || 0) >= T.MAX_ATTEMPTS;
    if (escalate) status = 'blocked';
    const next = await ctx.state.update(T.stateNameFor(scope), (cur) => {
      // Re-check under the state lock: a concurrent task_report may have recorded this task since s0 was read.
      const s = cur.tasks[args.id];
      if (!s || (s.status !== 'dispatched' && !(s.status === 'paused' && s.lease_id)) || s.lease_id !== s0.lease_id || (s.attempts || 0) !== (s0.attempts || 0)) {
        throw new Error(`task_report: task ${args.id} is ${s ? s.status : 'missing'}, not dispatched (it changed concurrently); nothing was recorded.`);
      }
      cur.tasks[args.id] = { ...s, status, result: args.result, ...(escalate ? { escalated: true } : {}), updated_at: new Date().toISOString() };
      return cur;
    });
    if (s0.lease_id) { try { await require('../leases').closeLease(session, s0.lease_id); } catch (_) { /* already closed/expired */ } }
    const hookOut = await T.onDeviations(session, args.id, args.result, scope);
    const mirror = T.mirrorTasksMd(ctx, { ...next, manifest: st0.manifest, path: st0.path }, scope);
    const st = { ...next, manifest: st0.manifest };
    const lines = [
      `Task ${args.id} recorded as ${status}.`,
      status === 'reported' ? 'Verify the acceptance check independently, then call task_verify({id, pass, expected, observed}); the task is not done until you do.' : null,
      escalate ? `Task ${args.id} failed after ${s0.attempts} attempts (2 retries used): now blocked and escalated. Stop and ask the user, with a summary of what failed.` : null,
      args.result.deviations.length ? `Deviations: ${args.result.deviations.join('; ')}` : null,
      args.result.open_questions.length ? `Open questions: ${args.result.open_questions.join('; ')}` : null,
      `Ready now: ${T.readyIds(st).join(', ') || 'none'}`,
      mirror.mirrored ? null : mirror.note,
      hookOut ? (typeof hookOut === 'string' ? hookOut : JSON.stringify(hookOut)) : null,
    ].filter(Boolean);
    return { text: lines.join('\n') };
  },
});
