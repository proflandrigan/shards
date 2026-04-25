---
name: autonomous-research-protocol
description: >
  Shared autonomous research (AR) mode protocol. Defines the self-steering
  research loop inspired by autoresearch: budget-bounded, adaptive hypothesis
  generation, auto-keep/revert based on metric movement, steering document
  the user can edit mid-loop, and convergence detection. Referenced by AR-capable
  agents (ML Engineer, AI Engineer, Data Scientist, Applied ML Scientist, Deep
  Learning Engineer). Section H defines how AR composes with DIVERGE for
  fan-out of parallel approach families.
type: reference
---

# Autonomous Research (AR) Protocol

This protocol governs `[AR]` mode — a self-steering research loop that runs a
bounded number of iterations against a single primary metric and auto-decides
whether to keep or revert each change. It complements `[EX]` (human-planned
fixed-N experiments) rather than replacing it.

**When to use `[AR]`:**
- You have a metric and a budget and want the agent to push as far as it will go.
- You cannot enumerate the specific experiments ahead of time.
- You want hypotheses generated adaptively based on accumulated results.

**When NOT to use `[AR]`:**
- You have 2-3 specific things to try — use `[EX]` instead.
- You have not identified a primary metric — AR requires a single north-star.
- The changes are not revertable via git — AR requires versioning for safety.

---

## Section A — Research Brief Initialization

Run this section at the start of Phase 1 (Research Brief), after Phase 0 setup
has been gated and confirmed.

### A.1 Knowledge retrieval

Before writing the brief, read
`.claude/agents/specific_instructions/shared/knowledge_retrieval.md` in full and
follow the AR entry point (Step 2 under AR Phase 0 / pre-brief context).

Match criteria most useful for AR:
- **Metric** — has a prior AR or study measured this metric on similar data?
- **Domain** — dataset, entity, or business area match.
- **Approach family** — have prior runs explored the same model family (e.g.,
  gradient boosting, transformer, prompt-chain)?

Surface relevant ledger entries (saturation points, known-leaky features,
architectural dead ends) to the user alongside the draft brief. Prior runs may
warn you off hypotheses that look promising but are already-tested dead ends.

### A.2 Determine preset

Confirm with the user which preset is active (established at Phase 0):

- **`interactive`** (default) — budget=10, reviewer cadence=3, no required cost
  ceiling. User is nearby and expects an engaged session. Closest in character
  to a beefed-up `[EX]`.
- **`overnight`** — budget=100, reviewer cadence=10, cost ceiling required.
  User is away; agent runs long. Interrupt mechanism for unattended runs
  is the Steering Notes section of `research_brief.md` — the agent re-reads
  it every iteration (see B.1) and honors directives written there
  (including "STOP" / "PAUSE"). Micro-gates exist as an opt-in feature but
  currently block the loop (no auto-close); see B.12.
- **`custom`** — user has overridden one or more preset defaults; record the
  overrides.

Presets are hints. All parameters remain user-overridable.

### A.3 Write `experiments/research_brief.md`

Write the brief using `templates/research-brief.md` as the source template.
Populate every `{{PLACEHOLDER}}`. The brief is the steering document — the user
can edit it between iterations and the agent re-reads it every iteration.

Required sections:
- **Objective** — one paragraph on what this AR run is trying to achieve.
- **Primary metric** — name, direction (maximize/minimize), baseline value, source
  of baseline, target value (optional).
- **Constraints** — iteration budget, per-iteration time limit, max consecutive
  regressions, metric degradation floor, cost ceiling (tokens and/or dollars;
  optional for interactive, required for overnight).
- **Scope** — explicit list of mutable files/directories vs. immutable
  files/directories. Anything not listed as mutable is immutable by default.
- **Preset** — `interactive` | `overnight` | `custom`.
- **Steering Notes** — user-editable section. Empty at brief creation; the user
  may add notes like "prioritize feature engineering over hyperparameter tuning"
  or "avoid transformer-family — too slow at serve time" at any point.
- **Research Log** — append-only log. One line per iteration with outcome.

### A.4 Write `experiments/results.json`

Initialize `results.json` with the AR-extended schema (see Section F for the
full schema). Set `mode: "autonomous-research"` and `preset: <chosen preset>`.

### A.5 Announce behavioral exception

Before the gate, tell the user:

> "Facilitate, don't generate" is suspended for Phase 2 of this AR session. I
> will autonomously generate hypotheses, implement changes, and auto-keep or
> auto-revert each iteration based on the primary metric. Phase 0, Phase 1, and
> Phase 3 remain gated. You can steer the loop at any time by editing
> `experiments/research_brief.md` — I re-read it every iteration.

---

## Section B — The Research Loop

Phase 2 executes this loop until a stop condition in Section E fires or the user
interrupts. **No intermediate gates between iterations by default** — the
autonomous loop is the whole point. The optional micro-gate (Section B.12) is
opt-in and only on the overnight preset.

At the start of Phase 2, run `git rev-parse HEAD` (via the `experiment_versioning.md`
Section A detection) to capture the pre-loop commit. Set
`results.json.lastGreenCommit` to this SHA — this is the baseline you revert to
when an iteration regresses. It is always updated by the agent, never searched
via `git log`.

### Per-iteration steps

For iteration N:

#### B.1 Re-read steering

Read `experiments/research_brief.md` in full. Look for changes to the Steering
Notes section since the previous iteration. If the user has added new notes,
incorporate them into the next hypothesis.

**Honor halt directives.** If the Steering Notes contain any of the following
(case-insensitive, as a standalone directive or clearly flagged as such):
`STOP`, `PAUSE`, `HALT`, or `stop the loop` — halt the loop immediately,
record `results.json.convergence.reason = "user-interrupt"`, and proceed to
Phase 3 as if any stop condition had fired. This is the primary interrupt
mechanism for unattended overnight runs.

#### B.2 Windowed history read

To keep per-iteration context cost bounded:

