'use strict';
// task_verify (E12.5): the lead's independent check; the only path to status "done".
const { defineTool } = require('../registry');
const T = require('../tasks');

module.exports = defineTool({
  name: 'task_verify',
  description: 'Record the lead\'s independent verification of a "reported" task (re-run the acceptance command yourself; never trust the worker). pass=true marks the task done (unblocking dependents). pass=false stores your observed output as feedback: the task becomes failed and can be re-dispatched with that feedback (max 2 retries); after 2 retries it becomes blocked/escalated and you must stop and ask the user with a summary. Either way a row is appended to the Evidence table in the ## Validation section of <output_dir>/project-specs.md.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'pass', 'expected', 'observed'],
    properties: {
      id: { type: 'string', minLength: 1 },
      pass: { type: 'boolean' },
      expected: { type: 'string', minLength: 1 },
      observed: { type: 'string', minLength: 1 },
      notes: { type: 'string' },
      check: { type: 'string', description: 'What was checked (default: the task acceptance command).' },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('task_verify requires a resolved session');
    const st0 = T.readTasksState(ctx.state);
    if (!st0.manifest) throw new Error('task_verify: no task manifest registered.');
    const t = st0.manifest.tasks.find((x) => x.id === args.id);
    const s0 = st0.tasks[args.id];
    if (!t || !s0) throw new Error(`task_verify: unknown task "${args.id}"`);
    if (s0.status !== 'reported') throw new Error(`task_verify: task ${args.id} is ${s0.status}, not reported; only a reported task can be verified.`);

    const attempts = s0.attempts || 0;
    const retriesUsed = Math.max(0, attempts - 1);
    const escalate = !args.pass && retriesUsed >= 2;
    const status = args.pass ? 'done' : (escalate ? 'blocked' : 'failed');
    const file = T.appendEvidence(ctx, st0, {
      check: `${args.id}: ${t.goal}${args.check ? ` [${args.check}]` : ` [${t.acceptance.command}]`}`,
      expected: args.expected, observed: args.observed, pass: args.pass, notes: args.notes,
    });
    const next = await ctx.state.update(T.STATE_NAME, (cur) => {
      const patch = { status, updated_at: new Date().toISOString() };
      if (args.pass) { patch.feedback = null; patch.escalated = false; } else { patch.feedback = args.observed; if (escalate) patch.escalated = true; }
      cur.tasks[args.id] = { ...cur.tasks[args.id], ...patch };
      return cur;
    });
    const mirror = T.mirrorTasksMd(ctx, { ...next, manifest: st0.manifest, path: st0.path });
    const st = { ...next, manifest: st0.manifest };
    const lines = [
      `Task ${args.id} verified: ${args.pass ? 'PASS, now done' : `FAIL, now ${status}`}. Evidence row appended to ${file}.`,
      !args.pass && !escalate ? `Retry ${retriesUsed + 1} of 2: call task_dispatch({ids:["${args.id}"]}); the card carries your observed output as feedback.` : null,
      escalate ? `Task ${args.id} failed after 2 retries: blocked and escalated. Stop and ask the user, with a summary of what failed and the evidence rows.` : null,
      `Ready now: ${T.readyIds(st).join(', ') || 'none'}`,
      mirror.mirrored ? null : mirror.note,
    ].filter(Boolean);
    return { text: lines.join('\n') };
  },
});
