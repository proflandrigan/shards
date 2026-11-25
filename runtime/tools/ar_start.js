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

// The branch worktree's equivalent of the project root, project-root-relative (what card paths are prefixed with).
const workRel = (root, run) => require('path').relative(root, R.workRoot(root, run)).split(require('path').sep).join('/');

const PATHS = { type: 'array', items: { type: 'string', minLength: 1 } };
const EXTRACT = {
  metric_regex: { type: 'string', minLength: 1, description: 'Regex; group 1 (or the whole match) of the last match in stdout (else stderr) is the metric.' },
  json_path: { type: 'string', minLength: 1, description: 'Dotted path into JSON printed on stdout (whole stdout or its last JSON line).' },
};
const BUDGETED = {
  fixed_budget_s: { type: 'number', exclusiveMinimum: 0, description: 'Fixed compute budget (Karpathy mode): passed to the command as SHARDS_AR_COMPUTE_BUDGET_S; the training script must stop at it for iterations to be comparable. Without timeout_s the kill timeout is fixed_budget_s + timeout_grace_s.' },
  compute_budget_s: { type: 'number', exclusiveMinimum: 0, description: 'Alias of fixed_budget_s.' },
  timeout_grace_s: { type: 'number', minimum: 0, description: 'Seconds added to fixed_budget_s for the kill timeout (default 60).' },
};

