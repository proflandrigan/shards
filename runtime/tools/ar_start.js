'use strict';
// ar_start (issue #91, H1): pin the eval harness, measure the baseline noise floor, open the AR lease and
// create the research ref refs/shards/research/<project>/<run_id>. See docs/research.md.
const { defineTool } = require('../registry');
const R = require('../research');
const policy = require('../gates/policy');
const machine = require('../gates/machine');

// The plan approval for this run (gate_request plan_approval:<run_id> or plan-approval.<run_id>) and the
// budget the plan policy applies to it, raised to cover the AR budget (issue #91, bug 13).
function planBudget(ctx, run) {
  try {
    const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
    const plan = machine.listGates(session).find((g) => policy.isPlanGate(g) && policy.planRunOf(g) === run.run_id);
    if (!plan) return null;
    const { gates: g } = policy.resolveGatesConfig(ctx);
    const b = policy.effectiveBudget(session, plan, g.budget);
    return { gate: plan.id, status: plan.status, policy: g.policy || 'phase', max_gates: b.max_gates != null ? b.max_gates : policy.DEFAULT_MAX_GATES, max_minutes: b.max_minutes != null ? b.max_minutes : null };
  } catch (_) { return null; }
}

const PATHS = { type: 'array', items: { type: 'string', minLength: 1 } };

module.exports = defineTool({
  name: 'ar_start',
  description: 'Start an autonomous-research (AR) run. The runtime pins sha256 hashes of every immutable path and of the eval command, refuses if the mutable scope has uncommitted changes, snapshots the pre-loop dirty files, runs the baseline eval `repeats` times (noise floor; epsilon_abs = max(epsilon% x |baseline|, 2 sd)), opens the AR lease (writes outside mutable + the project dir are denied) and creates the research ref refs/shards/research/<project>/<run_id> whose first commit is the baseline. One active run per session. When a plan approval for the same run id exists (gate_request plan_approval: <run_id>), the plan gate budget is raised to cover this AR budget (max_gates >= iterations + 2, max_minutes >= the AR window) and reported as `plan`. Then edit mutable files and call ar_iterate for each hypothesis.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['project', 'brief_path', 'mutable', 'eval', 'budget'],
    properties: {
      project: { type: 'string', minLength: 1, description: 'Project directory (root-relative, e.g. shards/churn). Iteration logs go to <project>/experiments/iter_<N>.log.' },
      run_id: { type: 'string', minLength: 1, description: 'Run id (default ar-<UTC timestamp>).' },
      brief_path: { type: 'string', minLength: 1, description: 'The research brief (root-relative); must exist.' },
      mutable: { ...PATHS, minItems: 1, description: 'Paths or globs the loop may change.' },
      immutable: { ...PATHS, description: 'Eval harness, tests, data: hashed at start and re-checked every iteration.' },
      eval: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'direction'],
        properties: {
          command: { type: 'string', minLength: 1, description: 'Shell command run from the project root.' },
          metric_regex: { type: 'string', minLength: 1, description: 'Regex; group 1 (or the whole match) of the last match in stdout (else stderr) is the metric.' },
          json_path: { type: 'string', minLength: 1, description: 'Dotted path into JSON printed on stdout (whole stdout or its last JSON line).' },
          name: { type: 'string', minLength: 1, description: 'Metric name for trailers (default "metric").' },
          direction: { enum: ['maximize', 'minimize'] },
          timeout_s: { type: 'number', exclusiveMinimum: 0, description: 'Per-eval timeout (default 900); a timeout is a RED.' },
          repeats: { type: 'integer', minimum: 1, maximum: 20, description: 'Baseline runs (default 3).' },
        },
      },
      budget: {
        type: 'object',
        additionalProperties: false,
        required: ['iterations'],
        properties: {
          iterations: { type: 'integer', minimum: 1 },
          minutes: { type: 'number', exclusiveMinimum: 0, description: 'Wall-clock budget from ar_start.' },
        },
      },
      epsilon: { type: 'number', minimum: 0, description: 'GREEN/RED threshold in % of |baseline| (default 1); raised to 2 sd of the baseline runs.' },
      convergence: {
        type: 'object',
        additionalProperties: false,
        properties: {
          plateau_window: { type: 'integer', minimum: 1, description: 'W (default 5).' },
          diminishing_returns_pct: { type: 'number', minimum: 0, description: 'Min gain over 2W iterations in % of baseline (default 2 x epsilon_abs).' },
        },
      },
    },
  },
  async handler(args, ctx) {
    if (!ctx.sessionKey || !ctx.state) throw new Error('ar_start requires a resolved session');
    const run = await R.start(ctx, args);
    return {
      data: {
        run_id: run.run_id, ref: run.ref, lease_id: run.lease_id,
        baseline: run.baseline, noise: run.noise, epsilon_abs: run.epsilon_abs,
        lastKeptCommit: run.lastKeptCommit, preLoopDirty: run.preLoopDirty,
        pinned: Object.keys(run.hashes.immutable),
        plan: planBudget(ctx, run),
        next: 'Edit mutable files for ONE hypothesis, then call ar_iterate({hypothesis, source}). Do not run the eval or git yourself.',
      },
    };
  },
});