- At iteration N ≤ 10: read the full `results.json` (all prior entries).
- At iteration N > 10: read only the **last 10 experiment entries** from
  `results.json`, plus `experiments/history_summary.md` which you maintain and
  compress every 10 iterations.

Writing `history_summary.md`: at iterations 11, 21, 31, ..., consolidate
iterations 1..N-10 into a short summary (approach families tried, what worked,
what didn't, metric trajectory). Overwrite the file. At iteration 11 it
summarizes 1-10; at 21 it summarizes 1-20; and so on.

#### B.3 Generate next hypothesis

Synthesize the next hypothesis from:
- The Steering Notes section of the research brief
- Recent iteration results (windowed history)
- Any reviewer verdicts with `REDIRECT` or `CONTINUE + suggestion`
- Your agent-specific experiment categories (see per-agent `research.md`)

The hypothesis must be **one specific, testable change**. Avoid bundling
multiple changes in a single iteration.

Record `hypothesisSource` in the results entry:
- `"adaptive"` — generated by agent from accumulated evidence
- `"steering"` — taken directly from user's Steering Notes
- `"reviewer-suggested"` — from a reviewer's `REDIRECT` or suggestion

#### B.4 Announce

Print inline: `[AR] Iteration N: <one-line hypothesis>`

#### B.5 Implement

Make the changes. **Scope enforcement is hard**: every Edit/Write target path
must be in the mutable set from the research brief. Before writing, verify the
target path matches one of the mutable patterns. If a change would require
touching an immutable file, halt the iteration and record a scope-violation
stop per Section G.

Keep changes minimal and isolated to the hypothesis. No drive-by cleanups.

#### B.6 Evaluate

Run the evaluation protocol for this specialist (full train/eval, proxy, etc.)
and measure the primary metric. Record both primary and secondary metrics.

**Proxy vs full-eval rules (Section E also governs):**
- Record `evalType: "full" | "proxy"` in the iteration entry.
- Full evaluation must run at least every M iterations (M=5 interactive, M=10
  overnight) and always on the final iteration before Phase 3.
- A proxy below the metric floor triggers an automatic full re-evaluation on
  the same iteration before any revert decision is made (see Section G.2).

#### B.7 Auto-keep/revert decision (Section C)

Classify the result as GREEN / RED / YELLOW per Section C and execute the
corresponding action (keep, revert, or conditional-keep).

#### B.8 Record results

Write `experiments/experiment_<N>_<name>.md` using the template below. Append
the iteration entry to `results.json.experiments[]`. Append a one-line entry to
the Research Log in `research_brief.md`:

```
- **Iter N** (<green|red|yellow>, <kept|reverted>): <hypothesis> — <metric> <before> → <after>
```

**Experiment file template:**

```markdown
# AR Iteration N: <Name>

- **Date:** <date>
- **Agent:** <agent name>
- **Iteration:** N of <budget>
- **Primary metric:** <metric name>
- **Hypothesis source:** <adaptive | steering | reviewer-suggested>
- **Eval type:** <full | proxy>

## Hypothesis
<what you expected and why>

## Changes Made
<precise description of files touched and what changed>

## Metrics
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| **<primary metric>** | **<value>** | **<value>** | **<+/->** |
| <secondary metric> | <value> | <value> | <+/-> |

## Auto-Decision
<GREEN | RED | YELLOW> — <one-sentence reasoning>

## Action Taken
<Kept | Reverted | Kept with next-steps>

## Next Steps (populated for kept YELLOWs)
<what hypothesis this opens up>

## Reviewer Note (populated when reviewer consulted)
<verdict and key points from Section D>

## Self-Assessment (populated when reviewer not consulted this iteration)
<one-line honest read: does this result feel real? methodology concerns?>
```

#### B.9 Git checkpoint

Follow **Section B** of `.claude/agents/specific_instructions/shared/experiment_versioning.md`
with these AR-specific conventions:

- **Tag prefix:** `research/<project_name>/<N>-<name>` (not `exp/<...>`).
- **Annotated tag message** includes the auto-decision color:
  ```
  Iteration N (<green|red|yellow>): <name> | <metric>: <before> -> <after> (delta: <delta>)
  ```
- The color suffix lives only in the annotated tag message and in
  `results.json.experiments[N].autoDecision`, never in the tag name itself.
  This matches `[EX]`'s `exp/<project>/<N>-<name>` convention and keeps
  `git tag -l "research/<project>/*"` globs clean.

If versioning mode is `none`, skip this step silently (per
`experiment_versioning.md` Section B).

#### B.10 Reviewer consultation if cadence hit

Apply Section D cadence rules. If a reviewer is consulted, record their verdict
per Section D.

#### B.11 Convergence check

Run Section E stop-condition checks. If any condition fires, break the loop and
proceed to Phase 3.

#### B.12 Cost accounting + micro-gate (overnight only)

Update `results.json.costAccounting`:
- `tokensIn` and `tokensOut` — approximate counts from this iteration
- `dollarsSpent` — running total
- `reviewerTasksSpawned` — increment if a reviewer Task was called

Check against the cost ceiling (Section G.5). If at 50% or 80% of ceiling emit
a soft warning; at 100% hard-stop the loop.

**Micro-gate (opt-in, overnight preset):** micro-gates are designed as a
user-interrupt window emitted every K iterations (default K=5). They are
currently **disabled by default** because the gate hook does not yet
support auto-close — a micro-gate blocks the loop until the user confirms,
which defeats the overnight preset's purpose.

**Default behavior:** do NOT emit micro-gates during Phase 2 unless the user
has explicitly opted in at Phase 0 with the understanding that the loop will
block at each micro-gate.

**If the user opts in,** emit a `::GATE::` fence with `kind=confirm` every K
iterations:

```
::GATE:: id=specific-instructions-shared-autonomous-research-micro-<project>-<N> phase=2 kind=confirm
Iteration N complete. Reply "continue" to proceed, or give steering notes.
::ENDGATE::
```

Note the ID includes the iteration number so each micro-gate has a unique ID
per the harness's "never duplicate gate ids" rule.

**Alternative for unattended overnight runs:** rely on the user editing
`research_brief.md` Steering Notes mid-run as the interrupt mechanism
(re-read every iteration — see B.1). No gate, no block. The user can pause
the run anytime by writing "STOP" or similar directive into Steering Notes,
which the agent reads at the next iteration and halts on.

#### B.13 Continue or stop

If no stop condition fired and iteration budget remains, proceed to iteration
N+1. Otherwise exit to Phase 3.

---

## Section C — Auto-Keep/Revert Protocol

### C.1 Classification

Classify each iteration result by comparing the primary metric to the
**comparison reference** — not to the original baseline. The comparison
reference is the "after" value from the most recent GREEN iteration, or the
original baseline (`results.json.baseline.value`) if no GREEN has occurred
yet. This ensures each iteration is measured against the current best state,
not against the original starting point (which would make every small
improvement look GREEN and break convergence detection).

- **GREEN (improved):** Primary metric moved in the configured direction
  **from the comparison reference** by more than `epsilon` (default: 1% of
  baseline, configurable per project).
- **RED (regressed):** Primary metric moved in the opposite direction from
  the comparison reference by more than `epsilon`.
- **YELLOW (neutral):** Primary metric moved by less than `epsilon` in either
  direction from the comparison reference.

The original `results.json.baseline.value` **never changes** after Phase 0 —
it is used at Phase 3 for computing net delta and for the epsilon default.

### C.2 Actions

**GREEN:**
1. Keep the changes (no revert).
2. Update `results.json.lastGreenCommit` to the commit SHA of this iteration's
   checkpoint. The "after" value from this iteration becomes the comparison
   reference for the next iteration's classification (derived on-demand from
   `results.json.experiments[lastGreenIndex].metrics.outcome.after`).
