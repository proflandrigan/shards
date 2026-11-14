'use strict';
const { defineTool } = require('../registry');
const T = require('../tasks');

module.exports = defineTool({
  name: 'task_status',
  description: 'Show the task manifest state: every task with status, worker, depends_on, lease_id, attempts and paused_reason; the `ready` list (pending tasks whose dependencies are reported or done, not paused) to pass to task_dispatch; and status counts.',
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('task_status requires a resolved session');
    const st = T.readTasksState(ctx.state);
    if (!st.manifest) return { text: 'No task manifest registered for this session. Call tasks_set first.' };
    return { data: {
      manifest_path: st.path,
      tasks: st.manifest.tasks.map((t) => { const s = st.tasks[t.id] || {}; return { id: t.id, status: s.status, worker: t.worker, depends_on: t.depends_on || [], lease_id: s.lease_id || null, attempts: s.attempts || 0, paused_reason: s.paused_reason || null }; }),
      ready: T.readyIds(st),
      counts: T.countsOf(st),
    } };
  },
});
