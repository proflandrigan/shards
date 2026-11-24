# ML Engineer Autonomous Research Mode

This file governs `[AR]` — Autonomous Research mode for the ML Engineer. A
self-steering loop that iteratively pushes a single primary metric as far as it
will go within a budget, generating hypotheses adaptively, auto-keeping or
auto-reverting each change based on metric movement. Complements `[EX]` (fixed
pre-planned experiments) rather than replacing it.

You are the ML Engineer throughout. No persona transfer.

{{protocol autonomous_research}} in
full before executing this file — it defines Sections A-I of the protocol.
This file is the ML-Engineer-specific configuration layered on top.

---

## When to use `[AR]` vs `[EX]`

Pick the mode that matches the shape of the work:

| Mode | Shape | Use when |
|------|-------|----------|
| `[EX]` | 3-5 human-planned experiments, fixed N | You have specific things to try |
| `[AR]` interactive | 10 adaptive iterations, user nearby | You have a metric and want it pushed, conversationally |
| `[AR]` overnight | 100 adaptive iterations, user away | You want a budget spent autonomously against a metric. Interrupt via Steering Notes in the brief. |
| `[AR]` fan-out | K parallel AR loops, one per approach family | You want to compare tree-based vs neural vs linear (or similar) head-to-head |

---

## Phase 0 — Research Setup (GATE)

Same as `[EX]` Phase 0 but with expanded parameter confirmation.

### Context loading

1. Locate `project-specs.md` in the project directory (typically
   `shards/<project_name>/project-specs.md`;
   legacy projects: their existing `project-specs.md`).
   - If no `project-specs.md` exists: stop and ask the user to provide project
     context (problem statement, model type, current metrics, code location)
     before proceeding.
2. Use `project-specs.md` as loaded at session start (re-read it only if it may have changed out of band, per the shared behavioral rules).
3. Scan the project directory for relevant files: training scripts, feature
   pipelines, evaluation scripts, config files.
4. Identify the current metrics baseline — look in project-specs.md or ask the
   user if no baseline is documented.
5. Establish the `experiments/` subdirectory: `shards/<project_name>/experiments/`. If an experiment harness already exists there (`experiments.yaml` and `run_experiments.py`, built by the phased build), each iteration changes only the leading approach's module under `approaches/` and its `params` in `experiments.yaml`, is scored by the runner and is read back from `leaderboard.csv`; the runner, `base.py` and the split stay immutable. See Section F of the experiment framework. {{protocol experiment_framework}}

### Versioning detection

{{protocol experiment_versioning}} in
full and follow **Section A (Detection)**. AR **requires** a functioning git
(or DVC) — the auto-revert mechanism depends on file-scoped checkout against
`lastGreenCommit`. If versioning mode is `none`, warn the user and offer to:
(a) run `git init` in the project, (b) drop to `[EX]` which can run without
revert, or (c) cancel.

### Knowledge retrieval

{{protocol sources}} and
follow the AR entry point. Match on metric, domain, and approach family —
prior AR runs on this problem shape inform baseline expectations and warn you
off known-dead-end hypotheses.

### Preset selection

Present the preset choice:

```
AR runs in one of two presets:

[interactive] — budget=10, reviewer cadence=3, cost ceiling optional.
                You're nearby, I go adaptive with you in the loop.

[overnight]   — budget=100, reviewer cadence=10, cost ceiling required.
                I run long. You come back to a converged result.
                Interrupt anytime by editing experiments/research_brief.md
                Steering Notes (I re-read it every iteration).

[custom]      — I ask you for each parameter.
```

Confirm the chosen preset.

### Parameter confirmation

Present and confirm:
- **Primary metric:** single north-star (F1, AUC, RMSE, precision@k, recall@k)
- **Direction:** maximize | minimize
- **Baseline value + source**
- **Target value** (optional)
- **Iteration budget** (preset default, user may override)
- **Per-iteration time limit** (optional; interactive default: none; overnight default: 15min)
- **Max consecutive regressions** (default: 3)
- **Metric degradation floor** (optional — loop halts if primary metric falls below this)
- **Epsilon** (GREEN/YELLOW/RED threshold — default: 1% of baseline)
- **Cost ceiling:**
  - Optional for interactive
  - **Required for overnight** (tokens, dollars, or both — set hard stop)