3. Reset `consecutiveRegressions` to 0.
4. Reset `consecutiveYellowKept` to 0.
5. Annotate the git tag message with `color=green`.
6. **Do NOT modify `results.json.baseline.value`** — that remains the original
   baseline. The comparison reference is tracked via `lastGreenCommit` (and
   its iteration's `metrics.outcome.after`).

**RED:**
1. Revert per C.3 (Revert Mechanism).
2. Increment `consecutiveRegressions`.
3. Record the failure in the experiment file — we learn from REDs too.
4. Annotate the git tag message with `color=red`.

**YELLOW:**
Default behavior: **revert**. Exceptions (keep) when either is true:
- (a) The change **reduces complexity**: net LOC decrease, dependency removal,
  dead code deletion, simpler architecture.
- (b) The change **opens a new hypothesis space** that is explicitly documented
  in the iteration's `nextSteps` field — the YELLOW is a stepping stone.

If kept:
1. Increment `consecutiveYellowKept`.
2. Record `autoDecision: "yellow"`, `reverted: false`, populate `nextSteps`.
3. Annotate the git tag with `color=yellow`.
4. **Three-consecutive-YELLOW-kept limit:** if `consecutiveYellowKept` reaches
   3, the next iteration — even if GREEN — must be followed by a force-revert
   to `lastGreenCommit` before proceeding. This prevents quiet drift where a
   series of "small simplifications" erodes the GREEN state unnoticed. Reset
   `consecutiveYellowKept` to 0 after the force-revert.

If reverted:
1. Revert per C.3.
2. Record `autoDecision: "yellow"`, `reverted: true`.

### C.3 Revert mechanism

Reverts are **file-scoped**, never `git reset --hard`, never `git clean -f`.

1. Read `results.json.lastGreenCommit` — the target state.
2. Compute the set of mutable paths modified since `lastGreenCommit`:
   ```bash
   git diff --name-only <lastGreenCommit>..HEAD -- <mutable_path_1> <mutable_path_2> ...
   ```
3. For each path in that set, run:
   ```bash
   git checkout <lastGreenCommit> -- <path>
   ```
4. Defensive scope check: if any file outside the mutable list shows as dirty
   after the revert, **halt the loop with a safety-rail stop** (Section G.1 —
   scope violation during the iteration). Do not auto-clean. Alert the user.
5. Create a revert commit to keep history linear and the next iteration's
   `git add` clean:
   ```bash
   git commit -m "research: revert iter <N> (<red|yellow>) — <metric> <before> -> <after>"
   git tag -a "research/<project>/<N>-revert" -m "Reverted iteration <N>: <reason>"
   ```
6. Record `reverted: true` in the iteration's `results.json` entry.

### C.4 Retroactive revert (reviewer-initiated)

If a reviewer consultation at iteration N returns verdict `RETRO_REVERT` with a
target iteration M < N (e.g., reviewer identifies that iteration M's GREEN was
based on data leakage or a methodology flaw), execute:

1. Mark `results.json.experiments[M].retroInvalidated = true` and set
   `retroInvalidationReason` to the reviewer's explanation.
2. **Prompt the user via a micro-gate** — retro-reverts are destructive enough
   to warrant explicit confirmation even in overnight mode:
   ```
   ::GATE:: id=specific-instructions-shared-autonomous-research-retro-<project>-<N> phase=2 kind=confirm
   Reviewer flagged iteration M's GREEN as invalid (<reason>). Rolling back to
   iteration M-1's state will discard iterations M..<current>. Confirm?
   ::ENDGATE::
   ```
3. On confirm: revert all commits after iteration M-1's `lastGreenCommit`
   using the file-level checkout protocol in C.3, expanded to cover the full
   range (M..HEAD).
4. Update `results.json.lastGreenCommit` to iteration M-1's commit SHA.
5. Resume the loop from the reverted baseline. **Iteration counter keeps
   incrementing** — no re-use of numbers. The next iteration is N+1, not M+1.

### C.5 Per-iteration validation (Fixer-level)

Each **kept** iteration (GREEN or kept-YELLOW) must produce a lightweight validation block following `shared/validation_protocol.md`. Reverted iterations (RED or reverted-YELLOW) do not — the change is gone, validation is moot.

The block is **not** written to `project-specs.md`. Instead, it is added to the iteration's entry in `experiments/results.json` under a new `validation` field:

```json
{
  "iteration": 7,
  "autoDecision": "green",
  "reverted": false,
  "metrics": { ... },
  "validation": {
    "track": "quick",
    "mode": "experiment",
    "checklist": "<agent_name>/validation_checklist.md",
    "checks": [
      { "check": "<id>", "observed": "<value>", "passFail": "✓", "notes": "" }
    ],
    "artifacts": ["results/iter7_metrics.json"],
    "summary": "<one sentence: what this iteration changed, what the smoke-check confirmed>"
  }
}
```

Constraints:
- Use the Fixer-level subset from the relevant checklist (e.g., ML `ML-12 + ML-06 diff`; AI `AI-02 + AI-03 diff`; DS `DS-11 + DS-12`).
- Minimum: headline metric value, at-most-one component test or smoke-check result, one-sentence summary.
- No `## Validation` section is written to `project-specs.md` during the AR loop — the Phase 3 research summary (Section I) consolidates validation across kept iterations.

The gate hook does **not** enforce this per-iteration block because AR iterations do not emit gate fences. Discipline is on the AR loop itself; the Phase 3 consolidation is where structural enforcement resumes.

---

## Section D — Reviewer Consultation Cadence

### D.1 When to consult

Always consult the reviewer on:
1. **First iteration** — establish methodology sanity early.
2. **Every K-th iteration** where K is the configured cadence (default: 3
   interactive, 10 overnight).
3. **After notable improvements** where the delta exceeds T% (default T=5% of
   baseline).
4. **Before stopping** on consecutive regression limit (Section E.5) — reviewer
   may save the run.
5. **When Steering Notes change** — a user-steered pivot benefits from a
   reviewer checkpoint.

Between consultations, record a one-line self-assessment in the iteration file
(the `## Self-Assessment` section). Honest: does this result feel real?
Methodology concerns? Don't wait for the reviewer to notice what you already
suspect.

### D.2 Reviewer verdict schema

Reviewers return one of four verdicts (in addition to the standard
APPROVED/NEEDS REVISION/BLOCKED structure from `reviewer_verdict_protocol.md`):

- **`CONTINUE`** — proceed as planned. Reviewer may include optional
  suggestions for the next hypothesis.
- **`REDIRECT`** — proceed, but pivot approach. Reviewer supplies a new
  hypothesis direction. Record `hypothesisSource: "reviewer-suggested"` on the
  next iteration.
- **`PAUSE`** — stop the loop and escalate to the user. Reviewer supplies the
  concern. The loop halts immediately and Phase 3 begins.
- **`RETRO_REVERT`** — a prior GREEN is invalid. Reviewer specifies the target
  iteration. Execute Section C.4.

### D.3 Dual-reviewer agents

Applied ML Scientist (DL Engineer + Researcher) and Deep Learning Engineer
(Applied ML Scientist + Researcher) have two reviewers. Consult them
**sequentially**, not in parallel:

1. **Technical reviewer first** (DL Engineer for Applied ML Scientist; Applied
   ML Scientist for Deep Learning Engineer) — architecture, implementation,
   feasibility.
2. **Methodology reviewer second** (Researcher) — gets the technical
   reviewer's verdict as input so they can comment on the combined picture.

Dual-reviewer cost is **2× per cadence hit** and must be reflected in the cost
ceiling (Section G.5). If cost ceiling pressure is high, consider raising K
rather than dropping one reviewer — both perspectives matter.

### D.4 Consultation call format

Call the reviewer via Task:

```
Task(
  subagent_type="<reviewer>",
  description="AR iteration N review",
  prompt="""
You are being consulted mid-AR-loop to review this iteration's result and the
run's trajectory so far.

**Project context:** <1-paragraph summary from project-specs.md>
**Primary metric:** <metric name>
**Baseline:** <value>
**Current iteration:** N of <budget>
**Hypothesis:** <this iteration's hypothesis>
**Changes made:** <what was touched>

**Metrics (before -> after):**
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
<rows>

**Auto-decision:** <green | red | yellow>
**Trajectory so far:** <one-paragraph summary of accumulated results — best
iteration, average delta, any patterns>

Please respond with:
1. **Verdict:** CONTINUE | REDIRECT | PAUSE | RETRO_REVERT
2. **Reasoning:** why
3. **If REDIRECT:** suggested next hypothesis
4. **If RETRO_REVERT:** which iteration number is invalid and why
5. **If PAUSE:** what concern the user needs to see

Keep it concise and actionable.
  """
)
```

Apply the standard reviewer verdict protocol afterward (`reviewer_verdict_protocol.md`).

---

## Section E — Convergence Detection

Convergence checks **do not fire until after an activation floor** of
`max(10, budget * 0.2)` iterations. Early in a hard problem it is normal to see
5+ consecutive REDs before the first GREEN — firing PLATEAU at iteration 5 is
a false positive. The floor prevents premature convergence.

**Exception:** METRIC FLOOR BREACH (E.6) is always live — emergency stops do
not wait.

Stop when ANY of the following is true:

### E.1 PLATEAU

No GREEN result in W consecutive iterations (default W=5) **AND** DIMINISHING
RETURNS (E.2) is also true. **Require both signals** — single-signal PLATEAU
produces too many false positives on hard problems.

### E.2 DIMINISHING RETURNS

Average improvement rate over the last W GREEN results is less than threshold
(default: 0.1% of baseline per GREEN iteration). Measured as
`mean(delta_over_last_W_greens) < threshold`.

### E.3 BUDGET EXHAUSTED

Iteration count reaches the configured budget.

### E.4 COST CEILING

Token count or dollars-spent reaches the ceiling from Section A.3. Hard stop —
no further iterations. See Section G.5 for the warning-and-stop schedule.

### E.5 CONSECUTIVE FAILURES

`consecutiveRegressions` reaches K (default K=3). Before stopping, consult the
reviewer per Section D.1 item 4 — the reviewer may return `REDIRECT` and save
the run.

### E.6 METRIC FLOOR BREACH

Primary metric falls below the configured floor (if set) on a **full
evaluation**. Always live — ignores the activation floor. Immediately:
1. Revert per C.3.
2. Halt the loop.
3. Record the breach in `results.json.convergence.reason` as `metric-floor-breach`.

A proxy evaluation below floor does NOT trigger E.6 directly. Instead:
1. Automatically re-run a full evaluation on the same iteration.
2. If the full evaluation is also below floor, trigger E.6.
3. If the full evaluation is above floor, the proxy was noisy; continue
   normally but mark this iteration for future attention.

### E.7 Convergence record

When any stop condition fires (Section E) **or any safety rail halts the loop
(Section G)**, write to `results.json.convergence`:

```json
"convergence": {
  "detected": true,
  "reason": "plateau | diminishing-returns | budget-exhausted | cost-ceiling | consecutive-failures | metric-floor-breach | user-interrupt | reviewer-pause | scope-violation | error-limit | timeout-limit",
  "iterationsSinceLastGreen": <N>,
  "consecutiveRegressions": <N>,
  "consecutiveYellowKept": <N>,
  "avgImprovementRate": <number>,
  "activationFloorReached": <bool>,
  "finalIteration": <N>
}
```

The reason enum:
- Section E stops: `plateau`, `diminishing-returns`, `budget-exhausted`,
  `cost-ceiling`, `consecutive-failures`, `metric-floor-breach`,
  `user-interrupt`, `reviewer-pause`.
- Section G safety-rail halts: `scope-violation` (G.1), `error-limit` (G.3 —
  three consecutive crashes), `timeout-limit` (G.4 — three consecutive
  timeouts which itself triggers G.3's error-limit path — record
  `timeout-limit` as the more specific reason).

---

## Section F — results.json Schema Extensions

The AR schema extends the `[EX]` results.json schema. All existing fields
(`projectName`, `agent`, `outcomeMetric`, `baseline`, `experiments[]`,
`versioningMode`, `checkpoint`, etc.) remain the same. AR adds these fields.

### F.1 Top-level additive fields

```json
{
  "mode": "autonomous-research",
  "preset": "interactive" | "overnight" | "custom",
  "steeringDocument": "experiments/research_brief.md",
  "constraints": {
    "iterationBudget": <N>,
    "perIterationTimeLimit": "<duration or null>",
    "maxConsecutiveRegressions": <N>,
    "metricDegradationFloor": <number or null>,
    "reviewerCadence": <N>,
    "plateauWindow": <N>,
    "diminishingReturnsThreshold": <number>,
    "epsilon": <number>,
    "costCeiling": {
      "tokens": <N or null>,
      "dollars": <number or null>
    },
    "fullEvalCadence": <N>,
    "microGateEveryK": <N or null>,
    "microGateAutoCloseSeconds": <N or null>
  },
  "convergence": {
    "detected": <bool>,
    "reason": "<stop reason or null>",
    "iterationsSinceLastGreen": <N>,
    "consecutiveRegressions": <N>,
    "consecutiveYellowKept": <N>,
    "avgImprovementRate": <number>,
    "activationFloorReached": <bool>,
    "finalIteration": <N or null>
  },
  "lastGreenCommit": "<sha or null>",
  "costAccounting": {
    "tokensIn": <N>,
    "tokensOut": <N>,
    "dollarsSpent": <number>,
    "reviewerTasksSpawned": <N>
  }
}
```

### F.2 Per-experiment additive fields

Each entry in `experiments[]` gains:

```json
{
  "autoDecision": "green" | "red" | "yellow",
  "reverted": <bool>,
  "retroInvalidated": <bool>,
  "retroInvalidationReason": "<string or null>",
  "hypothesisSource": "adaptive" | "steering" | "reviewer-suggested",
  "evalType": "full" | "proxy",
  "reviewerVerdict": "CONTINUE" | "REDIRECT" | "PAUSE" | "RETRO_REVERT" | null,
  "nextSteps": "<string, populated for kept YELLOWs>"
}
```

### F.3 Optional branch context (fan-out only)

Populated only in branches spawned by the Section H fan-out protocol:

```json
"branchContext": {
  "branchSlug": "<slug>",
  "approachConstraint": "<one-line description>",
  "parentProjectDir": "<path>",
  "gitStrategy": "branch-local" | "lockfile" | "no-vcs"
}
```

### F.4 Backward compatibility

- An `[EX]` `results.json` has `mode: "experiment"` (or no `mode` field in
  pre-AR installations — treat absence as `"experiment"`).
- An AR `results.json` has `mode: "autonomous-research"`.
- The UI dashboard must detect `mode` and render accordingly (AR-specific
  panel) OR gracefully degrade to the experiment view if no AR renderer is
  available.

### F.5 UI compatibility

The Shards UI dashboard reads `results.json` for live updates. Before shipping
AR, verify that the dashboard renderers tolerate `mode: "autonomous-research"`.
The dashboard should:
- Show iteration budget (not just plannedCount).
- Show per-iteration color coding (green/red/yellow).
- Show `lastGreenCommit` and revert history.
- Show cost accounting running totals.
- Surface convergence reason when the run ends.

If no AR-specific renderer is available, the experiment dashboard must render
AR runs by falling back to `iterationBudget` where `plannedCount` is absent,
and displaying auto-decision colors in the outcome column.

---

## Section G — Safety Rails

### G.1 Scope enforcement

Every file-modifying tool call in Phase 2 (`Edit`, `Write`, `NotebookEdit`)
verifies the target path is in the mutable set from the research brief. If a
path is not mutable:
1. Halt the iteration immediately.
2. Record `results.json.convergence.reason = "scope-violation"`.
3. Alert the user with the attempted path and the reason.

Scope is **path-based, not content-based**. Globs in the mutable list are
supported (e.g., `training/**/*.py`). An immutable-by-default policy applies:
anything not explicitly mutable is immutable.

**Bash commands** that modify files (e.g., `rm`, `mv`, `cp` into immutable
paths, `sed -i`, tooling that regenerates configs) also fall under this rule.
If an iteration's plan requires a shell command that touches immutable paths,
halt before running it and escalate to the user. The safe practice is to
avoid file-modifying shell commands in the loop entirely — use `Edit` / `Write`
/ `NotebookEdit` which are checkable ahead of time.

### G.2 Metric floor breach

Covered in E.6. Full-eval-only trigger; proxy breaches force a full re-eval.

### G.3 Error limit

3 consecutive iteration crashes (uncaught exception during implementation or
evaluation) → stop. The codebase may be broken. Record
`convergence.reason = "error-limit"`. Revert to `lastGreenCommit`.

### G.4 Time budget

Per-iteration timeout. If exceeded: abandon the iteration, revert per C.3,
record `"timeout"` in the iteration file, and do NOT increment the iteration
counter for retry — count it as a normal iteration that happened to fail. If
3 consecutive timeouts occur, trigger G.3 (error limit).

### G.5 Cost ceiling

Hard stop at 100% of the ceiling from Section A.3. **Soft warnings** at 50%
and 80% printed inline:

```
[AR] Cost warning: 50% of ceiling reached (<metric>: <spent> / <ceiling>).
     Continuing. You can edit research_brief.md to adjust the ceiling.
```

Reviewer Tasks and proxy evaluations **both count against the ceiling**.

Required for `overnight` preset; optional for `interactive` (warn but do not
force if user chose to omit).

### G.6 No destructive operations

**Never:**
- Delete data files (training data, eval sets, raw inputs).
- Drop database tables or views.
- Remove checkpoints, model artifacts, or logs.
- Run `git reset --hard`, `git clean -f`, or `git push --force`.
- Remove git tags or refs.

File-level `git checkout <sha> -- <path>` is the only allowed reverting operation.

### G.7 Git safety

- File-scoped checkout only.
- Never hard reset.
- Never force push.
- Never `git clean -f` or `git clean -fd`.
- Tag creation is append-only — never delete or force-overwrite tags.

### G.8 Interrupt handling

If the agent detects it was interrupted mid-iteration (on resume, finds a
commit without a matching `results.json` entry, or vice versa):
1. Record the partial state as a dropped iteration in the research log.
2. Resume from the last clean `lastGreenCommit`.
3. Do not auto-clean any orphan files. Present the situation to the user
   before continuing.

---

## Section H — Fan-Out Composition with DIVERGE

This section defines how AR composes with the DIVERGE protocol to support
parallel exploration of multiple approach families. Solo AR remains the default
and is the depth primitive. Fan-out is the breadth primitive.

### H.1 When to propose fan-out

Fan-out can be initiated by either:

- **The specialist** at its `[AR]` Phase 1 gate, when writing the research
  brief surfaces 2-3 viable approach families that satisfy DIVERGE
  preconditions (see `diverge_protocol.md` Section A).
- **Syn** during triage or brainstorm, when the user's request is broad
  ("improve metric X, try everything") and Syn identifies distinct approach
  families warranting parallel exploration, possibly across different
  specialist types.

Fan-out preconditions (inherited from DIVERGE):
- 2-3 mutually exclusive approaches that are genuinely viable.
- No single approach is clearly superior.
- The approaches are fundamentally different (not hyperparameter variations —
  that is what the AR loop itself already does).

### H.2 DIVERGE proposal at AR Phase 1

If fan-out is warranted, propose DIVERGE before the research brief gate.
Follow `diverge_protocol.md` Section B (proposal format + gate), with these
AR-specific adjustments:

- **Gate ID namespace:** use
  `specific-instructions-shared-diverge-protocol-ar-<project>` for the AR
  proposal gate. This avoids collision with planning-phase DIVERGE gate IDs.
- **Branch slugs:** reflect approach families, not specialists. Example slugs
  for an ML Engineer fan-out: `ml-xgboost`, `ml-neural-net`, `ml-linear-baseline`.
- **Proposal context:** include the AR budget, primary metric, and per-branch
  budget split (each branch gets the full budget; the total AR budget is
  effectively multiplied by K branches — confirm with the user that cost
  implications are accepted).

The user confirms one of:
- (a) Solo AR with the current brief (no fan-out).
- (b) Fan-out with the proposed K approach families.

### H.3 Branch spawning

If fan-out confirmed, spawn K parallel Task calls in a single message (not
sequentially). Each Task is:

```python
Task(
  subagent_type="<specialist>",
  description="AR fan-out branch: <branch-slug>",
  prompt="""
You are in BRANCH + AR MODE — an isolated Time-Travel branch running the
autonomous research protocol.

**Branch slug:** <branch-slug>
**Branch directory:** <project_dir>/.shards/branches/<branch-slug>/
**Approach constraint:** <one-paragraph description of the approach family
this branch must stay within — e.g., "tree-based methods only; no neural
networks; no linear models">
**Git strategy:** <branch-local | lockfile | no-vcs — see Section H.5>

## Project Context (from completed planning phases)

<Insert full text of completed project-specs.md phases — Phase 0 through any
prior planning phase. Do NOT include the DIVERGE section or brainstorm
transcripts.>

## AR Configuration (inherited from parent's Phase 0)

- **Primary metric:** <metric> (direction: <max | min>)
- **Baseline:** <value>
- **Preset:** <interactive | overnight | custom>
- **Iteration budget (this branch):** <N>
- **Mutable scope:** <list>
- **Immutable scope:** <list>
- **Cost ceiling (this branch):** <value or null>
- **Reviewer cadence:** <K>
- **Steering documents:**
  - Global: `<project_dir>/experiments/research_brief.md`
  - This branch (optional): `<branch_dir>/experiments/research_brief.md`

## Your Task

Execute Sections A-G of the shared AR protocol autonomously inside this branch
directory. **Do not emit `::GATE::` fences** — sub-agents invoked via Task must
not emit gates (harness rule). Phase 0 is already set up by this spawn prompt.
Phase 1 writes the branch-local research_brief.md without a gate. Phase 2 runs
gate-free as designed. Phase 3 is truncated to writing `branch-report.md` only
(no user-facing summary gate).

Produce:
1. Branch-local AR artifacts: `experiments/research_brief.md`,
   `experiments/results.json` (with `branchContext` populated), per-iteration
   files.
2. A final `<branch_dir>/branch-report.md` summarizing the branch's best state
   per the DIVERGE branch-report template (`diverge_protocol.md` Section E).
3. Git commits on the chosen git strategy (H.5).
  """
)
```

### H.4 Per-branch file layout

```
<project_dir>/.shards/branches/<branch-slug>/
  experiments/
    research_brief.md       # per-branch steering (optional override of global)
    results.json             # per-branch AR results with branchContext set
    history_summary.md       # per-branch windowed history (if N > 10)
    experiment_1_<name>.md
    experiment_2_<name>.md
    ...
  branch-report.md           # final summary for arbiter
```

The main project dir keeps:
- The global `experiments/research_brief.md` (applies to all branches unless
  overridden at the branch level).
- The canonical `project-specs.md` with the DIVERGE section written per
  `diverge_protocol.md` Section D.

### H.5 Concurrent git strategy

When multiple branches run in parallel, all committing to the same repo, naive
`experiment_versioning.md` Section B calls will race on the index lock, collide
on tag names, and interleave history. Each branch MUST pick one strategy at
spawn time and record it in `results.json.branchContext.gitStrategy`:

**`branch-local` (default for AR fan-out):**
- Before Phase 2, branch runs `git checkout -b ar/<branch-slug>`.
- All commits on its own git branch. No cross-branch collisions.
- Tag namespace: `research/<project>/<branch-slug>/<N>-<name>`.
- At promotion (Section H.9), `git merge --squash ar/<winner>` onto the main
  working branch. Losing branches remain as refs for reference — deletion
  requires explicit user confirmation.

**`lockfile`:**
- Branches share the main working ref.
- All git operations serialize via a file lock at
  `.shards/branches/.git-lock` (create with `O_EXCL`, retry-with-backoff on
  contention — default 5 retries, 100ms-1s exponential backoff).
- Acceptable for K ≤ 2; degrades under contention.
- Tag namespace: `research/<project>/<branch-slug>/<N>-<name>` (includes slug
  to prevent collisions even on shared ref).

**`no-vcs`:**
- Branches disable Section B checkpoint calls entirely.
- Lineage relies solely on per-iteration markdown + `results.json`.
- A single consolidation commit is made at promotion time.
- Fallback only — use when git is unavailable or intentionally disabled.

Solo AR uses the main working ref directly — no branch-local ref required.

### H.6 Steering in fan-out

Every iteration, each branch re-reads:
1. The **global** `research_brief.md` at the project root (applies to all
   branches).
2. Its **branch-level** steering notes at
   `<branch_dir>/experiments/research_brief.md` if present.

The user can edit either during the run:
- Edit the global brief to steer all branches simultaneously.
- Edit a branch-level brief to redirect one branch without affecting others.

### H.7 Branch convergence

Each branch runs Section E convergence checks independently inside its own AR
loop. A branch terminates when it converges, exhausts its budget, or breaches
a safety rail. **Branches do not wait for each other.** The parent specialist
(or Syn) waits for all branch Tasks to return before arbitration.

### H.8 Branch gate policy

Branches are Task-invoked sub-agents. Per `syn/arbiter.md` and the harness
sub-agent rule, sub-agents **must not emit `::GATE::` fences**. All
human-facing gates live in the parent's Phase 3 (arbitration + consolidated
summary).

