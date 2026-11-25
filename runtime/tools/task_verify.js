'use strict';
// task_verify (E12.5): the lead's independent check; the only path to status "done".
const { defineTool } = require('../registry');
const T = require('../tasks');

const OUTCOMES = ['green', 'yellow', 'red'];

// AR iteration cards (task.ar; issue #91, H4 / bug 22): the outcome of the iteration, from metric_outcome (+ kept
// for a YELLOW) or derived from the ar_iterate record (ar_iteration). Returns null for a non-AR verification.
async function arOutcome(ctx, t, args, tasksState) {
  if (args.metric_outcome === undefined && args.ar_iteration === undefined && args.kept === undefined) {
    if (t.ar) throw new Error(`task_verify: task ${t.id} is an AR iteration card: call ar_iterate, then task_verify with ar_iteration=<N> (a metric RED is reverted, never failed)`);
    return null;
  }
  if (!t.ar) throw new Error(`task_verify: metric_outcome / ar_iteration / kept are only valid for an AR iteration card (task ${t.id} has no \`ar\`)`);
  let outcome = args.metric_outcome; let kept = args.kept; let iteration = args.ar_iteration; let commit = null;
  if (iteration !== undefined) {
    if (t.ar.iteration !== undefined && t.ar.iteration !== iteration) throw new Error(`task_verify: task ${t.id} is the card for iteration ${t.ar.iteration}, not ${iteration}`);
    // One iteration backs one card: the same run/branch iteration cannot be claimed by two cards.
    const sameRun = (x) => x.ar && (x.ar.run_id || null) === (t.ar.run_id || null) && (x.ar.branch || null) === (t.ar.branch || null);
    const other = ((tasksState.manifest && tasksState.manifest.tasks) || []).find((x) => x.id !== t.id && sameRun(x)
      && ((tasksState.tasks[x.id] || {}).ar_outcome || {}).iteration === iteration);
    if (other) throw new Error(`task_verify: iteration ${iteration} is already recorded on task ${other.id}`);
    const R = require('../research');
    const { run } = await R.resolveRun(ctx, t.ar.run_id, t.ar.branch);
    if (!run) throw new Error(`task_verify: AR run ${t.ar.run_id}${t.ar.branch ? ` branch ${t.ar.branch}` : ''} not found`);
    const e = (run.iterations || []).find((x) => x.n === iteration);
    if (!e) throw new Error(`task_verify: AR run ${R.keyOf(run)} has no iteration ${iteration}; call ar_iterate first`);
    if (outcome !== undefined && outcome !== e.decision) throw new Error(`task_verify: metric_outcome ${outcome} contradicts ar_iterate's record for iteration ${iteration} (${e.decision})`);
    if (kept !== undefined && kept !== e.kept) throw new Error(`task_verify: kept=${kept} contradicts ar_iterate's record for iteration ${iteration} (kept=${e.kept})`);
    outcome = e.decision; kept = e.kept; commit = e.commit || null;
  }
  if (!OUTCOMES.includes(outcome)) throw new Error('task_verify: an AR outcome needs metric_outcome (green|yellow|red) or ar_iteration');
  if (kept === undefined) {
    if (outcome === 'yellow') throw new Error('task_verify: a YELLOW outcome needs kept (true when ar_iterate kept it) or ar_iteration');
    kept = outcome === 'green';
  }
  if ((outcome === 'green' && !kept) || (outcome === 'red' && kept)) throw new Error(`task_verify: kept=${kept} is impossible for a ${outcome.toUpperCase()} iteration`);
  return { metric_outcome: outcome, result: kept ? 'kept' : 'reverted', ...(iteration !== undefined ? { iteration } : {}), ...(commit ? { commit } : {}) };
}