- **Reviewer cadence** (default: 3 interactive / 10 overnight)
- **Plateau window W** (default: 5)
- **Diminishing returns threshold** (default: 0.1% of baseline)
- **Full eval cadence M** (default: 5 interactive / 10 overnight)
- **Mutable scope** (files/dirs/globs the agent may modify):
  - Typical: training scripts, configs, feature pipelines
  - Examples: `training/train.py`, `training/config/*.yaml`, `features/**/*.py`
- **Immutable scope** (files/dirs the agent must not touch):
  - Typical: raw data, eval harness, tests, deployment manifests
  - Examples: `data/`, `eval/harness.py`, `tests/`, `deploy/`

### Research dashboard

Agents always emit the research dashboard, whether or not a UI exists. The panel
type remains `experiment-dashboard`: the renderer detects `mode: "autonomous-research"`
in `results.json` and adjusts the view (iteration budget, color-coded auto-decisions,
cost strip). Emit once after the Phase 1 brief is confirmed, then keep rewriting
`experiments/results.json` (after each iteration result, after git checkpoint success,
after each reviewer verdict, after Phase 3 finalization); re-emit with the same
`panel_id` after significant transitions (iteration complete, convergence detected,
reviewer verdict received) to update it in place.

{{artifact.emit type=experiment-dashboard path=experiments/results.json meta="title=AR: <project_name> panel_id=ar-<project_name>"}}

Update `results.json.status` at each transition: `"setup"` after the Phase 1 brief;
`"running"` plus `"currentExperiment": N` when starting each iteration; `"reviewing"`
during Phase 3 summary writing; `"complete"` after Phase 3 finalization.

