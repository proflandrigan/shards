'use strict';
const { defineTool } = require('../registry');
const T = require('../tasks');

module.exports = defineTool({
  name: 'task_status',
  description: 'Show the task manifest state: every task with status, worker, depends_on, lease_id, attempts, paused_reason, escalated and feedback; the `ready` list (pending tasks whose dependencies are done, not paused) to pass to task_dispatch; and status counts. Workstream leads under PM mode: pass the same `scope` you gave tasks_set (given by the lead contract) to see your workstream\'s manifest; omit otherwise.',
  inputSchema: { type: 'object', additionalProperties: false, properties: { scope: T.SCOPE_PROP } },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('task_status requires a resolved session');
    const scope = T.normalizeScope(args.scope);
    const st = T.readTasksState(ctx.state, scope);
    if (!st.manifest) return { text: 'No task manifest registered for this session. Call tasks_set first.' };
    return { data: {
      manifest_path: st.path,
      tasks: st.manifest.tasks.map((t) => { const s = st.tasks[t.id] || {}; return { id: t.id, status: s.status, worker: t.worker, depends_on: t.depends_on || [], lease_id: s.lease_id || null, attempts: s.attempts || 0, paused_reason: s.paused_reason || null, escalated: !!s.escalated, feedback: s.feedback || null }; }),
      ready: T.readyIds(st),
      counts: T.countsOf(st),
    } };
  },
});
