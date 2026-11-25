# Autonomous research runtime (`ar_*` tools)

Issue #91, H1 and H2. The runtime owns the `[AR]` loop's bookkeeping: it runs the eval command, parses the metric, classifies each iteration, keeps or reverts the mutable scope and journals every iteration in git. The agent proposes hypotheses and edits mutable files. It never reports a metric and never runs git to keep or revert. The protocol is in [`core/protocols/autonomous_research.md`](../core/protocols/autonomous_research.md). The manual path there is a fallback for hosts without the runtime.

Code: `runtime/research/index.js`, tools `runtime/tools/ar_start.js`, `ar_iterate.js`, `ar_status.js`, `ar_end.js`. Tests: `test/ar-tools.test.js`.

## Tools

### `ar_start`

```
ar_start({
  project,                 // project dir, root-relative (shards/churn). Logs go to <project>/experiments/
  run_id?,                 // default ar-<UTC timestamp>; [A-Za-z0-9._-], max 64
  brief_path,              // research brief; must exist
  mutable: [...],          // paths or globs the loop may change (required)
  immutable?: [...],       // eval harness, tests, data
  eval: { command, metric_regex | json_path, name?, direction: "maximize"|"minimize", timeout_s? (900), repeats? (3) },
  budget: { iterations, minutes? },
  epsilon?,                // % of |baseline|, default 1
  convergence?: { plateau_window? (5), diminishing_returns_pct? }
})
```

The call does the following, in order:

1. Refuses when this session already has an active AR run or AR lease.
2. Refuses when a mutable path has uncommitted changes, because a revert would overwrite them. Every other dirty path is recorded in `preLoopDirty`, and reverts never touch those paths.
3. Pins sha256 hashes. Each immutable file is hashed by its bytes. A directory or glob is hashed as the sorted list of (path, sha) pairs of its files, ignored files included. The eval command string is hashed too.
4. Runs the baseline eval `repeats` times. Every run must exit 0 and print a metric. The noise floor is the mean and sample standard deviation of those runs. `epsilon_abs = max(epsilon% × |baseline|, 2σ)`.
5. Opens the AR lease ([`delegation.md`](delegation.md) §5.1). It allows `project` plus the mutable globs and denies writes to immutable paths.
6. Creates the research ref and makes its first commit, the baseline.
7. Records `lastKeptCommit = lastGreenCommit = pre-loop HEAD` and `comparisonReference = baseline`.

### `ar_iterate({hypothesis, source?})`

Call it after editing mutable files for one hypothesis. `source` is `adaptive` (the default), `steering` or `reviewer-suggested`.

1. **Tamper check.** The runtime re-hashes the immutable paths and the eval command. Any change makes the iteration a RED with `failure: tamper`. The eval does not run, the iteration is reverted and the run halts with `stop_reason: tamper`.
2. **Eval.** The runtime runs the pinned command through the shell from the project root. The command gets `SHARDS_AR_RUN` and `SHARDS_AR_ITER` in its environment and runs under `timeout_s`. On timeout the whole process group is killed. The stdout and stderr tails go to `<project>/experiments/iter_<N>.log`.
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

The call returns `{iteration, decision, metric, before, after, kept, failure, loc, bestSoFar, commit, revert_commit, restored, deleted, log, budget_remaining, converged, stop_reason}`.

The runtime does not decide `consecutive-failures` (protocol §E.5: three REDs). That stop needs a reviewer consult first. After the consult the agent calls `ar_end` with that reason, or carries on after a `REDIRECT`. Proxy evals are not supported yet, so every runtime eval is `AR-Eval: full`.

### `ar_status({run_id?, resume?})`

Returns the run summary: iterations, decision counts, baseline and noise, `epsilon_abs`, `comparisonReference`/`bestSoFar`, both pointers, remaining budget (iterations and minutes), `converged`/`stop_reason`, whether the lease is active, and the last 10 iterations.

The run is looked up in this session's state first. If the state is missing (a new session, or lost context), the run is rebuilt from the research ref. The rebuild uses `git log --first-parent --format=%(trailers:only,unfold) <AR-Base>..<ref>`: the baseline's `AR-Config` trailer supplies the configuration, and the iteration trailers supply the history. `resume: true` makes the run this session's active run and reopens its AR lease, so `ar_iterate` can continue.

### `ar_end({run_id?, reason})`

Puts a final commit on the ref with `AR-Decision: stop` and `AR-Stop: <reason>`. Then it closes the AR lease and marks the run `ended`. It returns the summary plus the commands to inspect the kept diff and the journal.

## Research ref

```
refs/shards/research/<project-slug>/<run_id>      # project-slug = last segment of `project`
```

The ref is built with plumbing: a temporary `GIT_INDEX_FILE`, then `read-tree`, `update-index`, `write-tree`, `commit-tree`, and finally `update-ref` with an expected old value. This is the same machinery as `refs/shards/pending/*` in `runtime/git`. The user's HEAD, branch and index are never touched.

History follows the first parent:

| Commit | Parent | Tree | Key trailers |
|---|---|---|---|
| baseline | pre-loop HEAD | HEAD tree | `AR-Iter: 0`, `AR-Decision: baseline`, `AR-Config: {json}` |
| iteration N | previous tip | lastKept tree + mutable changes | `AR-Decision: green\|yellow\|red`, `AR-Kept`, `AR-Best`, `AR-LOC`, `AR-Failure?`, `AR-Hypothesis` |
| revert N (not kept) | iteration N | lastKept tree | `AR-Revert: <lastKept sha>` |
| stop | tip | tip tree | `AR-Decision: stop`, `AR-Stop: <reason>` |

Every commit carries these trailers:

- `AR-Run`
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

The run state lives in `.shards/state/sessions/<key>/research.json` as `{active: run_id|null, runs: {<run_id>: run}}`. Each run holds:

- the configuration, the hashes and `preLoopDirty`
- `baseline`, `noise`, `epsilon_abs`
- `comparisonReference`, `bestSoFar`, `lastKeptCommit`, `lastGreenCommit`, and the ref `tip`
- `iterations[]`, plus the counters derived from them: `consecutiveRegressions`, `consecutiveFailures`, `consecutiveTimeouts`, `consecutiveYellowKept`, `iterationsSinceLastGreen`
- `status` (`active|converged|ended`) and `stop_reason`

`shards_status` reports a brief `arRun`. `sessions_resume` reports the AR run of the session it looks up, with a hint to call `ar_status({run_id, resume: true})`.

## Hooks

`ar_start` and `ar_iterate` count as exec tools in `hooks/lib/writes.js`. A pending gate blocks them, like scripts and notebook execution. They are not write-checked, because the runtime confines their writes to the mutable scope and `<project>/experiments/`.

## Promotion (not implemented yet)

Kept state stays uncommitted in the user's working tree. Promotion to the user's branch happens at the Phase 3 convergence gate, which is always human. Today the git binding's gate commit (`commitGate`) commits only the agent's output dirs, so mutable code outside them is left for the user to commit. A later task adds ref-based promotion: one commit per kept GREEN, via `commitGate` with the denylist and pre-commit hook. Also deferred: overnight automation (`requires_human`, the deferred-decision queue, driver docs), fan-out branches as leads with per-branch worktrees, and a sealed holdout.