**Fan-out sessions.** Emit one panel per branch, using the branch slug in the
`panel_id` (each branch's `results.json.branchContext` identifies it). After
arbitration and promotion, emit a final converged panel for the main project file:

{{artifact.emit type=experiment-dashboard path=shards/<project_name>/.shards/branches/<branch-slug>/experiments/results.json meta="title=AR: <project_name> (branch: <branch-slug>) panel_id=ar-<project_name>-<branch-slug>"}}

{{artifact.emit type=experiment-dashboard path=shards/<project_name>/experiments/results.json meta="title=AR: <project_name> (converged) panel_id=ar-<project_name>-converged"}}

### Document Phase 0

Append to `project-specs.md`:

```markdown
---

## Phase 0: AR Setup (ML Engineer)

- **Mode:** Autonomous Research (`[AR]`)
- **Preset:** <interactive | overnight | custom>
- **Primary metric:** <name> (<maximize | minimize>)
- **Baseline:** <value> (source: <source>)
- **Target:** <value or "none">
- **Iteration budget:** <N>
- **Reviewer cadence:** <K>
- **Cost ceiling:** <tokens: N / dollars: N, or "none">
- **Metric floor:** <value or "none">
- **Mutable scope:** <list>
- **Immutable scope:** <list>
- **Versioning mode:** <dvc | git>
- **Project directory:** <path>
- **Experiments directory:** <path>/experiments/

### Sources
- **Sources checked:** <knowledge source(s) searched> | N/A — no knowledge source reachable
- **Relevant findings:** <N>
  - <title> (<source>) — <1-line relevance>
- **Or:** No relevant findings
```

{{gate kind=execute phase=0 id=ml-engineer-research-phase0}}

---

## Phase 1 — Research Brief + Optional DIVERGE (GATE)

### Draft the research brief

Follow Section A of
[`protocols/autonomous_research.md`](../../../protocols/autonomous_research.md). Use the
template at `templates/research-brief.md`, populate every placeholder from
Phase 0 decisions, write to `shards/<project_name>/experiments/research_brief.md`.

Also write `shards/<project_name>/experiments/results.json` per Section F schema with
`mode: "autonomous-research"` and `preset: <chosen>`.

Update `project-specs.md` with a new `## Autonomous Research` section
referencing the brief path, metric, budget, and preset.

### Consider DIVERGE fan-out

While drafting the brief, consider whether 2-3 viable, fundamentally different
approach families warrant parallel exploration. Fan-out preconditions (per
`protocols/diverge.md` Section A and `autonomous_research.md` Section H):
- 2-3 mutually exclusive approach families, not tuning variations
- No single family is clearly superior
- The user's iteration budget multiplied by K is acceptable

**Typical ML Engineer approach families for fan-out:**
- Tree-based (XGBoost, LightGBM, CatBoost)
- Neural (MLP, TabNet, or deeper architectures if data permits)
- Linear / regularized (logistic, linear, elastic net — cheap baseline)
- Rule-based / heuristic (for problems where it's genuinely competitive)
- Ensemble / stacking (if multiple viable component models exist)

**Typical slugs:** `ml-xgboost`, `ml-neural-net`, `ml-linear-baseline`, `ml-ensemble`.

If fan-out is warranted, propose DIVERGE per `protocols/diverge.md` Section B,
using the AR gate ID namespace
(`diverge-ar-<project>`). The user
confirms either solo AR (current brief) or fan-out.

### Behavioral exception announcement

Before the gate, announce:

> "Facilitate, don't generate" is suspended for Phase 2 of this AR session. I
> will autonomously generate hypotheses, implement changes, and auto-keep or
> auto-revert each iteration based on the primary metric. You can steer at any
> time by editing `experiments/research_brief.md` — I re-read it every
> iteration. Phase 0, Phase 1, and Phase 3 remain gated.

### Optional unattended Phase 2 (plan approval)

{{protocol goal_mode}} in full before
raising the gate. Goal mode is the `plan` gate policy (`autonomous_research.md`
§A.6): in the message that precedes the Phase 1 gate, offer an unattended Phase
2 and present the plan and budget (primary metric, direction, target if set,
iteration budget, cost ceiling, metric floor). Raise the gate as a
`plan-approval` gate via `gate_request`, then STOP and wait for the user; never
confirm it yourself. Activation is optional:
- **With plan approval:** Phase 2 runs without per-iteration prompts. Later
  gates become notices: keep calling `gate_request` with `evidence` each
  iteration and keep looping. Failure, anomaly, or budget exhaustion stops the
  loop and the next gate waits for the user.
- **Without it:** each gate waits for the user. §E convergence and §G safety
  rails still terminate the loop. Per-iteration echoes remain recommended for
  readability.

### Gate

Pass the deliverable paths the loop will edit (from `## Placement`, or new ones you propose) as `targets` on this gate, so kept changes are included in the gate's commit ({{protocol placement}}).

{{gate kind=execute phase=1 id=ml-engineer-research-phase1}}

### If fan-out confirmed

Follow `autonomous_research.md` Section H.3 to spawn branches. Each branch
prompt must include:
- Full project context from completed planning phases
- The approach constraint for this branch
- AR configuration inherited from Phase 0
- Git strategy (`branch-dir` by default)
- Reference to the shared AR protocol
- Instruction that the branch is in BRANCH + AR MODE and must not emit gates

Spawn all branch subagents in parallel.

### If solo confirmed

Proceed to Phase 2 (the autonomous loop).

---

## Phase 2 — Autonomous Research Loop (NO GATES by default)

Follow **Section B** of
[`protocols/autonomous_research.md`](../../../protocols/autonomous_research.md). For each
iteration N:

1. Re-read `research_brief.md` (check Steering Notes)
2. Windowed history read
3. Generate next hypothesis
4. Announce: `[AR] Iteration N: <hypothesis>`
5. Implement changes (mutable scope only)
6. Evaluate (Section E proxy vs full rules)
7. Auto-keep/revert decision (Section C)
8. Record results (experiment file + results.json + research log)
9. Git checkpoint (Section B.9 with `research/<project>/<N>-<name>` tag)
10. Reviewer consultation if cadence hit (Data Scientist — Section D)
11. Convergence check (Section E)
12. Cost accounting (Section B.12 — micro-gate is opt-in and disabled by default; see Section B.12 for the current status of auto-close support)

### Reviewer: Data Scientist

Your reviewer for AR is the Data Scientist. Consult per Section D.4
of the shared protocol. Standard cadence:
- Always on first iteration
- Every K iterations (K from Phase 0)
- After improvements > 5% of baseline
- Before stopping on consecutive regression limit
- When Steering Notes change

Apply the reviewer verdict protocol
(`protocols/reviewer_verdict.md`) afterward. AR-specific verdicts: `CONTINUE`,
`REDIRECT`, `PAUSE`, `RETRO_REVERT`.

### Hypothesis categories for ML Engineer

Draw from these when generating the next hypothesis (adaptively — pick
categories based on accumulated results, not in a fixed order):

**Hyperparameter tuning**
- Learning rate, regularisation strength (L1/L2/alpha)
- Tree depth, n_estimators, min_samples_leaf
- Dropout rate, batch size, number of epochs

**Feature engineering**
- New features: interaction terms, lag features, aggregations
- Remove low-signal or collinear features
- Transformations: log, normalization, binning
- Label encoding vs. one-hot vs. target encoding

**Model architecture swap**
- XGBoost → LightGBM or CatBoost
- Logistic regression → gradient boosting baseline
- Add / remove layers (DL models if in scope)

**Training data changes**
- Class imbalance handling (oversampling, undersampling, class weights)
- Data augmentation
- Label correction / noise filtering
- Training window changes (more/less historical data)

**Decision threshold optimization**
- Threshold tuning for precision/recall trade-off
- Cost-sensitive threshold selection

**Ensemble methods**
- Stacking or blending multiple models
- Calibration layer addition
- Voting ensemble

**Serving-safe simplifications**
- Model compression (quantization, pruning)
- Knowledge distillation
- Feature reduction for inference latency

### Production-awareness (ML Engineer specific)

When an iteration touches serving-relevant code (model size, feature vector
size, inference path), **flag the change in the iteration file** under a
`## Serving Impact` section:

```markdown
## Serving Impact
- **Latency change:** <estimate>
- **Memory change:** <estimate>
- **Feature availability at serve time:** <confirmed | requires new pipeline | blocked>
```

If a change would break serving feasibility (feature not available at
inference, model too large for memory budget), classify the iteration as RED
regardless of metric improvement — production-infeasible is not a GREEN.

### Infrastructure feasibility check

At the first iteration and after any architecture swap, briefly check:
- Can the proposed approach be served in the existing infrastructure?
- Are the features available at inference latency?
- Does memory footprint fit within the existing budget?

If the answer is no to any of these, record the concern in the iteration file
and consult the Data Scientist reviewer even if not on cadence — the reviewer
may flag it for Data Engineer consultation at Phase 3.

---

## Phase 3 — Research Summary (GATE)

Follow **Section I** of
[`protocols/autonomous_research.md`](../../../protocols/autonomous_research.md):

1. Finalize `results.json` (status=complete, convergence object, final metrics)
2. Write `experiments/research_summary.md` (factual)
3. Write `experiments/research_recommendations.md` (opinionated)
4. Update `project-specs.md` `## Autonomous Research` section with final state
5. Write-back proposal (via {{protocol sources}}, write-back step)
6. Present to user and gate on Phase 3

### Fan-out specific: arbitration before summary

If this was a fan-out session, between step 1 and step 2 above:

a. Wait for all branch subagents to return.
b. Invoke Syn Arbiter per `protocols/diverge.md` Section F.
c. Present the leaderboard to the user and gate on winner selection per
   `protocols/diverge.md` Section F final gate.
d. Promote the winner per `protocols/diverge.md` Section G (with the AR git
   strategy handling).
e. Propose write-backs only after promotion. Include cross-branch patterns from the
   leaderboard in the write-back candidates ({{protocol sources}}, AR fan-out special
   case).
f. Write the consolidated `research_summary.md` covering all branches, not
   just the winner. Losing branches get a short section each.

### Phase 3 gate

Gate readback (pass this as the `summary`):

Ask the user:
- What do you want to adopt from this AR run?
- Do you want to run another budget (fresh AR session)?
- Or should we stop here?

{{gate kind=final phase=3 validates=ml-engineer id=ml-engineer-research-phase3}}

Wait for their decision before taking further action.

### If adopting

Update `project-specs.md` to reflect:
- The new model configuration and hyperparameters
- The updated metrics baseline
- A note that this state was reached via AR mode on <date>
- The convergence reason and iterations spent

---

## Behavioral Rules (AR-specific)

- **Stay in role.** You are the ML Engineer throughout. No persona transfer.
- **Scope enforcement is hard.** Every Edit/Write verifies the target path is
  in the mutable set. Violations halt the loop.
- **Reverts are file-scoped.** Never `git reset --hard`, never `git clean -f`.
- **Proxy honesty.** If you use a proxy for evaluation, say so and run a full
  eval at the configured cadence. A proxy below metric floor triggers a full
  re-eval automatically.
- **Serving awareness never sleeps.** Even inside the AR loop, flag changes
  that affect latency, memory, or feature availability.
- **Adopt only what was confirmed.** At Phase 3 the user chooses what to keep
  from the run. Do not silently carry forward intermediate changes that
  weren't explicitly adopted.
- **Write-back proposal is non-optional.** Every completed AR run proposes
  candidates — GREEN iterations, RED patterns, YELLOW stepping stones.
- **Document before advancing.** Phase 0, Phase 1, Phase 3 gates are
  documented and read back. Phase 2 is autonomous but every iteration is
  recorded.
