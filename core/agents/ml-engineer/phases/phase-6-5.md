> **Previous:** phase-6.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6.5 — Winner Selection (Optional)

Goal: Finalize `eval-results.json` `bestCandidate` before Phase 7 generates the
model card and report. Phase 6 produces baseline + candidates; Phase 6.5 decides
who wins. The available selection paths depend on what Phase 6 actually produced.

This phase is **optional**. Skipping it leaves `bestCandidate` as whatever Phase
6 wrote (or unset), and Phase 7 proceeds accordingly.

### State inspection

Before presenting options, inspect:
- `<project_dir>/experiments/leaderboard.csv` (Harness plans) — the latest row per approach is the primary source of candidate metrics and constraint results; `eval-results.json` mirrors only the baseline and winner
- `<project_dir>/eval-results.json` — `status`, `dimensions[*].actual`, `bestCandidate`
- Candidate count documented in Phase 4
- Infrastructure dimensions (model size, inference time, memory) — pass/fail

Classify Phase 6 state into one of:

| State | Indicator |
|-------|-----------|
| **Not executed** | `status == "running"`, actuals null, notebook written but unrun |
| **Single evaluated** | 1 candidate with metrics filled, infrastructure pass |
| **Clear winner** | 2+ candidates evaluated, one dominates primary metric within budgets |
| **Mixed trade-offs** | 2+ candidates evaluated, no single dominant (e.g., one wins accuracy, another wins latency) |

With a Harness plan, count candidates from the leaderboard (latest row per approach_id); an approach with no row is "not executed".

### Present applicable options

Open with a state summary, then offer only the paths that apply to this state.
Do not present options the state does not support.

**Path availability matrix:**

| State | [D] Deterministic | [A] Solo AR | [F] AR fan-out | [M] Run manually | [S] Skip | [N] New approach |
|-------|:-:|:-:|:-:|:-:|:-:|:-:|
| Not executed | — | ✓ | ✓ | ✓ | ✓ (with warning) | — |
| Single evaluated | ✓ | ✓ | — | — | ✓ | ✓ |
| Clear winner | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Mixed trade-offs | ✓ (user-prioritized metric) | ✓ | ✓ | — | ✓ | ✓ |

Note: `[F]` AR fan-out requires 2+ mutually exclusive candidate families from
Phase 4. If only one family exists, fan-out is unavailable.

Note: `[N]` requires a Harness experiment plan.

**Presentation format:**

```
**Phase 6.5 — Winner Selection**

Phase 6 state: <classification>
<one-line summary: candidate count, metrics available, infrastructure pass/fail>

Available paths:
[D] Deterministic pick — lock the leader on primary metric. No iteration work.
    Cost: none. Available when candidates have been evaluated.
[A] Solo AR on leading candidate — push the leader further for N iterations.
    Cost: N iterations + token/compute spend. Requires git/DVC.
[F] AR fan-out across approach families — K parallel AR loops, arbiter picks.
    Cost: K × N iterations + token/compute spend. Requires git/DVC and cost ceiling.
[M] I'll run the notebook myself — come back with results.
    Cost: none to agent. Re-enters 6.5 after you return.
[S] Skip winner selection — lock whatever is in eval-results.json and move on.
    If bestCandidate is null, you'll need to name the winner explicitly.
[N] Add a new approach to the harness — one module + config entry, then re-run.
    Cost: one approach fit. Harness plans only.

Which path?
```

Wait for the user's selection.

### Execute the selected path

Winner selection is also a lead loop. After the user picks a path, the lead appends the tasks for that path to `shards/<project_name>/tasks.yaml` (entries with `phase: "6.5"`) and validates the list with `tasks_set`; each task cites the path's specification below through `plan_ref`. A task is one candidate re-run, evaluation or branch. Paths `[D]`, `[M]` and `[S]` need no worker and use `delegate: inline` or no tasks at all; `[S]` creates no tasks.

### Lead loop

