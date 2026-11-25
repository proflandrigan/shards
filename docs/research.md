# Autonomous research runtime (`ar_*` tools)

Issue #91, H1 to H5. The runtime owns the `[AR]` loop's bookkeeping: it runs the eval command, parses the metric, classifies each iteration, keeps or reverts the mutable scope and journals every iteration in git. The agent proposes hypotheses and edits mutable files. It never reports a metric and never runs git to keep or revert. The protocol is in [`core/protocols/autonomous_research.md`](../core/protocols/autonomous_research.md). The manual path there is a fallback for hosts without the runtime.

Code: `runtime/research/index.js`, tools `runtime/tools/ar_start.js`, `ar_iterate.js`, `ar_status.js`, `ar_defer.js`, `ar_end.js`, CLI `cli/commands/research.js`. Tests: `test/ar-tools.test.js` (including branch runs), `test/ar-lease-enforcement.test.js` (lease, worktree scope, git guard), `test/tasks-verify.test.js` (AR iteration cards), `test/gates-policy.test.js` (`requires_human`, plan budget).

## Tools

### `ar_start`

```
ar_start({
  project,                 // project dir, root-relative (shards/churn). Logs go to <project>/experiments/
  run_id?,                 // default ar-<UTC timestamp>; [A-Za-z0-9._-], max 64
  branch?,                 // AR fan-out branch (approach-family slug): a branch run in its own worktree
  worktree?,               // true: run in .shards/worktrees/<run_id>/<branch> (requires branch; implied by it)
  brief_path,              // research brief; must exist
  mutable: [...],          // paths or globs the loop may change (required; may not cover the project dir or .shards/)
  immutable?: [...],       // eval harness, tests, data
  eval: {
    command, metric_regex | json_path, name?, direction: "maximize"|"minimize",
    timeout_s? (900, or fixed_budget_s + timeout_grace_s), repeats? (3),
    fixed_budget_s? | compute_budget_s?, timeout_grace_s? (60),         // fixed compute budget (H5)
    proxy?: { command, metric_regex | json_path, timeout_s?, repeats?, fixed_budget_s?, every? },  // bug 8
    full_every? (5)                                                     // with proxy only
  },
  holdout?: { command, metric_regex | json_path, timeout_s?, baseline? (true), fixed_budget_s? },  // sealed (H5)
  holdout_paths?: [...],   // holdout split: pinned + immutable + off-limits by intent
  budget: { iterations, minutes? },
  epsilon?,                // % of |baseline|, default 1
  convergence?: { plateau_window? (5), diminishing_returns_pct? }
})
```

The call does the following, in order:

