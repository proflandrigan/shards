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

### Present applicable options

Open with a state summary, then offer only the paths that apply to this state.
Do not present options the state does not support.

**Path availability matrix:**

| State | [D] Deterministic | [A] Solo AR | [F] AR fan-out | [M] Run manually | [S] Skip |
|-------|:-:|:-:|:-:|:-:|:-:|
| Not executed | — | ✓ | ✓ | ✓ | ✓ (with warning) |
| Single evaluated | ✓ | ✓ | — | — | ✓ |
| Clear winner | ✓ | ✓ | ✓ | — | ✓ |
| Mixed trade-offs | ✓ (user-prioritized metric) | ✓ | ✓ | — | ✓ |

Note: `[F]` AR fan-out requires 2+ mutually exclusive candidate families from
Phase 4. If only one family exists, fan-out is unavailable.

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

Which path?
```

Wait for the user's selection.

### Execute the selected path

**[D] Deterministic pick:**
1. Read `eval-results.json`.
2. Select the candidate with best value on the primary metric (max or min per
   Phase 4 direction).
3. Verify infrastructure dimensions (model size, inference time, memory) PASS
   for this candidate.
4. If infrastructure FAILs, surface: "The metric winner fails <dimension>.
   Options: (a) accept and document the trade-off, (b) pick next-best candidate
   that passes, (c) stop and revisit Phase 5 budgets." Wait for decision.
5. Update `eval-results.json`: set `bestCandidate.model`, `bestCandidate.metrics`,
   `bestCandidate.deltas` (vs. baseline). Recompute `summary.overallVerdict`.

**[A] Solo AR on leading candidate:**
1. Pre-flight: verify git (or DVC) is available per
   `.claude/agents/specific_instructions/shared/experiment_versioning.md`
   Section A. If unavailable, refuse and offer `[D]` instead.
2. Determine the leading candidate (same selection logic as `[D]`). If no
   candidate has been evaluated, use the Phase 4 candidate the user identifies.
3. Read `.claude/agents/specific_instructions/ml_engineer/research.md` and
   execute Sections A-G with abbreviated setup:
   - Primary metric, direction, target: inherit from Phase 4
   - Baseline value: the leading candidate's current metric (from Phase 6)
   - Mutable scope: inherit from Phase 5 training pipeline
   - Immutable scope: `data/`, `eval/`, `deploy/` by default
   - Preset: ask user (interactive | overnight)
4. Announce the AR behavioral exception and run the loop.
5. On convergence: write converged metrics into `eval-results.json`
   `bestCandidate`. Record iterations consumed and budget spent in Phase 6.5 doc.

**[F] AR fan-out across approach families:**
1. Pre-flight: verify git/DVC available and cost ceiling confirmed.
2. Identify 2-3 approach families from Phase 4 candidates. Confirm mutual
   exclusivity and genuine viability with the user.
3. Follow
   `.claude/agents/specific_instructions/shared/diverge_protocol.md` Section B
   (DIVERGE proposal gate — use ID
   `specific-instructions-shared-diverge-protocol-ar-<project>`).
4. On confirmation, follow `autonomous_research.md` Section H:
   - H.3 for parallel branch spawning (all branches in one message)
   - H.5 for git strategy (default `branch-local`)
   - Wait for all branches to complete
5. Run arbiter per Section F of `diverge_protocol.md`.
6. On user winner selection: promote per Section G — copy artifacts, squash-merge
   on chosen git strategy, update `eval-results.json.bestCandidate` with the
   winning branch's converged metrics.

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

### Document Phase 6.5

Append to `project-specs.md`:

```markdown
---

## Phase 6.5: Winner Selection (ML Engineer)
- **Phase 6 state at entry:** Not executed | Single evaluated | Clear winner | Mixed trade-offs
- **Path selected:** Deterministic | Solo AR | AR fan-out | Manual | Skip
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
- **Infrastructure trade-off (if applicable):** <metric winner fails <dim> — user accepted | chose next-best | revisited Phase 5>
- **eval-results.json bestCandidate:** Locked | Skipped — bestCandidate left as-is
```

::GATE:: id=ml-engineer-phase-6-5 phase=6 kind=phase
Read this section back to the user. Stop here — do not begin Phase 7 or output any further content. Wait for the user to explicitly confirm before proceeding.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ml_engineer/phases/phase-7.md` in full and follow its instructions starting from Phase 7.