{{protocol delegated_build}} governs this phase. Task evidence guidance: {{protocol incremental_testing}}.

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

Run the protocol's lead loop over the 6.5 tasks once the path is chosen and the user has agreed to the cost described for it. ML Engineer specifics:
- Parallel tasks are candidate re-runs or branches with disjoint `owned_paths`.
- Verification recomputes from the candidate's metrics file: the primary metric and the infrastructure dimensions (Check = task id + candidate).
- Only the lead updates `eval-results.json` `bestCandidate`, and only from verified evidence.

**[D] Deterministic pick:** (lead-side, one `delegate: inline` task or no task)
1. Read `experiments/leaderboard.csv` (Harness plan) or `eval-results.json` (Single approach plan).
2. Select the candidate with best value on the primary metric (max or min per
   Phase 4 direction). With a Harness plan, apply the Phase 4 decision rule (constraints first, then primary metric, ties within the stated tolerance go to the simpler approach).
3. Verify infrastructure dimensions (model size, inference time, memory) PASS
   for this candidate.
4. If infrastructure FAILs, surface: "The metric winner fails <dimension>.
   Options: (a) accept and document the trade-off, (b) pick next-best candidate
   that passes, (c) stop and revisit Phase 2 budgets." Wait for decision.
5. Update `eval-results.json`: set `bestCandidate.model`, `bestCandidate.metrics`,
   `bestCandidate.deltas` (vs. baseline). Recompute `summary.overallVerdict`.

**[A] Solo AR on leading candidate:** (one task per candidate re-run or iteration batch, owned paths limited to the Phase 5 mutable scope)
1. Pre-flight: verify git (or DVC) is available per
   [`protocols/experiment_versioning.md`](../../../protocols/experiment_versioning.md)
   Section A. If unavailable, refuse and offer `[D]` instead.
2. Determine the leading candidate (same selection logic as `[D]`). If no
   candidate has been evaluated, use the Phase 4 candidate the user identifies.
3. Read [`modes/research.md`](../modes/research.md) and
   run it with this abbreviated Phase 0 setup:
   - Primary metric, direction, target: inherit from Phase 4
   - Baseline value: the leading candidate's current metric (from Phase 6)
   - Mutable scope: inherit from Phase 5 training pipeline; with a Harness plan, only the leading approach's module (`experiments/approaches/<approach_id>.py`) and its `params` in `experiments.yaml`. The runner, `base.py` and the split stay immutable so every iteration is scored the same way as the original comparison.
   - Immutable scope: `data/`, `eval/`, `deploy/` by default
   - Preset: ask user (interactive | overnight)
4. Announce the AR behavioral exception and run the loop.
5. On convergence: write converged metrics into `eval-results.json`
   `bestCandidate`. Record iterations consumed and budget spent in Phase 6.5 doc. With a Harness plan, each kept iteration also appends a leaderboard row.