module.exports = defineTool({
  name: 'task_verify',
  description: 'Record the lead\'s independent verification of a "reported" task (re-run the acceptance command yourself; never trust the worker). pass=true marks the task done (unblocking dependents). pass=false stores your observed output as feedback: the task becomes failed and can be re-dispatched with that feedback (max 2 retries); after 2 retries it becomes blocked/escalated and you must stop and ask the user with a summary. Either way a row is appended to the Evidence table in the ## Validation section of <output_dir>/project-specs.md (the output_dir of the manifest path; with `scope`, that scope\'s manifest). Workstream leads under PM mode: pass the same `scope` you gave tasks_set (given by the lead contract); omit otherwise. AR iteration cards (task.ar): call ar_iterate first (it re-runs the pinned eval independently), then task_verify with ar_iteration=<N> (or metric_outcome green|yellow|red, plus kept for a YELLOW). The card becomes done with ar_outcome.result kept (GREEN, kept YELLOW) or reverted (RED, unkept YELLOW); a metric RED is never failed and never uses a retry; AR stop conditions bound the loop instead.',
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
      scope: T.SCOPE_PROP,
      check: { type: 'string', description: 'What was checked (default: the task acceptance command).' },
      metric_outcome: { enum: OUTCOMES, description: 'AR iteration cards only: the ar_iterate decision for this card.' },
      kept: { type: 'boolean', description: 'AR iteration cards only: whether ar_iterate kept the change (needed for a YELLOW given via metric_outcome).' },
      ar_iteration: { type: 'integer', minimum: 1, description: 'AR iteration cards only: the ar_iterate iteration number; the outcome is read from the run (preferred).' },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('task_verify requires a resolved session');
    const scope = T.normalizeScope(args.scope);
    const st0 = T.readTasksState(ctx.state, scope);
    if (!st0.manifest) throw new Error('task_verify: no task manifest registered.');
    const t = st0.manifest.tasks.find((x) => x.id === args.id);
    const s0 = st0.tasks[args.id];
    if (!t || !s0) throw new Error(`task_verify: unknown task "${args.id}"`);
    if (s0.status !== 'reported') throw new Error(`task_verify: task ${args.id} is ${s0.status}, not reported; only a reported task can be verified.`);

    const ar = await arOutcome(ctx, t, args, st0);
    const attempts = s0.attempts || 0;
    const retriesUsed = Math.max(0, attempts - 1);
    const escalate = !ar && !args.pass && retriesUsed >= 2;
    const status = ar || args.pass ? 'done' : (escalate ? 'blocked' : 'failed');
    const arNote = ar ? `AR ${ar.metric_outcome.toUpperCase()}: ${ar.result}${ar.iteration ? ` (iteration ${ar.iteration})` : ''}` : null;
    const file = T.appendEvidence(ctx, st0, {
      check: `${args.id}: ${t.goal}${args.check ? ` [${args.check}]` : ` [${t.acceptance.command}]`}`,
      expected: args.expected, observed: args.observed, pass: ar ? ar.result === 'kept' : args.pass, notes: [arNote, args.notes].filter(Boolean).join('; '),
    });
    const next = await ctx.state.update(T.stateNameFor(scope), (cur) => {
      const patch = { status, updated_at: new Date().toISOString() };
      if (ar) { patch.feedback = null; patch.escalated = false; patch.ar_outcome = ar; } else if (args.pass) { patch.feedback = null; patch.escalated = false; } else { patch.feedback = args.observed; if (escalate) patch.escalated = true; }
      cur.tasks[args.id] = { ...cur.tasks[args.id], ...patch };
      return cur;
    });
    const mirror = T.mirrorTasksMd(ctx, { ...next, manifest: st0.manifest, path: st0.path }, scope);
    const st = { ...next, manifest: st0.manifest };
    const lines = [
      ar
        ? `Task ${args.id} verified: ${arNote}, now done (result: ${ar.result}). Evidence row appended to ${file}.${ar.result === 'reverted' ? ' A reverted iteration is a normal AR outcome, not a failure: no retry; append the next iteration card.' : ''}`
        : `Task ${args.id} verified: ${args.pass ? 'PASS, now done' : `FAIL, now ${status}`}. Evidence row appended to ${file}.`,
      !ar && !args.pass && !escalate ? `Retry ${retriesUsed + 1} of 2: call task_dispatch({ids:["${args.id}"]}); the card carries your observed output as feedback.` : null,
      escalate ? `Task ${args.id} failed after 2 retries: blocked and escalated. Stop and ask the user, with a summary of what failed and the evidence rows.` : null,
      `Ready now: ${T.readyIds(st).join(', ') || 'none'}`,
      mirror.mirrored ? null : mirror.note,
    ].filter(Boolean);
    return { text: lines.join('\n') };
  },
});