1. Refuses when this session already has an active AR run or AR lease, except a sibling branch run of the same `run_id` (see [Fan-out](#fan-out-branch-runs-and-worktrees-h4)).
2. Refuses when a mutable path has uncommitted changes, because a revert would overwrite them. Every other dirty path is recorded in `preLoopDirty`, and reverts never touch those paths.
3. Pins sha256 hashes. Each immutable file is hashed by its bytes. A directory or glob is hashed as the sorted list of (path, sha) pairs of its files, ignored files included. The eval command string is hashed too.
4. Runs the baseline eval `repeats` times. Every run must exit 0 and print a metric. The noise floor is the mean and sample standard deviation of those runs. `epsilon_abs = max(epsilon% × |baseline|, 2σ)`. With `eval.proxy`, the proxy is measured the same way (`proxy.repeats`, default `eval.repeats`) and gets its own baseline, noise and `epsilon_abs`. With a `holdout` (and `baseline` not false), the holdout runs once on the pre-loop state and its value is sealed (see [Sealed holdout](#sealed-holdout-h5)).
5. Opens the AR lease ([`delegation.md`](delegation.md) §5.1). It allows `project` plus the mutable globs and denies writes to immutable paths.
6. Creates the research ref and makes its first commit, the baseline.
7. Records `lastKeptCommit = lastGreenCommit = pre-loop HEAD` and `comparisonReference = baseline`.

If a plan approval exists for the same run id (`gate_request` with `plan_approval: "<run_id>"`, or the gate `plan-approval.<run_id>`), the result's `plan` field reports that gate and the budget the `plan` policy applies to it. See [Plan budget](#plan-budget-derived-from-the-ar-budget).

### `ar_iterate({hypothesis, source?, run_id?, branch?})`

Call it after editing mutable files for one hypothesis. `source` is `adaptive` (the default), `steering` or `reviewer-suggested`.

1. **Tamper check.** The runtime re-hashes the immutable paths (holdout paths included) and the eval, proxy and holdout commands. Any change makes the iteration a RED with `failure: tamper`. The eval does not run, the iteration is reverted and the run halts with `stop_reason: tamper`. The check runs again right after the eval, so code that rewrites an immutable file while the eval runs gets the same RED and halt instead of a kept result.
2. **Eval.** The runtime runs the pinned command through the shell from the project root. The command gets `SHARDS_AR_RUN`, `SHARDS_AR_ITER` and `SHARDS_AR_EVAL` (`full|proxy|holdout`) in its environment, plus `SHARDS_AR_COMPUTE_BUDGET_S` with a fixed compute budget, and runs under `timeout_s`. With a proxy, the eval that runs is chosen per [Proxy and full evals](#proxy-and-full-evals-bug-8). On timeout the whole process group is killed. The stdout and stderr tails go to `<project>/experiments/iter_<N>.log`.
   - `metric_regex` reads group 1, or the whole match if the regex has no group, of the last match in stdout. If stdout has no match, it reads stderr.
   - `json_path` (`a.b[0]`, an optional `$.` prefix) is read from stdout when stdout parses as JSON as a whole, else from the last line of stdout that does.
3. **Classify against `comparisonReference`.**
   - GREEN: better by more than `epsilon_abs` in `direction`.
   - YELLOW: within `±epsilon_abs`.
   - RED: worse by more than `epsilon_abs`, or a crash (non-zero exit), a timeout, or no parseable metric (`failure: crash|timeout|parse`).
4. **Keep rule.** A GREEN is kept. A YELLOW is kept only when the net LOC delta of the mutable diff is below 0. The runtime computes that delta with `git diff --numstat` between the lastKept tree and the iteration tree, so untracked files count. A RED is never kept.
5. **Journal, then act.** The iteration commit goes on the research ref first, whether or not it is kept. Its tree is the lastKept tree plus the iteration's mutable changes.
   - Not kept: the working tree's mutable scope is restored to `lastKeptCommit`. Files are written from a temporary index with `checkout-index`. Files that the iteration created inside the mutable globs, and that are not in `preLoopDirty`, are deleted by explicit path. Then a revert commit (tree = lastKept tree, `AR-Revert: <sha>`) goes on the ref, so the RED's diff stays inspectable.
   - Kept: `lastKeptCommit` moves to the iteration commit, and for a GREEN so does `lastGreenCommit`. A GREEN also moves `comparisonReference` to its value. The pointers move only after the commit exists.
   - Three kept YELLOWs in a row re-baseline: `comparisonReference` becomes the latest measured value and the commit gets `AR-Rebaseline: true`. That value is a runtime measurement of the kept state, so the "eroded" branch of protocol §C.2 cannot occur here.
6. **Defensive scope check.** Dirty paths outside the mutable scope, the project dir, `.shards/` and `preLoopDirty` are returned as `out_of_scope_dirty`. They are reported, never cleaned.
7. **Stop check**, in this order. The first condition that fires names `stop_reason`:
   1. `tamper`.
   2. `error-limit`: three consecutive failures. If all three were timeouts the reason is `timeout-limit`.
   3. After the activation floor `max(10, 0.2 × budget)`:
      - `plateau`: no GREEN in the last W iterations.
      - `diminishing-returns`: `bestSoFar` gained less than the threshold over 2W iterations, measured over every iteration. The threshold defaults to `2 × epsilon_abs`.
   4. `budget-exhausted`: the iteration count reached the budget.
   5. `time-budget`: `budget.minutes` has elapsed since `ar_start`.

   Once a stop reason fires, `ar_iterate` refuses until `ar_end`.

The call returns `{iteration, decision, metric, eval_type, before, after, kept, failure, loc, bestSoFar, commit, revert_commit, restored, deleted, log, budget_remaining, converged, stop_reason}`, plus `proxy_reference`, `unwound` and `lastFullCommit` in proxy mode. `full: true` forces a full eval (proxy mode only).

The runtime does not decide `consecutive-failures` (protocol §E.5: three REDs). That stop needs a reviewer consult first. After the consult the agent calls `ar_end` with that reason, or carries on after a `REDIRECT`.

### Proxy and full evals (bug 8)

With `eval.proxy`, iterations run the proxy by default. Iteration N runs the full eval when `N - (last full-eval iteration) >= full_every` (`proxy.every` is an alias), or when `ar_iterate` gets `full: true`; the result's `eval_type` and the `AR-Eval` trailer say which ran.

- A **proxy** iteration is classified against `proxyReference` with the proxy `epsilon_abs`, and the keep rule and revert target are as usual (`lastKeptCommit`). A GREEN (or a proxy re-baseline) moves `proxyReference`; `comparisonReference` and `bestSoFar` stay on the full scale and do not move.
- A **full** iteration is classified against `comparisonReference`, the full metric of the last full-verified kept state `lastFullCommit`. It judges the unit "proxy-kept chain since `lastFullCommit` + this change": the YELLOW LOC rule uses the diff from `lastFullCommit`, and a revert goes to `lastFullCommit`.
  - Kept: `lastFullCommit` (and `lastKeptCommit`) move to it, the full reference moves on a GREEN, and the runtime runs the proxy once on the new state (appended to the iteration log) to re-anchor `proxyReference`.
  - Not kept while proxy-kept iterations are pending: **unwind**. The mutable scope is restored to `lastFullCommit` with the revert helper, the chain's entries get `unwound: true`, `lastKeptCommit`/`lastGreenCommit` move back, `proxyReference` resets to its value at `lastFullCommit`, and the revert commit carries `AR-Unwind: <n,n,...>` and `AR-Revert: <lastFullCommit>`.
- Unwound GREENs do not count as GREENs for the plateau check. `ar_defer` retro-reverts move `lastFullCommit` back too.
- `ar_status` reports `proxy: {baseline, noise, epsilon_abs, reference, full_every, lastFullCommit, unverified_kept}`. `unverified_kept` lists proxy-kept iterations no full eval has confirmed yet; when the run stops with some pending, a final `ar_iterate({full: true})` (with no edit) settles them before `ar_end`, budget permitting.

Every iteration commit in proxy mode carries `AR-Proxy-Best` (the proxy reference after it), so a rebuild from the ref restores `proxyReference`, `lastFullCommit` and the unwound marks.

### `ar_status({run_id?, branch?, resume?})`

Returns the run summary: iterations, decision counts, baseline and noise, `epsilon_abs`, `comparisonReference`/`bestSoFar`, both pointers, remaining budget (iterations and minutes), `converged`/`stop_reason`, whether the lease is active, the pending `deferred` decisions, and the last 10 iterations.

The run is looked up in this session's state first. If the state is missing (a new session, or lost context), the run is rebuilt from the research ref. The rebuild uses `git log --first-parent --format=%(trailers:only,unfold) <AR-Base>..<ref>`: the baseline's `AR-Config` trailer supplies the configuration, and the iteration trailers supply the history. `resume: true` makes the run this session's active run and reopens its AR lease, so `ar_iterate` can continue.

### `ar_defer({run_id?, branch?, kind, detail, retro_to_iteration?})`

The deferred-decision queue (bug 14). On an unattended or overnight run, a decision that needs a human must not idle the loop until morning. `kind` is `retro_revert`, `pause`, `floor_breach` or `other`.

1. Commits a `needs-human` entry on the research ref: `AR-Decision: needs-human`, `AR-Needs-Human: <kind>`, `AR-Detail: <detail>`. Its tree is the tip tree.
2. For `retro_revert` with `retro_to_iteration: M` (1..N), the runtime first restores the mutable scope to the kept state in force when iteration M started. That is the last kept iteration before M that an earlier retro-revert did not invalidate, or the pre-loop HEAD. It uses the same revert helper as `ar_iterate`, so files the loop created are deleted and `preLoopDirty` is untouched. The commit's tree is that kept tree, with `AR-Retro-To: M` and `AR-Revert: <sha>`. `lastKeptCommit`, `lastGreenCommit` and `comparisonReference`/`bestSoFar` move back to it, and kept iterations from M on are marked `retroInvalidated`.
3. Appends `{id, kind, detail, at_iteration, commit, status: "pending", retro_to_iteration?, revert_to?}` to the run's `deferred[]`.

No gate is raised and the loop continues: the next `ar_iterate` is N+1. `ar_status` and `ar_end` list the pending items, and the Phase 3 gate (always human, see below) presents them for the user to confirm or reject. A rejected retro-revert is undone by restoring the reverted iterations from their commits on the ref. The rebuild from the ref replays `needs-human` commits, so the queue and the moved pointers survive context loss. Attended runs keep the protocol's blocking gate.

`ar_defer` is an exec tool for the hooks, like `ar_iterate`, because a retro-revert rewrites mutable files.

### `ar_end({run_id?, branch?, reason, keep_worktree?, skip_holdout?})`

With a sealed holdout it first evaluates the kept state once (see below). Then it puts a final commit on the ref with `AR-Decision: stop` and `AR-Stop: <reason>`. Then it closes the AR lease (a branch run only leaves the shared lease; the last branch closes it) and marks the run `ended`. A branch run's worktree is removed unless `keep_worktree: true`, and the result carries `promote`, the command that applies the kept diff to the main tree at the Phase 3 gate. It returns the summary, including the pending `deferred` items for the Phase 3 gate, plus the commands to inspect the kept diff and the journal.

### Sealed holdout (H5)

`holdout` is a second eval command (same metric name and direction) over a split the loop must never see, and `holdout_paths` are that split's files.

- `holdout_paths` are added to the immutable list: pinned at `ar_start`, re-checked every iteration (a change is a `tamper`), and listed as immutable in the AR lease, so writes are denied. A mutable entry may not overlap them. The holdout command is pinned too.
- `ar_start` runs the holdout once on the pre-loop state (skip with `holdout.baseline: false`). The value goes to `.shards/state/research-sealed/<project-slug>/<run_id>[/<branch>].json` and its log next to it. It is not returned, not written to `experiments/` and not in the research ref (`AR-Config` holds only the holdout configuration).
- `ar_iterate` never runs it. `ar_status` shows `holdout: {sealed: true, paths}` until the run has ended.
- `ar_end` checks the holdout pins (on a change it does not run the holdout and reports `tampered`), restores the mutable scope to `lastKeptCommit` if it has edits no `ar_iterate` journaled (reported as `end_restored`), runs the holdout once on that kept state (a branch run: in its worktree, recreated first if missing, before it is removed), writes `<logdir>/holdout.log` and returns `holdout: {metric, direction, baseline, final, delta}` with `delta = final - baseline`. The stop commit gets `AR-Holdout: <name>=<baseline>-><final> (delta <d>)`, or `skipped` (`skip_holdout: true`), `tampered (<paths>)`, or `... (failed: crash|timeout|parse)`. A rebuild of an ended run parses it back into `holdout_result`.

The seal is by intent: the agent can still read the holdout files or the sealed file. The protocol (§G.11) forbids it; the hash pin catches edits, not reads.

### Fixed compute budget (H5)

`eval.fixed_budget_s` (alias `compute_budget_s`) is a training budget, not just a kill switch. Every eval gets `SHARDS_AR_COMPUTE_BUDGET_S=<seconds>`, and without an explicit `timeout_s` the kill timeout is `fixed_budget_s + timeout_grace_s` (default 60). An explicit `timeout_s` must exceed the budget. It is recorded in `AR-Config` and reported by `ar_start`/`ar_status` as `compute_budget_s`. Iterations are only comparable if the training script reads the variable and stops when the budget is spent; a script that ignores it is killed at the timeout (a timeout RED). `eval.proxy` and `holdout` take their own `fixed_budget_s`; they inherit only the eval's `timeout_s` as their default timeout.

## Research ref

```
refs/shards/research/<project-slug>/<run_id>            # solo run; project-slug = last segment of `project`
refs/shards/research/<project-slug>/<run_id>/<branch>   # branch run (fan-out); a run id is either solo or branched
```

The ref is built with plumbing: a temporary `GIT_INDEX_FILE`, then `read-tree`, `update-index`, `write-tree`, `commit-tree`, and finally `update-ref` with an expected old value. This is the same machinery as `refs/shards/pending/*` in `runtime/git`. The user's HEAD, branch and index are never touched.

History follows the first parent:

| Commit | Parent | Tree | Key trailers |
|---|---|---|---|
| baseline | pre-loop HEAD | HEAD tree | `AR-Iter: 0`, `AR-Decision: baseline`, `AR-Config: {json}` |
| iteration N | previous tip | lastKept tree + mutable changes | `AR-Decision: green\|yellow\|red`, `AR-Kept`, `AR-Best`, `AR-LOC`, `AR-Failure?`, `AR-Hypothesis` |
| revert N (not kept) | iteration N | lastKept tree (an unwind: lastFull tree) | `AR-Revert: <sha>`, `AR-Unwind?: <n,...>` |
| needs-human (`ar_defer`) | tip | tip tree, or the kept tree before M for a retro-revert | `AR-Decision: needs-human`, `AR-Needs-Human: <kind>`, `AR-Detail`, `AR-Retro-To?`, `AR-Revert?` |
| stop | tip | tip tree | `AR-Decision: stop`, `AR-Stop: <reason>`, `AR-Holdout?` |

Every commit carries these trailers:

- `AR-Run`
- `AR-Branch` (branch runs only)
- `AR-Iter: N`
- `AR-Decision`
- `AR-Metric: <name>=<before>-><after>` (`NA` when there is no value)
- `AR-Eval: full|proxy`
- `AR-Hypothesis-Source`
- `AR-Base: <pre-loop HEAD>`

Useful commands:

```bash
git log --format='%h %s%n%(trailers:only)' <AR-Base>..refs/shards/research/<p>/<run>   # the journal
git show <iteration sha>                                                                # a RED's diff, kept forever
git diff <pre-loop HEAD> <lastKeptCommit> -- <mutable>                                  # what the run kept
```

`results.json` is a derived view of this ref. The agent may still write it for the Phase 3 summary, but the ref and the runtime state are the source of truth.

## State

The run state lives in `.shards/state/sessions/<key>/research.json` as `{active: key|null, runs: {<key>: run}}`, where `key` is `run_id` (solo) or `<run_id>/<branch>`. Each run holds:

- the configuration, the hashes and `preLoopDirty`
- branch runs: `branch` and `worktree: {path, prefix, linked}` (`linked`: immutable entries symlinked from the main tree)
- `baseline`, `noise`, `epsilon_abs`; with a proxy, `proxy: {..., baseline, noise, epsilon_abs}`, `proxyReference`, `lastFullCommit`, `lastFullIter`, `anchorProxy`
- `holdout` (configuration only) and, after `ar_end`, `holdout_result`; the sealed baseline value is not in session state
- `comparisonReference`, `bestSoFar`, `lastKeptCommit`, `lastGreenCommit`, and the ref `tip`
- `deferred[]`: the `ar_defer` queue
- `iterations[]`, plus the counters derived from them: `consecutiveRegressions`, `consecutiveFailures`, `consecutiveTimeouts`, `consecutiveYellowKept`, `iterationsSinceLastGreen`
- `status` (`active|converged|ended`) and `stop_reason`

`shards_status` reports a brief `arRun`. `sessions_resume` reports the AR run of the session it looks up, with a hint to call `ar_status({run_id, resume: true})`.

## Hooks

`ar_start`, `ar_iterate` and `ar_defer` count as exec tools in `hooks/lib/writes.js`. A pending gate blocks them, like scripts and notebook execution. They are not write-checked, because the runtime confines their writes to the mutable scope and `<project>/experiments/`.

## Unattended runs (H3)

### `requires_human` gates

`gate_request` takes `requires_human: true`. Such a gate is never turned into a notice under `plan`, never auto-recorded as evidence under `phase`, and always goes to the human tiers (elicitation, host prompt, verbatim chat reply). The flag sticks to the gate when it is re-requested. Every AR agent's Phase 3 adoption gate passes it, via `{{gate ... requires_human=true}}` ([`build/MACROS.md`](../build/MACROS.md) §3.8). So a plan approval can carry an overnight loop, but it can never adopt the results. As a backstop, once every run of the plan's run id has ended the plan stops covering gates, so an adoption gate requested without the flag still waits for a human.

### Plan budget derived from the AR budget

Under the `plan` policy the notice budget is `gates.budget` (`max_gates`, default 100; `max_minutes`), counted per plan approval. When the plan approval's run id (`plan_run`, or the suffix of `plan-approval.<run>`) is an AR run in this session's research state, `runtime/gates/policy.js` (`effectiveBudget`) raises it. It never lowers it:

- `max_gates` becomes at least `budget.iterations + 2`.
- `max_minutes`, when configured, becomes at least the time from the plan approval to `ar_start`, plus `budget.minutes`, plus 30 minutes and one eval timeout of slack. That covers the wrap-up gates after a `time-budget` stop. With no `max_minutes`, there is no time limit.

So use the same id for `plan_approval` and `ar_start`'s `run_id`. Until `ar_start` runs, the configured budget applies.

### Enforced budgets

The runtime enforces the iteration budget, the wall-clock `budget.minutes` and the per-eval `timeout_s` (derived from a fixed compute budget when one is set). Token and dollar ceilings in the brief are advisory: the agent cannot observe its own usage (protocol §G.5).

### Running overnight

AR state lives in the runtime and in git, not in the model's context. A driver only has to keep starting turns until the run is done. Each fresh turn picks the run up with `ar_status({resume: true})`.

`shards research status [--run <id>] [--session <key>] [--json] [--root <dir>]` prints the run (default: the newest active run, else the newest), with `done: true` once it has converged or ended, or once a stop condition is already due. It reads session state from any session and falls back to rebuilding from the research ref. It exits 1 when no run is found.

A shell driver around a headless host, for example Claude Code:

```bash
RUN=churn-ar-20261125T2200
done_() { shards research status --run "$RUN" --json | node -e 'process.exit(JSON.parse(require("fs").readFileSync(0)).done ? 0 : 1)'; }
until done_; do
  claude -p "Continue the autonomous-research run $RUN: call ar_status({run_id: \"$RUN\", resume: true}), then keep iterating per the protocol until it converges or this turn ends." \
    --permission-mode acceptEdits
  sleep 5
done
claude -p "AR run $RUN is done: call ar_end with the stop reason and prepare the Phase 3 summary (do not adopt anything)."
```

Headless turns cannot answer permission prompts, so pre-allow the shards MCP tools and the eval's shell needs first (`shards install --permissions`, or the host's own allowlist). Otherwise a turn stops at the first prompt. For Codex, use `codex exec "<same prompt>"` with a profile that has the shards MCP server. The Phase 1 plan approval and the Phase 3 adoption gate stay interactive. Start the loop only after the plan is approved, and come back for Phase 3.

Fallback heartbeat: inside an interactive session, the host's own recurring prompt (Claude Code `/loop`, or a scheduled wakeup) can re-issue the same "continue run $RUN" prompt on an interval. Prefer the shell loop for long runs, because every turn starts with a fresh context and nothing depends on one context surviving 100 iterations.

During the run, decisions that need a human go to `ar_defer`, not to gates. The steering notes in the research brief still work, and a `STOP` there ends the run at the next iteration.

## Fan-out: branch runs and worktrees (H4)

An AR fan-out runs one **branch run** per approach family. All branch runs share one `run_id`; each has its own `branch` name. The protocol (`autonomous_research.md` §H) puts each branch under a lead → worker model, like Syn's PM mode:

```
initiator (Syn or the specialist) — every user gate
 └─ AR branch lead per family (depth 1, lead_contract: no gates, consults allowed)
     └─ <specialist> worker per iteration card (depth 2, worker_contract)
```

The lead writes no code. Each iteration is a task card (`tasks_set`, then `tasks_set` with `append: true`) with `owned_paths` = the branch's mutable paths inside its worktree, `acceptance.command` = the pinned eval, `acceptance.cwd` = the worktree and `ar: {run_id, branch, iteration, hypothesis}`. After `task_report`, the lead calls `ar_iterate` (the runtime re-runs the eval independently), then `task_verify` with `ar_iteration`. Cards of one branch depend on each other (`max_parallel` 1 per branch); at most 4 branch runs are active per run id.

What `ar_start({branch})` does differently:

1. Creates `.shards/worktrees/<run_id>/<branch>` with `git worktree add --detach` at the pre-loop HEAD. No branch is created and the user's checkout never moves (ADR 0005). If no ignore rule covers `.shards/worktrees/`, it appends `/<prefix>.shards/worktrees/` to the repo-local `info/exclude`.
2. Symlinks every immutable entry the worktree lacks (untracked or ignored data, local config) to the main tree's copy. Those entries are pinned at the main tree, so editing the source is a tamper. Globs are not linked: list untracked inputs as plain paths.
3. Refuses when the mutable or a (not linked) immutable scope has uncommitted changes in the main tree, because the worktree starts from HEAD and would not see them.
4. Runs the baseline (and every later eval) with `cwd` = the worktree and `SHARDS_AR_BRANCH`, `SHARDS_AR_WORKTREE`, `SHARDS_AR_MAIN_ROOT` in the environment. Logs go to `<project>/experiments/branches/<branch>/iter_<N>.log` in the main tree.
5. Opens the run's AR lease, or joins it when a sibling branch already holds it. The lease keeps `ar.branches.<branch> = {root, mutable, immutable}` with every entry prefixed by the worktree path; its top-level `mutable` is the union of the branches' prefixed entries, and `immutable` is the main-tree list plus every branch's prefixed list.
6. Journals to `refs/shards/research/<project>/<run_id>/<branch>` (refs are shared by all worktrees; the worktree's own HEAD and index never move).

Selection: `ar_iterate`, `ar_defer` and `ar_end` need `branch` when several branch runs are live. `ar_status({run_id})` without `branch` returns `{branched: true, leaderboard, branches}`: every branch, rebuilt from its ref when it is not in this session's state, ranked by `bestSoFar`. Arbitration reads this and the refs' trailers, not prose reports. `ar_status({run_id, branch, resume: true})` recreates a missing worktree and restores its kept state before reopening the lease.

Guard: writes inside `.shards/worktrees/` must match a branch's prefixed mutable scope; the `.shards/` state allowance does not cover them, and the main tree's mutable paths are not writable while branch runs are active. `git worktree add/remove/move/prune/repair` is denied to agents; the runtime runs git itself. A plan approval for the run id covers the largest branch budget.

Plain `branch-dir` remains only as the `no-vcs` fallback for git-less projects (manual path).

## Promotion

Solo run: kept state stays uncommitted in the user's working tree, and the Phase 3 convergence gate (always human) adopts it. Branch runs: the kept state of each branch is `lastKeptCommit` on its ref. After arbitration the user picks the winner at the human gate, and the initiator applies the winner's `promote` command from `ar_end` in the main tree (`git diff --binary <pre-loop HEAD> <lastKeptCommit> -- <mutable> | git apply`); the Phase 3 adoption gate commits it. Nothing merges a research ref into a user branch. Today the git binding's gate commit (`commitGate`) commits only the agent's output dirs and gate `targets`, so pass the mutable paths as `targets`. A dedicated promote helper (one commit per kept GREEN, via `commitGate` with the denylist and pre-commit hook) is deferred.