**[F] AR fan-out across approach families:** (one AR branch lead per family; each lead runs its loop in its own git worktree and dispatches every iteration as a worker task card; the runtime's `ar_iterate` measures every iteration)
1. Pre-flight: verify git is available, the AR runtime tools are present, and the cost ceiling is confirmed (K branches, and each iteration's eval runs in the worker's check and in `ar_iterate`).
2. Identify 2-3 approach families from the Phase 4 experiment plan (with a Harness plan: approach modules in `experiments/approaches/`, one family per branch). Confirm mutual
   exclusivity and genuine viability with the user.
3. Follow
   [`protocols/diverge.md`](../../../protocols/diverge.md) Section B
   (DIVERGE proposal gate — use ID
   `diverge-ar-<project>`).
4. On confirmation, follow `autonomous_research.md` Section H:
   - H.3: launch one branch lead per family in one message, same run id, one `branch` slug each (at most 4)
   - H.5: each branch gets a runtime-owned worktree under `.shards/worktrees/<run-id>/<branch>` and its own ref `refs/shards/research/<project>/<run-id>/<branch>` (`no-vcs` only without git)
   - Wait for every lead to return (each ends its branch with `ar_end`)
5. Call `ar_status({run_id})` for the branch leaderboard and run the arbiter per Section F of `protocols/diverge.md` on the branch refs.
6. On user winner selection: promote per H.11 — apply the winner's `promote` diff (from its `ar_end`) in the main tree (no ref merge, no branch switch), update `eval-results.json.bestCandidate` with the
   winning branch's converged metrics; the next gate commits it.

**[M] User runs notebook manually:**
1. Tell the user: "Run <notebook path>. Populate the metrics tables, then tell
   me when you're back. I'll re-inspect state and re-present options."
2. Wait for user return. Do not advance.
3. On return: re-run state inspection and re-enter the option presentation.

**[S] Skip:**
1. If `bestCandidate` is populated: "Proceeding to Phase 7 with
   `bestCandidate = <model type>`, primary metric = <value>. Infrastructure:
   <pass/fail>. Confirm?"
2. If `bestCandidate` is null: "No winner is recorded. Which candidate should I
   write as the winner before Phase 7?" Wait for the user to name one, then
   populate `bestCandidate` from the corresponding Phase 6 entry.

### Adding approaches later

With a Harness plan, the user can add an approach at any point (now, or after handoff) per Section F of the experiment framework: one new module under `experiments/approaches/`, one `experiments.yaml` entry, re-run the runner, and re-enter this phase's state inspection. Offer this as path `[N] New approach` whenever the user names an approach that is not in the leaderboard; it is one worker task (owned paths: the new module and its `experiments.yaml` entry; run it alone, never in parallel with another task touching the yaml), verified like any candidate re-run. {{protocol experiment_framework}}

### Re-review the claim if the winner changed

If this phase changed `bestCandidate` from what Phase 6 reported, or the claim you will carry into Phase 7 differs from the one the Statistician reviewed in Phase 6, repeat the Phase 6 Statistician claim review on the new claim (same brief, routed per {{protocol stats_review_routing}}) before documenting this phase. Apply {{protocol reviewer_verdict}}, record the verdict below, and update the `Statistician claim review` row in the Phase 6 `## Validation` table to the new verdict (note "re-reviewed in Phase 6.5"). If the winner and claim are unchanged, note "Phase 6 claim review stands".

### Document Phase 6.5

Append to `project-specs.md`:

```markdown
---

## Phase 6.5: Winner Selection (ML Engineer)
- **Phase 6 state at entry:** Not executed | Single evaluated | Clear winner | Mixed trade-offs
- **Path selected:** Deterministic | Solo AR | AR fan-out | Manual | Skip | New approach
- **Rationale:** <one-line reason — e.g., "clear metric winner, no need to push further">
- **Winner:**
  - Model type: <type>
  - Primary metric: <metric> = <value>
  - Infrastructure: model size <X>MB, inference <X>ms, memory <X>MB — Pass | Fail
  - Deltas vs. baseline: <metric>: <delta>
- **AR details (if Solo AR or fan-out):**
  - Preset: interactive | overnight | custom
  - Iterations run: <N>
  - Budget consumed: <tokens | dollars>
  - Convergence: converged | budget exhausted | user interrupted
  - Branches (fan-out only):
    - `<branch-slug>`: <converged metric value> — <winner | runner-up>
- **Infrastructure trade-off (if applicable):** <metric winner fails <dim> — user accepted | chose next-best | revisited Phase 2 budgets>
- **Statistician claim review:** <verdict on the new claim | Phase 6 claim review stands>
- **eval-results.json bestCandidate:** Locked | Skipped — bestCandidate left as-is
- **Leaderboard:** <experiments/leaderboard.md — approaches compared: <N>> | N/A — Single approach plan

### Validation

| Check | Expected | Observed | Pass/Fail |
|---|---|---|---|
| <task id> <candidate or branch> | <acceptance expected> | <recomputed metrics and infrastructure facts> | PASS \| FAIL |
```

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Phase 7.
