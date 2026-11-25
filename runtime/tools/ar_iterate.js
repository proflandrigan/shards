'use strict';
// ar_iterate (issue #91, H1/H2): the runtime evaluates, classifies and keeps or reverts one iteration.
const { defineTool } = require('../registry');
const R = require('../research');

module.exports = defineTool({
  name: 'ar_iterate',
  description: 'Evaluate one AR iteration after you edited mutable files. The runtime checks the immutable pins (a change is a tamper: RED, revert, run halts), runs the pinned eval command itself with its timeout, writes <project>/experiments/iter_<N>.log, parses the metric and classifies against the comparison reference: GREEN (better by > epsilon_abs, kept), YELLOW (within epsilon_abs, kept only if the mutable diff has net LOC < 0), RED (worse, crash, timeout or no metric; reverted). For a branch run (pass branch when several are active) the eval runs in that branch\'s worktree and the keep/revert happens there. Every iteration is committed to the research ref with AR-* trailers; a reverted one gets a revert commit and the working tree is restored to lastKeptCommit (new files the iteration created in the mutable scope are deleted). Returns {iteration, decision, metric, before, after, kept, converged, stop_reason}. When converged, call ar_end.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['hypothesis'],
    properties: {
      hypothesis: { type: 'string', minLength: 1, description: 'One testable change made in this iteration.' },
      source: { enum: ['adaptive', 'steering', 'reviewer-suggested'], description: 'Where the hypothesis came from (default adaptive).' },
      run_id: { type: 'string', minLength: 1, description: 'Default: the active run of this session.' },
      branch: { type: 'string', minLength: 1, description: 'Branch run (AR fan-out): which branch of the run. Needed when several branch runs are active.' },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('ar_iterate requires a resolved session');
    const { run, entry, outOfScope } = await R.iterate(ctx, args);
    return {
      data: {
        run_id: run.run_id, ...(run.branch ? { branch: run.branch } : {}),
        iteration: entry.n, decision: entry.decision, metric: run.eval.name,
        before: entry.before, after: entry.after, kept: entry.kept, failure: entry.failure || null,
        loc: entry.loc, epsilon_abs: run.epsilon_abs, bestSoFar: entry.bestSoFar, rebaselined: !!entry.rebaselined,
        commit: entry.commit, revert_commit: entry.revert_commit, restored: entry.restored, deleted: entry.deleted,
        tampered: entry.tampered, log: entry.log,
        budget_remaining: { iterations: Math.max(0, run.budget.iterations - run.iterations.length) },
        out_of_scope_dirty: outOfScope.length ? outOfScope : undefined,
        converged: !!run.converged, stop_reason: run.stop_reason || null,
      },
    };
  },
});