- Phase 0: inherited from the parent's spawn prompt. No gate.
- Phase 1: write the branch-local research_brief.md. No gate.
- Phase 2: gate-free loop as designed.
- Phase 3: truncated to writing `branch-report.md`. No gate.

### H.9 Arbitration

After all branches complete, the initiating specialist (or Syn) invokes Syn
Arbiter Mode per `diverge_protocol.md` Section F, passing the list of
`branch-report.md` paths. The arbiter produces
`.shards/branches/leaderboard.md`.

The parent specialist presents the leaderboard to the user, who selects the
winner.

### H.10 Knowledge harvest in fan-out

**Losing branches do NOT run `knowledge_harvest.md` independently.** That would
flood the ledger with duplicate or conflicting candidates across branches
exploring similar territory.

- Only the **winning branch** contributes to harvest.
- The parent specialist runs harvest as part of its consolidated Phase 3
  **after promotion**.
- Harvest candidates come from:
  1. The winning branch's artifacts (brief, iteration files, results.json).
  2. Cross-branch patterns that Syn Arbiter flagged in the leaderboard (e.g.,
     "three of four branches hit the same data leakage issue" — a pattern
     worth harvesting even though no individual branch would have flagged it).

### H.11 Promotion

Follow `diverge_protocol.md` Section G with these extensions for AR git
strategies:

- **`branch-local`:** `git merge --squash ar/<winner>` onto the main working
  ref. Copy branch-dir artifacts (brief, results.json, iteration files,
  history_summary.md) to `<project_dir>/experiments/`. Tag the merge with
  `research/<project>/converged/<winner>`.
- **`lockfile`:** artifacts are already on the main ref under the
  `<branch-slug>/` tag prefix. Copy branch-dir artifacts to
  `<project_dir>/experiments/`. Tag the consolidation:
  `research/<project>/converged/<winner>`.
- **`no-vcs`:** make the single consolidation commit now
  (`research: converge <winner>`). Copy artifacts. Tag
  `research/<project>/converged/<winner>`.

Losing branches are preserved under `.shards/branches/` for reference.

---

## Section I — Phase 3 (Research Summary)

Run this section after the loop exits (any E condition, user interrupt, or
reviewer PAUSE).

### I.1 Finalize results.json

- Set `"status": "complete"`.
- Set `convergence.detected = true` and populate the full convergence object.
- Set final cost accounting totals.
- Set final metric value and net delta from baseline.

### I.2 Write `experiments/research_summary.md`

Factual synthesis — no opinions in this file:

```markdown
# AR Research Summary: <Project Name>

- **Date:** <date>
- **Agent:** <agent name>
- **Brief:** `experiments/research_brief.md`
- **Primary metric:** <metric name>
- **Preset:** <interactive | overnight | custom>

## Baseline vs Final
- **Baseline:** <value> (from <source>)
- **Final:** <value>
- **Net delta:** <+/->
- **Target reached:** Yes | No | N/A (no target set)

## Convergence
- **Detected:** Yes | No
- **Reason:** <plateau | diminishing-returns | budget-exhausted | cost-ceiling | consecutive-failures | metric-floor-breach | user-interrupt | reviewer-pause>
- **Iterations completed:** N of <budget>
- **Activation floor reached:** Yes | No

## Keep/Revert Breakdown
| Color | Count | Kept | Reverted |
|-------|-------|------|----------|
| Green | <N> | <N> | 0 |
| Red | <N> | 0 | <N> |
| Yellow | <N> | <N> | <N> |

## Evaluation Type Breakdown
- **Full evaluations:** <N>
- **Proxy evaluations:** <N>
- **Proxy→full re-runs triggered:** <N>

## Cost Accounting
- **Tokens in:** <N>
- **Tokens out:** <N>
- **Dollars spent:** <value>
- **Reviewer Tasks spawned:** <N>
- **Cost ceiling:** <value or "none set">

## Iteration Timeline
| # | Hypothesis | Source | Eval | Color | Kept | Delta | Reviewer |
|---|-----------|--------|------|-------|------|-------|----------|
| 1 | ... | adaptive | full | green | yes | +0.02 | CONTINUE |
| 2 | ... | steering | proxy | yellow | yes | 0 | - |
| ... |

## Patterns
<factual observations across iterations — what clusters of hypotheses worked,
which failed for the same reason>

## Current State
<what is currently checked in — the state that would be preserved if the user
adopts this run>
```