module.exports = defineTool({
  name: 'ar_start',
  description: 'Start an autonomous-research (AR) run. The runtime pins sha256 hashes of every immutable path and of the eval command, refuses if the mutable scope has uncommitted changes, snapshots the pre-loop dirty files, runs the baseline eval `repeats` times (noise floor; epsilon_abs = max(epsilon% x |baseline|, 2 sd); likewise for an optional eval.proxy), evaluates an optional sealed holdout once on the pre-loop state (value withheld until ar_end; holdout_paths are pinned as immutable), passes eval.fixed_budget_s to the eval as SHARDS_AR_COMPUTE_BUDGET_S, opens the AR lease (writes outside mutable + the project dir are denied) and creates the research ref refs/shards/research/<project>/<run_id> whose first commit is the baseline. One active run per session, except the branch runs of one AR fan-out: with `branch` (implies worktree=true) the runtime creates a git worktree at .shards/worktrees/<run_id>/<branch> detached at HEAD (no new branch; .shards/worktrees/ is added to .git/info/exclude when not ignored), symlinks immutable paths missing there (untracked data) to the main tree, runs the eval with cwd = the worktree, scopes the AR lease to that worktree\'s mutable paths and journals to refs/shards/research/<project>/<run_id>/<branch>. Start each branch with the same run_id and its own branch name (at most 4 concurrent branches); iteration logs go to <project>/experiments/branches/<branch>/. When a plan approval for the same run id exists (gate_request plan_approval: <run_id>), the plan gate budget is raised to cover this AR budget (max_gates >= iterations + 2, max_minutes >= the AR window) and reported as `plan`. Then edit mutable files and call ar_iterate for each hypothesis.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['project', 'brief_path', 'mutable', 'eval', 'budget'],
    properties: {
      project: { type: 'string', minLength: 1, description: 'Project directory (root-relative, e.g. shards/churn). Iteration logs go to <project>/experiments/iter_<N>.log.' },
      run_id: { type: 'string', minLength: 1, description: 'Run id (default ar-<UTC timestamp>). Branch runs of one fan-out share it.' },
      branch: { type: 'string', minLength: 1, description: 'AR fan-out branch name (approach family slug, e.g. ml-xgboost). Makes this a branch run in its own git worktree.' },
      worktree: { type: 'boolean', description: 'Run in a shards-owned git worktree (.shards/worktrees/<run_id>/<branch>). Requires branch; implied by it.' },
      brief_path: { type: 'string', minLength: 1, description: 'The research brief (root-relative); must exist.' },
      mutable: { ...PATHS, minItems: 1, description: 'Paths or globs the loop may change.' },
      immutable: { ...PATHS, description: 'Eval harness, tests, data: hashed at start and re-checked every iteration.' },
      eval: {
        type: 'object',
        additionalProperties: false,
        required: ['command', 'direction'],
        properties: {
          command: { type: 'string', minLength: 1, description: 'Shell command run from the project root.' },
          ...EXTRACT,
          name: { type: 'string', minLength: 1, description: 'Metric name for trailers (default "metric").' },
          direction: { enum: ['maximize', 'minimize'] },
          timeout_s: { type: 'number', exclusiveMinimum: 0, description: 'Per-eval timeout (default 900, or fixed_budget_s + timeout_grace_s); a timeout is a RED.' },
          repeats: { type: 'integer', minimum: 1, maximum: 20, description: 'Baseline runs (default 3).' },
          ...BUDGETED,
          proxy: {
            type: 'object',
            additionalProperties: false,
            required: ['command'],
            description: 'Cheaper proxy eval (same metric name and direction). Iterations run the proxy by default; every full_every-th iteration since the last full eval runs the full eval, which judges the proxy-kept chain and unwinds it when it disagrees. The proxy gets its own noise floor and epsilon.',
            properties: {
              command: { type: 'string', minLength: 1 },
              ...EXTRACT,
              timeout_s: { type: 'number', exclusiveMinimum: 0, description: 'Default: the eval timeout_s.' },
              repeats: { type: 'integer', minimum: 1, maximum: 20, description: 'Proxy baseline runs (default eval.repeats).' },
              every: { type: 'integer', minimum: 1, description: 'Alias of eval.full_every.' },
              ...BUDGETED,
            },
          },
          full_every: { type: 'integer', minimum: 1, description: 'With proxy: run the full eval when this many iterations have passed since the last full eval (default 5).' },
        },
      },
      holdout: {
        type: 'object',
        additionalProperties: false,
        required: ['command'],
        description: 'Sealed holdout eval (same metric name and direction). Never run by ar_iterate: evaluated once on the pre-loop state at ar_start (sealed, not returned) and once on the kept state by ar_end, which returns {baseline, final, delta}. Do not read or run the holdout yourself.',
        properties: {
          command: { type: 'string', minLength: 1 },
          ...EXTRACT,
          timeout_s: { type: 'number', exclusiveMinimum: 0, description: 'Default: the eval timeout_s.' },
          baseline: { type: 'boolean', description: 'Evaluate the pre-loop state at ar_start (default true).' },
          ...BUDGETED,
        },
      },
      holdout_paths: { ...PATHS, description: 'Holdout data/split paths: pinned and immutable like `immutable`, and off-limits to the agent by intent.' },
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
        run_id: run.run_id, ...(run.branch ? { branch: run.branch, worktree: run.worktree.path, work_root: workRel(ctx.root, run), linked_immutable: run.worktree.linked } : {}),
        ref: run.ref, lease_id: run.lease_id,
        baseline: run.baseline, noise: run.noise, epsilon_abs: run.epsilon_abs,
        ...(run.eval.fixed_budget_s ? { compute_budget_s: run.eval.fixed_budget_s, timeout_s: run.eval.timeout_s } : {}),
        ...(run.proxy ? { proxy: { baseline: run.proxy.baseline, noise: run.proxy.noise, epsilon_abs: run.proxy.epsilon_abs, full_every: run.eval.full_every } } : {}),
        ...(run.holdout ? { holdout: { sealed: true, paths: run.holdout.paths, baseline_evaluated: !!run.holdout.baseline } } : {}),
        lastKeptCommit: run.lastKeptCommit, preLoopDirty: run.preLoopDirty,
        pinned: Object.keys(run.hashes.immutable),
        plan: planBudget(ctx, run),
        next: run.branch
          ? `Branch lead: dispatch ONE iteration task card to a worker (owned_paths = the mutable paths under ${workRel(ctx.root, run)}, acceptance.command = the pinned eval with acceptance.cwd = ${workRel(ctx.root, run)}), then call ar_iterate({hypothesis, source, run_id: "${run.run_id}", branch: "${run.branch}"}) and task_verify with ar_iteration. Do not run the eval or git yourself.`
          : 'Edit mutable files for ONE hypothesis, then call ar_iterate({hypothesis, source}). Do not run the eval or git yourself.',
      },
    };
  },
});