### I.3 Write `experiments/research_recommendations.md`

Opinionated agent voice:

```markdown
# AR Research Recommendations: <Project Name>

- **Date:** <date>
- **Agent:** <agent name>
- **Iterations run:** N
- **Primary metric:** <metric>
- **Baseline → Final:** <value> → <value> (<delta>)

## What I Tried
<narrative of the run — what I chased, why, and how the search evolved>

## What Worked
<GREEN iterations with your read on why>

## What Didn't Work
<RED and reverted YELLOW iterations with your interpretation>

## Surprises
<anything you did not expect — either pleasantly or otherwise>

## My Recommendation
<the clearest path forward — what to adopt, what to discard, what to try next
if the user wants to keep going. Opinionated.>

## If I Could Run Another Budget
<your top 3 hypotheses for a next run, prioritized>
```

### I.4 Update project-specs.md

Append / update the `## Autonomous Research` section in `project-specs.md`:

```markdown
## Autonomous Research
- **Status:** Complete
- **Preset:** <preset>
- **Iterations:** <N> of <budget>
- **Primary metric:** <metric>: <baseline> → <final> (<delta>)
- **Convergence reason:** <reason>
- **Cost spent:** <tokens / dollars>
- **Brief:** `experiments/research_brief.md`
- **Summary:** `experiments/research_summary.md`
- **Recommendations:** `experiments/research_recommendations.md`
```

Also write a consolidated `## Validation` section to `project-specs.md` per `shared/validation_protocol.md`. The Phase 3 gate is validation-eligible (the AR run produces a durable set of kept iterations / final artifact), and the gate hook enforces the schema at Phase 3.

Consolidation rules:
- **Track:** `deep` (Phase 3 is the deep gate; per-iteration blocks were already Fixer-level)
- **Mode:** `research`
- **Evidence:** pull the headline metric per kept iteration from `results.json.experiments[*].validation` and aggregate. Expected format: one row per check ID from the agent's Fixer subset, with Observed = "N iterations × check, M passes, K n/a" or the final-iteration value for diff-style checks.
- **Artifacts:** `experiments/results.json`, `experiments/research_summary.md`, the final-iteration checkpoint commit SHA, any per-iteration artifacts referenced in `validation.artifacts`
- **Downstream Impact:** consumers of the final artifact (services, marts, reports) — same analysis the agent would do in a normal deep-track phase
- **Summary:** two to four sentences on what was validated across the kept iterations, what residual risk exists, and what would need a fuller validation pass if this is productionized

This section is machine-readable by the gate hook when Phase 3 emits its gate with `validates=<agent>`. Per-agent `research.md` files are responsible for including that attribute on their Phase 3 gate fence.

### I.5 Knowledge harvest

Run `.claude/agents/specific_instructions/shared/knowledge_harvest.md` per its
protocol. In fan-out contexts, only the initiating parent runs harvest after
promotion (see Section H.10).

### I.6 Present to user (GATE)

Read both the summary and recommendations back to the user.

**The Phase 3 gate is owned by the per-agent `research.md` file**, not by this
shared protocol. Each agent emits its own Phase 3 gate with its
agent-specific ID (e.g., `specific-instructions-ml-engineer-research-phase3`
for ML Engineer, `specific-instructions-ai-engineer-research-phase3` for AI
Engineer, etc.). Do **not** emit a shared-protocol Phase 3 gate here — doing
so would duplicate the gate or orphan the ID namespace.

The typical gate body is:

> Ask the user:
> - What do you want to adopt from this AR run?
> - Do you want to run another budget (fresh AR session)?
> - Or should we stop here?

Wait for the user's decision before taking any further action. Per-agent
`research.md` files define the exact gate line (see each agent's Phase 3
section).
