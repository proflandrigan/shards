---
name: autonomous-research-protocol
description: >
  Shared autonomous research (AR) mode protocol. Defines the self-steering
  research loop inspired by autoresearch: budget-bounded, adaptive hypothesis
  generation, auto-keep/revert based on metric movement, steering document
  the user can edit mid-loop, and convergence detection. Referenced by AR-capable
  agents (ML Engineer, AI Engineer, Data Scientist, Applied ML Scientist, Deep
  Learning Engineer). Section H defines AR fan-out: one branch lead per
  approach family, each in its own git worktree, with workers per iteration.
type: reference
---

# Autonomous Research (AR) Protocol

`<project_dir>` below is the agent's `output_dir` (`shards/<project>/`, `shards/<project>/mlops/`, or the legacy project folder when resuming).

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
- The changes are not revertable via git — AR requires versioning for safety. AR
  also needs `git.commit` enabled for its per-iteration checkpoints. If it is
  `false`, ask the user to enable it or use `[EX]`.

---

## Section A — Research Brief Initialization

Run this section at the start of Phase 1 (Research Brief), after Phase 0 setup
has been gated and confirmed.

### A.1 Prior knowledge

Before writing the brief, follow {{protocol sources}} (the AR keywords: metric,
domain, approach family) and search the knowledge source.

{{knowledge.search query="<metric> <domain> <approach family>"}}

Match criteria most useful for AR:
- **Metric** — has a prior AR or study measured this metric on similar data?
- **Domain** — dataset, entity, or business area match.
- **Approach family** — have prior runs explored the same model family (e.g.,
  gradient boosting, transformer, prompt-chain)?

Surface relevant search results (saturation points, known-leaky features,
architectural dead ends) to the user alongside the draft brief. Prior runs may
warn you off hypotheses that look promising but are already-tested dead ends.

### A.2 Determine preset

Confirm with the user which preset is active (established at Phase 0):

- **`interactive`** (default) — budget=10, reviewer cadence=3, no required
  wall-clock budget. User is nearby and expects an engaged session. Closest in
  character to a beefed-up `[EX]`.
- **`overnight`** — budget=100, reviewer cadence=10, wall-clock budget
  (minutes) required. User is away; agent runs long, driven by a shell loop
  (§G.9). Decisions that need a human are deferred, not gated (§B.14).
  Interrupt mechanism for unattended runs
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
  regressions, metric degradation floor, wall-clock budget in minutes (required
  for overnight), and an optional cost ceiling (tokens and/or dollars;
  advisory only, §G.5).
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
> Phase 3 remain gated, and you confirm the Phase 3 adoption gate yourself even
> on an unattended run. You can steer the loop at any time by editing
> `experiments/research_brief.md` — I re-read it every iteration.

### A.6 Unattended loops: the `plan` gate policy

Goal mode is the `plan` gate policy (see `goal_mode.md`). At the per-agent
Phase 1 gate, offer the user an unattended Phase 2 loop. Present the plan and
budget (iteration budget, wall-clock minutes, primary metric, target, metric
floor). The per-agent Phase 1 gate **is** the plan approval: do not raise a
second gate.

- **If the user chooses unattended:** call `gate_request` for the Phase 1 gate
  with the extra argument `plan_approval: "<run-id>"`. The run id names this
  run only, for example `<project>-ar-<UTC yyyymmddThhmm>` (letters, digits,
  `.`, `_`, `-`). Then STOP and wait for the user; never confirm it yourself.
  The user confirms via the in-host prompt (elicitation, or the permission
  prompt `gate_advance` raises) or by replying in chat, in which case relay
  their verbatim reply with `gate_confirm`.
- **Otherwise:** call the same gate without `plan_approval`.

A plan approval covers one run in one project. Each new run raises its own
Phase 1 gate with a new run id; the runtime then treats the gate as a fresh,
pending gate (it does not return "already confirmed" for the earlier run), and
the earlier run's approval stops applying as soon as the new one is requested.
The notice budget (`gates.budget`) is counted per plan approval. Use the same
run id for `plan_approval` and `ar_start`'s `run_id`: the runtime then raises
that plan's budget to cover the AR budget (`max_gates` at least iterations + 2,
`max_minutes` at least the AR wall-clock window plus slack), so a long run does
not exhaust the plan before its own budget. `ar_start` reports the effective
plan budget as `plan`.

Tell the user the activation is optional:
- **With plan approval:** after the user confirms, mid-loop gates (opted-in
  micro-gates, §B.12) are recorded as notices and the loop keeps running. A
  gate with failing or anomalous evidence, or budget exhaustion, puts a human
  back in the loop: that gate waits for the user.
- **Without it (default `phase` policy):** the loop still runs autonomously
  per §B. `confirm`/`checkpoint` gates with `evidence.status: "pass"` are
  recorded automatically; a failure or anomaly blocks until the user confirms.
  Under `strict`, a human confirms every gate.

**Per-iteration evidence is recorded, not gated.** Phase 2 does not call
`gate_request` once per iteration under any policy. Each iteration's evidence
is its `results.json` entry (with the C.5 validation block), its experiment file
and its checkpoint commit (B.9). The only gates inside Phase 2 are the opted-in
micro-gates (B.12) and, on attended runs, the retro-revert confirmation (C.4).
Unattended runs defer that confirmation instead (§B.14).

**The Phase 3 adoption gate is always confirmed by a human**, under every
policy, including `plan` after a plan approval. Each agent requests it with
`requires_human: true`; the runtime never turns such a gate into a notice or
auto-recorded evidence, so it waits for the user under every policy. Tell the
user the run will stop at the Phase 3 gate for their decision. If it ever comes
back as "notice recorded", treat it as not yet confirmed: present the summary
and wait for the user's explicit go-ahead before any adoption step.

Either way, §E convergence and §G safety rails are unchanged. The per-iteration
**inline summary echo** in §B.4 and §B.8 stays recommended: it keeps the run
readable in the transcript.

---

## Section B — The Research Loop

Phase 2 executes this loop until a stop condition in Section E fires or the user
interrupts. **No intermediate gates between iterations by default** — the
autonomous loop is the whole point. The optional micro-gate (Section B.12) is
opt-in and only on the overnight preset.

### Runtime path (use it when the AR tools are available)

When the Shards runtime offers `ar_start`, `ar_iterate`, `ar_status` and
`ar_end`, use them. They replace the manual bookkeeping in B.6, B.7, B.9, C.1
to C.3 and the stop checks of Section E. **Do not run the eval yourself, do not
self-report a metric, and do not use git to keep, revert or checkpoint.** The
runtime does all of it, and its numbers are the record.

1. **Start (replaces the pre-loop setup below).** Call `ar_start` with the
   project dir, the brief path, the mutable and immutable lists from the
   brief, the eval spec (`command`, `metric_regex` or `json_path`, `direction`,
   `timeout_s`, `repeats`), the budget (`iterations`, `minutes`) and
   `epsilon` (% of baseline). It:
   - refuses a dirty mutable scope (ask the user to commit or stash)
   - snapshots `preLoopDirty`
   - pins hashes of the immutable paths and of the eval command
   - opens the AR lease that enforces the write scope
   - measures the baseline `repeats` times, which sets the noise floor:
     `epsilon_abs = max(epsilon% × |baseline|, 2σ)`
   - creates the research journal ref `refs/shards/research/<project>/<run>`
     with the baseline as its first commit
2. **Each iteration.** Do B.1 to B.5 as written. Then call
   `ar_iterate(hypothesis, source)` instead of B.6, B.7 and B.9. It:
   - checks the immutable pins (a change is `tamper`: RED, revert, halt)
   - runs the eval under its timeout and writes
     `experiments/iter_<N>.log`
   - classifies per C.1 against the comparison reference, using
     `epsilon_abs`; a YELLOW is kept only when the mutable diff has a net LOC
     delta below 0
   - commits the iteration, kept or not, to the research ref with `AR-*`
     trailers
   - reverts a RED or an unkept YELLOW to `lastKeptCommit`: it restores
     files and deletes the new files the loop created in the mutable scope,
     then adds a revert commit
   - moves the pointers only after the commit exists
   - returns `{decision, before, after, kept, converged, stop_reason}`

   Use those values in B.8 (the iteration record, the Research Log line, and
   the `results.json` entry, which is now a derived view of the ref). Do B.10
   as written. If `converged` is true, a stop condition fired (B.11): go to
   Phase 3.
3. **Status and resume.** `ar_status` reports the iterations, decisions,
   `bestSoFar`, the budget remaining and the stop reason. After a context loss
   or in a new session, the runtime rebuilds the run from the research ref.
   `ar_status(run_id, resume=true)` reopens the lease so the loop can continue.
   This replaces G.8's manual reconciliation. It also lists the pending
   deferred decisions.
4. **Defer (unattended runs).** A decision that needs a human (reviewer
   `RETRO_REVERT` or `PAUSE`, a metric floor breach) goes to `ar_defer` and the
   loop continues (§B.14); nothing blocks overnight.
5. **Stop.** Call `ar_end(reason)` when a stop condition fired (the runtime's
   `stop_reason`), when the user halted the run (B.1), or for a reviewer stop.
   That includes `consecutive-failures` after the §D consult; the runtime does
   not decide E.5 on its own. `ar_end` records the reason on the ref and closes
   the lease. Kept changes stay uncommitted in the working tree until the
   Phase 3 gate.

Without the runtime (a host with no Shards MCP server), follow the manual steps
below and in Sections C and E.

### Pre-loop setup (manual path)

At the start of Phase 2, before iteration 1:

1. **Pre-loop commit.** Run `git rev-parse HEAD` (via the `experiment_versioning.md`
   Section A detection) to capture the pre-loop commit. Set both
   `results.json.lastKeptCommit` and `results.json.lastGreenCommit` to this SHA,
   and `results.json.comparisonReference` to `baseline.value`.
2. **Dirty snapshot.** Run `git status --porcelain --untracked-files=all` and
   record every listed path in `results.json.preLoopDirty`. These are the
   user's own uncommitted changes; the scope check in C.3 ignores them and the
   revert never deletes them.
3. **Mutable scope must start clean.** If any `preLoopDirty` path is inside the
   mutable scope, a revert would overwrite or delete the user's uncommitted
   work. Run this check before raising the Phase 1 gate as well; if it finds
   such paths, ask the user to commit or stash them before Phase 2 starts.

Two commit pointers drive the loop. Both are always updated by the agent, never
searched via `git log`:

- **`lastKeptCommit`** — the **revert target**: the checkpoint commit of the
  most recent kept iteration (GREEN or kept YELLOW), or the pre-loop commit.
  Every revert (C.3) restores the mutable scope to this commit, so a later RED
  never discards a kept YELLOW.
- **`lastGreenCommit`** — the checkpoint commit of the most recent GREEN. It is
  a record of the best verified state, used by the retro-revert (C.4) and the
  Phase 3 summary. It is not the revert target.

The **comparison reference** (`results.json.comparisonReference`, C.1) is a
metric value, separate from both pointers.

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
- At iteration N > 10: read `experiments/history_summary.md`, which covers
  iterations 1..S where S is the largest multiple of 10 below N, plus the raw
  `results.json` entries S+1..N-1 (at most 9). Every prior iteration is covered
  exactly once: by the summary or by a raw entry.

Writing `history_summary.md`: at iterations 11, 21, 31, ..., first read the
previous summary and the raw entries since it, then consolidate iterations
1..N-1 into a short summary (approach families tried, what worked, what
didn't, metric trajectory). Overwrite the file. At iteration 11 it summarizes
1-10; at 21 it summarizes 1-20; and so on.

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

This is the **start-of-iteration** echo. The matching **end-of-iteration** echo
is recommended at B.8 below — it keeps the loop legible in the transcript.

#### B.5 Implement

Make the changes. **Scope enforcement is hard**: every Edit/Write target path
must be in the mutable set from the research brief. Before writing, verify the
target path matches one of the mutable patterns. If a change would require
touching an immutable file, halt the iteration and record a scope-violation
stop per Section G.

Keep changes minimal and isolated to the hypothesis. No drive-by cleanups.

#### B.6 Evaluate

With the runtime, `ar_iterate` runs the eval (see "Runtime path"); skip the
rest of this step. Otherwise run the evaluation protocol for this specialist (full train/eval, proxy, etc.)
and measure the primary metric. Record both primary and secondary metrics.

**Proxy vs full-eval rules (Section E also governs):**
- Record `evalType: "full" | "proxy"` in the iteration entry.
- Full evaluation must run at least every M iterations (M=5 interactive, M=10
  overnight) and always on the final iteration before Phase 3.
- A proxy below the metric floor triggers an automatic full re-evaluation on
  the same iteration before any revert decision is made (see Section G.2).

#### B.7 Auto-keep/revert decision (Section C)

Classify the result as GREEN / RED / YELLOW per Section C and execute the
corresponding action (keep, revert, or conditional-keep). A revert happens
here, before anything is committed: C.3 restores the working tree, so the
iteration's discarded edits never reach the checkpoint commit in B.9. Pointer
updates for kept iterations wait for B.9, because the checkpoint commit they
point at does not exist yet.

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

**Inline iteration summary (recommended).** After writing the iteration file and updating `results.json`,
print the per-iteration summary inline in the same assistant turn. Use this format:

```
[AR] Iteration N complete.
  Primary metric: <metric_name> <before> → <after> (delta: <+/->)
  Auto-decision: <GREEN | RED | YELLOW> — <one-sentence reason>
  Action: <Kept | Reverted | Kept with next-steps>
```

When a §E stop condition fires later in this iteration (at B.11) **or a §G
safety rail halts the loop**, additionally print on the same turn:

```
Convergence detected: <plateau | diminishing-returns | budget-exhausted | cost-ceiling | consecutive-failures | metric-floor-breach | user-interrupt | reviewer-pause | scope-violation | error-limit | timeout-limit>
```

The enum here matches §E.7's canonical list — §E stop conditions plus §G safety-rail halts.

These echoes carry the same content already written to `results.json` and the
per-iteration markdown — the inline copy makes the run legible in the
transcript.

#### B.9 Git checkpoint

With the runtime, `ar_iterate` already journaled the iteration on
`refs/shards/research/<project>/<run>`; skip this step (no tags, no per-iteration
commits on the user branch). The manual path follows.

Follow **Section B** of [`protocols/experiment_versioning.md`](experiment_versioning.md)
with these AR-specific conventions. That protocol's git policy applies in full:
commit only when `git.commit` is enabled, honour `git.denylist` and its size
limit, use `git commit --only`, never switch branches, never push. A fan-out
branch always uses the runtime path (its journal is the branch ref, H.5); a
`no-vcs` branch skips this step. `experiments/` in this protocol means
`<output_dir>/experiments/` (`<output_dir>/experiments/branches/<branch-slug>/`
for a fan-out branch's records).

- **Tag prefix:** `research/<project_name>/<N>-<name>` (not `exp/<...>`).
- **Annotated tag message** includes the auto-decision color:
  ```
  Iteration N (<green|red|yellow>): <name> | <metric>: <before> -> <after> (delta: <delta>)
  ```
- The color suffix lives only in the annotated tag message and in
  `results.json.experiments[N].autoDecision`, never in the tag name itself.
  This matches `[EX]`'s `exp/<project>/<N>-<name>` convention and keeps
  `git tag -l "research/<project>/*"` globs clean.

What the commit contains depends on the B.7 decision:

- **Kept iteration (GREEN or kept YELLOW):** the iteration's records under
  `experiments/` plus the mutable paths it changed. After the commit, capture
  its SHA (`git rev-parse HEAD`) and set `results.json.lastKeptCommit` to it;
  for a GREEN also set `results.json.lastGreenCommit` to it (C.2). Record the
  SHA in the iteration's `checkpoint`.
- **Reverted iteration (RED or reverted YELLOW):** the mutable paths were
  already restored in B.7, so the commit contains only the records under
  `experiments/`. The pointers do not move.

If the checkpoint commit fails on a kept iteration, there is no revert target
for the next iteration: halt the loop with `convergence.reason = "error-limit"`
and tell the user (instead of the "continue without versioning" rule in
`experiment_versioning.md` Section C).

If versioning mode is `none`, skip this step silently (per
`experiment_versioning.md` Section B). AR requires versioning (see "When NOT to
use"), so this only happens when the user explicitly accepted running without
revert.

#### B.10 Reviewer consultation if cadence hit

Apply Section D cadence rules. If a reviewer is consulted, record their verdict
per Section D.

#### B.11 Convergence check

Run Section E stop-condition checks. If any condition fires, break the loop and
proceed to Phase 3.

#### B.12 Cost notes + micro-gate (overnight only)

Optionally update `results.json.costAccounting` (`reviewerTasksSpawned`, and
token or dollar estimates if you have them). These are advisory: the agent
cannot observe its own usage, so the cost ceiling is not a stop condition
(Section G.5).

**Micro-gate (opt-in, overnight preset):** micro-gates are a user-interrupt
window requested every K iterations (default K=5) with
`gate_request(kind=confirm, evidence={status, checks})`. Under the default
`phase` policy a `confirm` gate with `evidence.status: "pass"` is recorded
automatically and does not block, so it is not an interrupt window. Under
`strict` it blocks until the user confirms. Under `plan` it is a notice.

**Default behavior:** do NOT request micro-gates during Phase 2 unless the user
has explicitly opted in at Phase 0 with the understanding that, under `strict`,
the loop will block at each one.

**If the user opts in,** call `gate_request(kind=confirm)` every K iterations
with a name that includes the iteration number (for example
`autonomous-research-micro-<project>-<N>`), evidence summarizing the iteration,
and the summary "Iteration N complete. Confirm to proceed, or give
steering notes." After the user answers, advance with `gate_advance`, or relay a verbatim
reply with `gate_confirm`. If the gate is pending, STOP and wait for the user.

**Alternative for unattended overnight runs:** rely on the user editing
`research_brief.md` Steering Notes mid-run as the interrupt mechanism
(re-read every iteration — see B.1). No gate, no block. The user can pause
the run anytime by writing "STOP" or similar directive into Steering Notes,
which the agent reads at the next iteration and halts on.

#### B.13 Continue or stop

If no stop condition fired and iteration budget remains, proceed to iteration
N+1. Otherwise exit to Phase 3.

#### B.14 Deferred decisions (unattended and overnight runs)

On an unattended run (plan approval, or the overnight preset with nobody
watching) a decision that needs a human must not stall the loop. Instead of a
blocking gate, call `ar_defer` and continue:

| Trigger | Call | Loop |
|---------|------|------|
| Reviewer `RETRO_REVERT` for iteration M (C.4) | `ar_defer(kind="retro_revert", retro_to_iteration=M, detail=<reason>)` | The runtime restores the kept state before M and moves `lastKeptCommit`, `lastGreenCommit` and the comparison reference there; continue with N+1 |
| Reviewer `PAUSE`, or a `PAUSE` in Steering Notes the user marked "defer" | `ar_defer(kind="pause", detail=<concern>)` | Continue; avoid the hypothesis family the concern names |
| Metric floor breach on a full eval (E.6) | `ar_defer(kind="floor_breach", detail=<value vs floor>)` | `ar_iterate` already reverted the iteration; continue |
| Anything else only a human can decide | `ar_defer(kind="other", detail=...)` | Continue |

Each call commits a `needs-human` entry (`AR-Needs-Human: <kind>`) on the
research ref and adds it to the run's deferred list. `ar_status` and `ar_end`
list the pending items. **The Phase 3 gate must present every deferred item for
the user to confirm or reject** (a rejected retro-revert means restoring the
reverted iterations from their commits on the research ref). A `STOP`/`HALT` in
Steering Notes still ends the loop.

On an attended run (the user is present, no plan approval), keep the blocking
behaviour: C.4's confirm gate, D.2's PAUSE halt and E.6's halt.

---

## Section C — Auto-Keep/Revert Protocol

### C.1 Classification

Classify each iteration result by comparing the primary metric to the
**comparison reference** (`results.json.comparisonReference`) — not to the
original baseline. The comparison reference is the "after" value from the most
recent GREEN iteration, or the value measured at the most recent re-baseline
(C.2, three-YELLOW guard), or the original baseline
(`results.json.baseline.value`) if neither has happened yet. This ensures each
iteration is measured against the current best state, not against the original
starting point (which would make every small improvement look GREEN and break
convergence detection). After classifying, record the comparison reference in
force after this iteration as the entry's `bestSoFar` (§E uses it).

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
2. Set `results.json.comparisonReference` to this iteration's "after" value; it
   is the reference for the next iteration's classification.
3. After the B.9 checkpoint commit exists, set both
   `results.json.lastKeptCommit` and `results.json.lastGreenCommit` to its SHA.
   Never set a pointer before the commit is made.
4. Reset `consecutiveRegressions` to 0.
5. Reset `consecutiveYellowKept` to 0.
6. Annotate the git tag message with `color=green`.
7. **Do NOT modify `results.json.baseline.value`** — that remains the original
   baseline. The comparison reference is tracked in `comparisonReference`.

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
3. After the B.9 checkpoint commit exists, set `results.json.lastKeptCommit`
   to its SHA. `lastGreenCommit` and `comparisonReference` do not change.
4. Annotate the git tag with `color=yellow`.
5. **Three-consecutive-YELLOW-kept limit (re-baseline):** if
   `consecutiveYellowKept` reaches 3, re-baseline before iteration N+1. Each
   kept YELLOW is within epsilon of the reference, but three of them can add
   up to a real drift. Run a **full** evaluation of the current kept state
   (`lastKeptCommit`), without changing anything, and compare it to
   `comparisonReference`:
   - Worse by more than `epsilon`: the YELLOW chain eroded the state. Revert
     per C.3 with `lastGreenCommit` as the target, commit the restored paths
     (C.3 step 5), and set `lastKeptCommit` to that commit.
   - Otherwise: keep the state and set `comparisonReference` to the measured
     value, so later iterations are judged against what the code scores now.
   Either way, reset `consecutiveYellowKept` to 0 and add a `re-baseline` line
   to the Research Log. A re-baseline is not an iteration: it does not take an
   iteration number or count against the budget.

If reverted:
1. Revert per C.3.
2. Record `autoDecision: "yellow"`, `reverted: true`.

### C.3 Revert mechanism

With the runtime, `ar_iterate` performs this revert itself (files restored
from `lastKeptCommit` without touching the user's index, loop-created files in
the mutable scope deleted, revert commit on the research ref). The manual
mechanism follows.

Reverts are **file-scoped**, never `git reset --hard`, never `git clean -f`.
They run at B.7, before the iteration's checkpoint commit, and restore the
**working tree**: uncommitted edits and new files are the iteration's changes.

1. The target state is `results.json.lastKeptCommit` (C.4 and the three-YELLOW
   guard name a different target explicitly).
2. Compute the revert set: every mutable path that differs from the target,
   including uncommitted edits, plus untracked files in the mutable scope:
   ```bash
   # tracked paths changed since the target (commits AND working tree)
   git diff --name-only <target> -- <mutable_path_1> <mutable_path_2> ...
   # untracked, not-ignored files in the mutable scope
   git ls-files --others --exclude-standard -- <mutable_path_1> <mutable_path_2> ...
   ```
   Drop any path listed in `results.json.preLoopDirty`.
3. For each path in the revert set:
   - If it exists in the target (`git cat-file -e <target>:<path>` succeeds),
     restore it:
     ```bash
     git checkout <target> -- <path>
     ```
   - Otherwise the loop created it after the target: delete that one file by
     its explicit path (`rm -- <path>`; if it is tracked, `git rm -q -- <path>`).
     Never use `git clean`.
4. Defensive scope check: run `git status --porcelain --untracked-files=all`.
   If a path is dirty that is outside the mutable scope, outside
   `<project_dir>/experiments/` and not in `results.json.preLoopDirty`,
   **halt the loop with a safety-rail stop** (Section G.1 — scope violation
   during the iteration). Do not auto-clean. Alert the user. Files the user had
   dirty before the loop never trigger this check.
5. If the restored paths now differ from `HEAD` (`git diff --name-only HEAD --
   <revert set>` is not empty) and versioning is enabled (`git.commit` true,
   same policy as B.9), commit them so the next iteration starts from a clean
   mutable scope. This happens for a retro-revert (C.4), a three-YELLOW
   re-baseline revert (C.2) and an error-limit revert (G.3); an ordinary RED at
   B.7 restores the last kept commit, which equals `HEAD` for the mutable
   scope, so it needs no revert commit:
   ```bash
   git commit --only <revert set> -m "research: revert to <target> (<reason>)"
   git tag -a "research/<project>/<N>-revert" -m "Reverted to <target>: <reason>"
   ```
   Then set `results.json.lastKeptCommit` to this commit's SHA.
6. Record `reverted: true` in the iteration's `results.json` entry.

### C.4 Retroactive revert (reviewer-initiated)

If a reviewer consultation at iteration N returns verdict `RETRO_REVERT` with a
target iteration M < N (e.g., reviewer identifies that iteration M's GREEN was
based on data leakage or a methodology flaw), execute:

1. Mark `results.json.experiments[M].retroInvalidated = true` and set
   `retroInvalidationReason` to the reviewer's explanation.
2. **Unattended or overnight run:** do not raise a gate. Call
   `ar_defer(kind="retro_revert", retro_to_iteration=M, detail=<reason>)`; it
   performs steps 3 and 4, records the decision for the Phase 3 gate (§B.14)
   and the loop continues (step 5). **Attended run:** prompt the user via a
   confirm gate, since retro-reverts are destructive:
   Call `gate_request(kind=confirm)` with `evidence.status: "fail"` (the
   reviewer flagged an anomaly, so it blocks under every policy) and the
   summary "Reviewer flagged iteration M's GREEN as invalid (<reason>). Rolling
   back to iteration M-1's state will discard iterations M..<current>.
   Confirm?". Then STOP and wait for the user.
3. On confirm: revert per C.3 with the target set to the state before
   iteration M — the `lastKeptCommit` value in force when iteration M started
   (the checkpoint of the last kept iteration before M, or the pre-loop
   commit). C.3 step 5 commits the restore and moves `lastKeptCommit`.
4. Set `results.json.lastGreenCommit` to the checkpoint of the last GREEN
   before M (or the pre-loop commit), and `comparisonReference` to that GREEN's
   "after" value (or `baseline.value`).
5. Resume the loop from the reverted baseline. **Iteration counter keeps
   incrementing** — no re-use of numbers. The next iteration is N+1, not M+1.

### C.5 Per-iteration validation (Fixer-level)

Each **kept** iteration (GREEN or kept-YELLOW) must produce a lightweight validation block following `protocols/validation.md`. Reverted iterations (RED or reverted-YELLOW) do not — the change is gone, validation is moot.

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

The runtime does **not** enforce this per-iteration block. Discipline is on the AR loop itself; the Phase 3 consolidation is where structural enforcement resumes. Per-iteration evidence is recorded here, not gated: there is no per-iteration `gate_request` (A.6). An opted-in micro-gate (B.12) carries the latest block's summary as its `evidence` (`status` plus `checks`).

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
APPROVED/NEEDS REVISION/BLOCKED structure from `protocols/reviewer_verdict.md`):

- **`CONTINUE`** — proceed as planned. Reviewer may include optional
  suggestions for the next hypothesis.
- **`REDIRECT`** — proceed, but pivot approach. Reviewer supplies a new
  hypothesis direction. Record `hypothesisSource: "reviewer-suggested"` on the
  next iteration.
- **`PAUSE`** — stop the loop and escalate to the user. Reviewer supplies the
  concern. The loop halts immediately and Phase 3 begins. On an unattended run,
  defer it with `ar_defer(kind="pause")` and continue instead (§B.14).
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

Dual-reviewer cost is **2× per cadence hit** and must be reflected in the
wall-clock budget. If budget pressure is high, consider raising K rather than
dropping one reviewer — both perspectives matter.

### D.4 Consultation call format

Call the reviewer:

Run this consult (shown for `researcher`; for another specialist use the same call with its id and an entry its `agent.yaml` declares):

Before this consult, collect data-modeller context (grain, entities, relationships) for the data under review: {{consult data-modeller entry=review task="Grain and relationships for the researcher review"}} Pass that context in the task of the researcher consult below.


{{consult researcher entry=service task="AR iteration N review"}}

Brief for each consultant or worker (fill the angle-bracket fields):

```
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
```

Apply the standard reviewer verdict protocol afterward (`protocols/reviewer_verdict.md`).

---

## Section E — Convergence Detection

Convergence checks **do not fire until after an activation floor** of
`max(10, budget * 0.2)` iterations. Early in a hard problem it is normal to see
5+ consecutive REDs before the first GREEN — firing PLATEAU at iteration 5 is
a false positive. The floor prevents premature convergence.

**Exception:** METRIC FLOOR BREACH (E.6) is always live — emergency stops do
not wait.

Stop when ANY of the following is true. Check them in order; the first that
fires names the stop reason.

With the runtime, `ar_iterate` evaluates E.1, E.2, E.3, the wall-clock budget
(`time-budget`), G.3/G.4 (`error-limit`, `timeout-limit`) and the immutable
tamper check (`tamper`), and returns `converged` and `stop_reason`. E.4 to E.6
and user or reviewer stops remain the agent's call, ended with `ar_end`.

E.1 and E.2 are measured over **all** iterations, GREEN or not, using each
entry's `bestSoFar` (the comparison reference in force after that iteration,
C.1). An iteration that is not GREEN leaves `bestSoFar` unchanged, so it adds
zero progress. Measuring only GREENs would never fire: every GREEN beats the
reference by more than `epsilon`.

### E.1 PLATEAU

No GREEN result in the last W consecutive iterations (default W=5): `bestSoFar`
has not moved over the window. The activation floor already protects against
early false positives on hard problems.

### E.2 DIMINISHING RETURNS

Progress of `bestSoFar` over the last 2W iterations (default 10) is below the
threshold:

```
gain    = improvement from bestSoFar[N - 2W] to bestSoFar[N]   (bestSoFar[0] = baseline)
gainPct = gain / |baseline.value| × 100
fire when gainPct < diminishingReturnsThreshold
```

`diminishingReturnsThreshold` is the minimum total improvement over the 2W
window, in % of baseline. Default: 2 × epsilon (2% of baseline when epsilon is
1%). With that default, a single barely-GREEN iteration in 10 is diminishing
returns, while two or more solid GREENs keep the loop going. Record
`avgImprovementRate = gainPct / 2W` (% of baseline per iteration) in the
convergence record.

### E.3 BUDGET EXHAUSTED

Iteration count reaches the configured budget.

### E.4 COST CEILING (advisory)

Not a runtime stop: token and dollar counts are estimates (Section G.5). Stop
with `ar_end("cost-ceiling")` only if the user asked for it and the host gives
you real usage numbers.

### E.5 CONSECUTIVE FAILURES

`consecutiveRegressions` reaches K (default K=3). Before stopping, consult the
reviewer per Section D.1 item 4 — the reviewer may return `REDIRECT` and save
the run. The consult is a subagent call, not a gate, so it does not block an
unattended run; a `PAUSE` or `RETRO_REVERT` from it is deferred per §B.14.

### E.6 METRIC FLOOR BREACH

Primary metric falls below the configured floor (if set) on a **full
evaluation**. Always live — ignores the activation floor. Immediately:
1. Revert per C.3 (with the runtime, `ar_iterate` has already reverted it).
2. Attended run: halt the loop. Unattended run: call
   `ar_defer(kind="floor_breach")` and continue (§B.14).
3. On a halt, record the breach in `results.json.convergence.reason` as
   `metric-floor-breach`.

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
  "reason": "plateau | diminishing-returns | budget-exhausted | time-budget | cost-ceiling | consecutive-failures | metric-floor-breach | user-interrupt | reviewer-pause | scope-violation | tamper | error-limit | timeout-limit",
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
- Runtime-only: `time-budget` (the `budget.minutes` wall clock elapsed) and
  `tamper` (an immutable path or the eval command changed since `ar_start`).
- Section G safety-rail halts: `scope-violation` (G.1), `error-limit` (G.3 —
  three consecutive crashes), `timeout-limit` (G.4 — three consecutive
  timeouts which itself triggers G.3's error-limit path — record
  `timeout-limit` as the more specific reason).

---

## Section F — results.json Schema Extensions

With the runtime, `results.json` is a derived view: the source of truth is the
research ref (`git log --format=%(trailers) refs/shards/research/<project>/<run>`)
and `ar_status`. Copy the values `ar_iterate` / `ar_status` return; never
compute metrics or pointers yourself.

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
    "wallClockMinutes": <N or null>,
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
  "lastKeptCommit": "<sha or null>",
  "lastGreenCommit": "<sha or null>",
  "comparisonReference": <number>,
  "preLoopDirty": ["<path>", "..."],
  "costAccounting": {
    "tokensIn": <N>,
    "tokensOut": <N>,
    "dollarsSpent": <number>,
    "reviewerTasksSpawned": <N>
  }
}
```

`costCeiling` and `costAccounting` are advisory estimates (§G.5); the runtime
enforces `iterationBudget`, `wallClockMinutes` and the per-eval timeout.

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
  "nextSteps": "<string, populated for kept YELLOWs>",
  "bestSoFar": <number>
}
```

### F.3 Optional branch context (fan-out only)

Populated only in branches spawned by the Section H fan-out protocol:

```json
"branchContext": {
  "branchSlug": "<slug>",
  "approachConstraint": "<one-line description>",
  "parentProjectDir": "<path>",
  "gitStrategy": "worktree" | "no-vcs",
  "runId": "<run-id>",
  "ref": "refs/shards/research/<project>/<run-id>/<slug>"
}
```

### F.4 Backward compatibility

- An `[EX]` `results.json` has `mode: "experiment"` (or no `mode` field in
  older runs; treat absence as `"experiment"`).
- An AR `results.json` has `mode: "autonomous-research"`.

---

## Section G — Safety Rails

### G.1 Scope enforcement

Every file-modifying tool call in Phase 2 (`Edit`, `Write`, notebook edits)
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
/ notebook edits which are checkable ahead of time.

### G.2 Metric floor breach

Covered in E.6. Full-eval-only trigger; proxy breaches force a full re-eval.

### G.3 Error limit

3 consecutive iteration crashes (uncaught exception during implementation or
evaluation) → stop. The codebase may be broken. Record
`convergence.reason = "error-limit"`. Revert per C.3 to `lastKeptCommit`.

### G.4 Time budget

Per-iteration timeout. If exceeded: abandon the iteration, revert per C.3,
and record `"timeout"` in the iteration file. A timed-out iteration counts
against the iteration budget: it keeps its iteration number, the counter
advances as for any other iteration, and the hypothesis is not retried under
the same number. If 3 consecutive timeouts occur, trigger G.3 (error limit).

### G.5 Budgets the runtime enforces (cost ceiling is advisory)

The enforced budgets are the iteration budget, the wall-clock `budget.minutes`
(`time-budget`) and the per-eval `timeout_s`; `ar_iterate` checks all three.
The agent cannot observe its own token or dollar usage, so a cost ceiling in
the brief is an advisory planning number: print a soft warning if your estimate
passes 50% or 80% of it, but never treat it as a hard stop. Size the
wall-clock budget to the money you are willing to spend instead.

### G.6 No destructive operations

**Never:**
- Delete data files (training data, eval sets, raw inputs).
- Drop database tables or views.
- Remove checkpoints, model artifacts, or logs.
- Run `git reset --hard`, `git clean -f`, or `git push --force`.
- Remove git tags or refs.

File-level `git checkout <sha> -- <path>` is the only allowed reverting operation.
It restores file contents only. It never switches branches. The one deletion C.3
allows is a file inside the mutable scope that the loop itself created after the
revert target (not in `preLoopDirty`), removed by its explicit path.

### G.7 Git safety

- File-scoped checkout only.
- Never hard reset.
- Never force push.
- Never `git clean -f` or `git clean -fd`.
- Tag creation is append-only — never delete or force-overwrite tags.
- Never switch or create branches (`git checkout -b`, `git switch`). Commits
  happen only under the `git.commit` and `git.denylist` policy in B.9.

### G.8 Interrupt handling

With the runtime, call `ar_status` (with `resume=true` in a new session): the
research ref is the journal, so nothing needs reconciling by hand. The manual
procedure follows.

If the agent detects it was interrupted mid-iteration (on resume, finds a
commit without a matching `results.json` entry, or vice versa):
1. Record the partial state as a dropped iteration in the research log.
2. Resume from the last clean `lastKeptCommit` (revert per C.3 if the mutable
   scope differs from it).
3. Do not auto-clean any orphan files. Present the situation to the user
   before continuing.

### G.9 Running overnight

An unattended run needs something to keep the host working after each turn
and a way to survive context loss. Run the host headless in a shell loop that
starts a fresh turn until `shards research status --json` reports `done`
(converged or ended); each turn begins with `ar_status(resume=true)`, which
rebuilds the run from the research ref and reopens the lease. A host-side
scheduled wakeup or loop command is the fallback heartbeat. The Shards runtime
docs (`research.md`, "Running overnight") give the exact commands.

---

## Section H — Fan-Out: AR Branch Leads and Workers

This section defines how AR explores several approach families in parallel.
Solo AR remains the default and is the depth primitive. Fan-out is the breadth
primitive. Fan-out runs on the same lead → worker model as Syn's PM mode:

```
Initiator (Syn, or the specialist that ran AR Phase 0-1) ── user gates only here
 └─ AR branch LEAD, one per approach family (depth 1, lead contract: no gates,
    no user, consults allowed)
     └─ <specialist>-worker, one per iteration task card (depth 2, worker contract)
          card.owned_paths     = the branch's mutable scope inside its worktree
          card.acceptance      = the pinned eval command, run from the worktree
```

Each branch runs in its own git worktree with its own research ref, so every
branch has real git history and edits the real mutable paths, and the runtime
(not a subagent) measures every iteration.

### H.1 When to propose fan-out

Fan-out can be initiated by either:

- **The specialist** at its `[AR]` Phase 1 gate, when writing the research
  brief surfaces 2-3 viable approach families that satisfy DIVERGE
  preconditions (see `protocols/diverge.md` Section A).
- **Syn** during triage or brainstorm, when the user's request is broad
  ("improve metric X, try everything") and Syn identifies distinct approach
  families warranting parallel exploration, possibly across different
  specialist types.

Fan-out preconditions (inherited from DIVERGE):
- 2-3 mutually exclusive approaches that are genuinely viable (at most 4
  branches; the runtime refuses a fifth).
- No single approach is clearly superior.
- The approaches are fundamentally different (not hyperparameter variations —
  that is what the AR loop itself already does).

Fan-out needs the AR runtime tools and a git repository. Without them, use the
`no-vcs` fallback (H.5).

### H.2 DIVERGE proposal at AR Phase 1

If fan-out is warranted, propose DIVERGE before the research brief gate.
Follow `protocols/diverge.md` Section B (proposal format + gate), with these
AR-specific adjustments:

- **Gate ID namespace:** use
  `diverge-ar-<project>` for the AR
  proposal gate. This avoids collision with planning-phase DIVERGE gate IDs.
- **Branch slugs:** reflect approach families, not specialists. Example slugs
  for an ML Engineer fan-out: `ml-xgboost`, `ml-neural-net`, `ml-linear-baseline`.
  A slug is also the `branch` name of its AR run (letters, digits, `.`, `_`,
  `-`).
- **Proposal context:** include the AR budget, primary metric, and per-branch
  budget split (each branch gets the full budget; the total AR budget is
  effectively multiplied by K branches — confirm with the user that cost
  implications are accepted).

The user confirms one of:
- (a) Solo AR with the current brief (no fan-out).
- (b) Fan-out with the proposed K approach families.

The Phase 1 gate (with `plan_approval: "<run-id>"` for an unattended run) is
the plan approval for every branch: all branches share that run id. It must be
confirmed before any lead starts (a pending gate blocks subagents).

### H.3 Branch leads

After the Phase 1 gate is confirmed, the initiator launches one lead per
approach family, in parallel (one message), each a subagent of the specialist
that owns the family:

{{lead ml-engineer task="AR branch lead for approach family <branch-slug> of AR run <run-id>"}}

(Shown for `ml-engineer`; use the specialist that owns each family. Different
families may use different specialists.)

Brief for each lead (fill the angle-bracket fields):

```
You are an AR BRANCH LEAD. Follow protocols/lead_contract.md and
protocols/autonomous_research.md Section H.3 (lead loop). You write no code:
every iteration is a task card for a <specialist> worker.

**Run id:** <run-id>          **Branch:** <branch-slug>
**Approach constraint:** <one paragraph: the family this branch must stay in,
e.g. "tree-based methods only; no neural networks; no linear models">
**Scope (task_* calls):** <project_dir>/experiments/branches/<branch-slug>
**Iteration budget:** <N>   **Minutes:** <M or none>   **Reviewer cadence:** <K>
**ar_start arguments:** project, brief_path, mutable, immutable, eval
(command, metric_regex|json_path, direction, timeout_s, repeats), budget,
epsilon — copied verbatim from the research brief; add run_id=<run-id>,
branch=<branch-slug>.
**Steering:** global <project_dir>/experiments/research_brief.md; this branch
<project_dir>/experiments/branches/<branch-slug>/research_brief.md (optional)

## Project Context (from completed planning phases)
<completed project-specs.md phases, without the DIVERGE section or
brainstorm transcripts>

Return the lead report (H.7). Never call gate_request; never talk to the user.
```

**Lead loop.** The lead runs Section B through the runtime path, with the
iteration's implementation delegated:

1. `ar_start({... , run_id, branch})`. The runtime creates the worktree
   `.shards/worktrees/<run-id>/<branch-slug>` (detached at the pre-loop HEAD;
   no new branch, the user's checkout is never switched), runs the baseline
   there and opens (or joins) the run's AR lease, scoped to this worktree.
   It returns `worktree`, `work_root` (the worktree's equivalent of the
   project root, usually the worktree itself) and `ref`
   (`refs/shards/research/<project>/<run-id>/<branch-slug>`).
2. Per iteration N: do B.1 to B.4 (steering, windowed history, one
   hypothesis inside the approach constraint, announce in the branch log).
3. Register the iteration card: `tasks_set` with `scope` (the first card),
   then `tasks_set` with `append: true` for each later card. The card:
   - `id: iter-<N>`, `goal`: the hypothesis, `plan_ref`: the brief section
   - `owned_paths`: the mutable scope inside the worktree
     (`<work_root>/<mutable path>`, e.g.
     `.shards/worktrees/<run-id>/<branch-slug>/src/model`)
   - `acceptance: {command: <pinned eval command>, expected: "eval prints the
     metric", cwd: <work_root>}`
   - `ar: {run_id, branch, iteration: N, hypothesis}`
   - `depends_on: [iter-<N-1>]` (iterations of a branch are sequential: the
     eval measures the whole worktree)
   - `worker: <specialist>`

   When the eval is expensive, the brief may name a cheaper smoke command
   (one fold, a data sample) for `acceptance.command`; `ar_iterate` always
   runs the full pinned eval, so the record never depends on the smoke run.
4. `task_dispatch` the card and hand it to one `<specialist>` worker
   (`max_parallel` is 1 inside a branch). The worker implements the
   hypothesis inside `owned_paths`, runs the acceptance command from `cwd`
   and returns its task-result (optionally with `metric`). `task_report` it.
5. `ar_iterate({hypothesis, source, run_id, branch})`. This is the lead's
   independent check: the runtime re-runs the pinned eval in the worktree,
   classifies, keeps or reverts and journals to the branch ref. The worker's
   own metric is never the record.
6. `task_verify({id, pass, expected, observed, ar_iteration: N, scope})`.
   GREEN or kept YELLOW makes the card `done` (`kept`); RED or unkept YELLOW
   makes it `done` (`reverted`). A reverted iteration is a normal outcome:
   it is never `failed` and never uses a retry (AR's stop conditions bound the
   loop). A worker that reports `failed` (it could not implement the
   hypothesis) is retried with feedback as usual; if the card ends `blocked`,
   call `ar_iterate` anyway (the metric decides what the worktree keeps) and
   move on to a new hypothesis.
7. B.8 records go under the branch dir
   `<project_dir>/experiments/branches/<branch-slug>/`. B.10 reviewer
   consults run from the lead (the lead contract allows consults; if the host
   forbids a consult from a subagent, name the skipped consult in the
   report). Reviewer `RETRO_REVERT`, `PAUSE` and floor breaches go to
   `ar_defer({..., run_id, branch})`; nothing blocks.
8. When `converged` is true or the budget is spent: `ar_end({reason, run_id,
   branch})`. The runtime records the stop on the branch ref and removes the
   worktree; the kept state stays on the ref as `lastKeptCommit`.

**Leads write no code.** Implementation is always a worker's card, so every
change to the mutable scope is lease-scoped, reported and independently
measured. A PM-mode workstream lead that runs `[AR]` follows the same rule:
its iterations are task cards and `ar_iterate` is its verification. A PM lead
cannot launch branch leads (depth cap); it runs one AR loop, as a branch run
(`branch: <workstream>`) so its worktree stays out of other workstreams' way.

**Depth and concurrency.** Initiator → lead (depth 1) → worker (depth 2),
never deeper. A lead never launches another lead; a worker never delegates.
Concurrency is bounded by `max_parallel` per lead (1: one iteration in flight
per branch) and the global cap on branch leads (at most 4 concurrent branch
runs per run id, enforced by `ar_start`).

### H.4 Per-branch layout

```
.shards/worktrees/<run-id>/<branch-slug>/        # git worktree (runtime-owned, removed by ar_end)
<project_dir>/experiments/branches/<branch-slug>/
  iter_<N>.log                # written by the runtime (ar_start/ar_iterate)
  research_brief.md           # optional branch-level steering
  results.json                # derived view of the branch ref, branchContext set
  experiment_<N>_<name>.md    # B.8 iteration records
  tasks.yaml, TASKS.md        # the lead's iteration cards (scope)
  project-specs.md            # the lead's decisions and Validation evidence
refs/shards/research/<project>/<run-id>/<branch-slug>   # the branch journal
```

The main project dir keeps the global `experiments/research_brief.md` (applies
to all branches unless overridden) and the canonical `project-specs.md` with
the DIVERGE section written per `protocols/diverge.md` Section D.

`.shards/worktrees/` is git-ignored (the runtime adds it to the repo-local
`.git/info/exclude` when no ignore rule covers it) and lies outside every
tracked output dir.

### H.5 Branch isolation

Shards never switches the user's branch (ADR 0005), so parallel branches
cannot share one working tree. Each branch gets a **git worktree** (the
default and the only strategy with the runtime):

- `ar_start({branch})` creates `.shards/worktrees/<run-id>/<branch-slug>`
  with `git worktree add --detach` at the pre-loop HEAD. No branch is created
  and nothing moves `HEAD` of the main checkout.
- The eval runs with the worktree as its working directory. Immutable paths
  that the worktree lacks (untracked or ignored data) are symlinked to the
  main tree's copy and pinned there; a change to them is a tamper. List every
  untracked input the eval reads as immutable. The runtime refuses to start
  when the mutable or immutable scope has uncommitted changes in the main
  tree (the worktree starts from HEAD and would not see them).
- The AR lease holds each branch's mutable and immutable entries prefixed
  with its worktree path. A write inside `.shards/worktrees/` must match one
  branch's mutable scope; the `.shards/` state allowance does not cover
  worktrees. The main tree's mutable paths are not writable while branch
  runs are active. `git worktree add/remove/move/prune` is runtime-only.
- Each branch commits only to its research ref
  `refs/shards/research/<project>/<run-id>/<branch-slug>` (via plumbing; the
  worktree's index and HEAD stay at the pre-loop commit).
- `ar_end` removes the worktree (`keep_worktree: true` keeps it for
  inspection; a kept one is removed by hand with `git worktree remove`).
- `ar_status({run_id, branch, resume: true})` recreates a lost worktree at
  the branch's kept state.

**`no-vcs` (fallback only):** for a project without git, where the AR tools
cannot run. Each branch lead uses `<project_dir>/.shards/branches/<branch-slug>/`
as its working copy, follows the manual path of Sections B, C and E, reverts
by restoring its own saved copy of the last kept files, and records
`gitStrategy: "no-vcs"` in `results.json.branchContext`. Promotion copies the
winner's files (H.11).

Solo AR uses the main working tree directly.

### H.6 Steering in fan-out

Every iteration, each lead re-reads:
1. The **global** `research_brief.md` (applies to all branches).
2. Its **branch-level** notes at
   `<project_dir>/experiments/branches/<branch-slug>/research_brief.md` if
   present.

The user can edit either during the run: the global brief steers all branches,
a branch-level brief redirects one branch. A `STOP` in the global brief stops
every lead.

### H.7 Branch convergence and the lead report

Each branch runs Section E convergence inside its own run (the runtime
evaluates the stop conditions per branch). A branch terminates when it
converges, exhausts its budget, or breaches a safety rail. **Branches do not
wait for each other.** The initiator waits for every lead to return.

Each lead returns the lead-contract report plus:
- `branch`, `ref`, `lastKeptCommit`, `baseline`, `bestSoFar`, `iterations`,
  `stop_reason` (from `ar_end`)
- pending deferred decisions (`ar_defer`)
- skipped consults, fallbacks, and one paragraph of observations

The report is a pointer; the numbers come from the ref.

### H.8 Branch gate policy

Leads and workers are subagents: they never call `gate_request` (lead
contract, worker contract). All human-facing gates stay with the initiator:

- Phase 0 and Phase 1 (brief, DIVERGE choice, plan approval): initiator.
- Phase 2: gate-free branch loops (leads and workers).
- Phase 3 (arbitration, winner selection, adoption): initiator; the adoption
  gate is `requires_human`.

### H.9 Arbitration

Arbitration compares branch refs, not prose. After all leads return, the
initiator calls `ar_status({run_id})`: for a branched run it returns every
branch (rebuilt from its ref when needed) with a leaderboard ranked by
`bestSoFar`, plus each branch's decisions, stop reason and deferred items. The
journal of each branch is
`git log --format='%h %s%n%(trailers:only)' <pre-loop HEAD>..refs/shards/research/<project>/<run-id>/<branch-slug>`.

The initiator then invokes Syn Arbiter Mode (`protocols/diverge.md` Section F)
with the run id and the branch refs. The arbiter reads `ar_status` and the
`AR-*` trailers, weighs gain against noise (`epsilon_abs`), simplicity (kept
LOC) and robustness, and writes
`<project_dir>/experiments/branches/leaderboard.md`. The initiator presents the
leaderboard to the user, who selects the winner at the human gate.

### H.10 Write-backs in fan-out

**Losing branches do NOT propose write-backs independently.** That would
flood the knowledge source with duplicate or conflicting candidates across
branches exploring similar territory.

- Only the **winning branch** contributes write-back candidates.
- The parent specialist proposes write-back candidates (per {{protocol sources}}) as part of its consolidated Phase 3
  **after promotion**.
- Write-back candidates come from:
  1. The winning branch's artifacts (brief, iteration files, results.json).
  2. Cross-branch patterns that Syn Arbiter flagged in the leaderboard (e.g.,
     "three of four branches hit the same data leakage issue" — a pattern
     worth proposing even though no individual branch would have flagged it).

### H.11 Promotion

Promotion happens only at the human Phase 3 gate, after every branch's
`ar_end` (the AR lease is closed by then):

1. The user selects the winner (diverge Section F gate).
2. Apply the winner's kept diff to the user's working tree, using the
   `promote` command that `ar_end` returned for that branch:
   `git diff --binary <pre-loop HEAD> <lastKeptCommit> -- <mutable paths> | git apply`.
   This carries additions, edits and deletions in the mutable scope only. If
   the main tree changed since the run started and the patch does not apply,
   stop and show the user the conflict; never force it.
3. Copy the winner's branch records (`results.json`, iteration records) into
   `<project_dir>/experiments/` as the run's record.
4. The Phase 3 adoption gate (`requires_human`, with the mutable paths as
   `targets`) commits the promoted change under `git.commit` and
   `git.denylist`. No ref is merged into the user's branch and no branch is
   switched.

Losing branches keep their refs (and their records under
`experiments/branches/`) for reference. `no-vcs` branches promote by copying
the winner's files from its branch directory.

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
- **Reason:** <plateau | diminishing-returns | budget-exhausted | cost-ceiling | consecutive-failures | metric-floor-breach | user-interrupt | reviewer-pause | scope-violation | error-limit | timeout-limit>
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

## Cost Accounting (advisory estimates)
- **Wall-clock used:** <minutes of budget>
- **Tokens in:** <N>
- **Tokens out:** <N>
- **Dollars spent:** <value>
- **Reviewer consults spawned:** <N>
- **Cost ceiling:** <value or "none set">

## Deferred Decisions
<one line per `ar_defer` item: id, kind, iteration, detail; "none" if empty>

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

Also write a consolidated `## Validation` section to `project-specs.md` per `protocols/validation.md`. The Phase 3 gate is validation-eligible (the AR run produces a durable set of kept iterations / final artifact), and `gate_request` checks the schema at Phase 3.

Consolidation rules:
- **Track:** `deep` (Phase 3 is the deep gate; per-iteration blocks were already Fixer-level)
- **Mode:** `research`
- **Evidence:** pull the headline metric per kept iteration from `results.json.experiments[*].validation` and aggregate. Expected format: one row per check ID from the agent's Fixer subset, with Observed = "N iterations × check, M passes, K n/a" or the final-iteration value for diff-style checks.
- **Artifacts:** `experiments/results.json`, `experiments/research_summary.md`, the final-iteration checkpoint commit SHA, any per-iteration artifacts referenced in `validation.artifacts`
- **Downstream Impact:** consumers of the final artifact (services, marts, reports) — same analysis the agent would do in a normal deep-track phase
- **Summary:** two to four sentences on what was validated across the kept iterations, what residual risk exists, and what would need a fuller validation pass if this is productionized

This section is machine-readable by `gate_request` when Phase 3 requests its gate with `validates=<agent>`. Per-agent `research.md` files are responsible for setting that attribute on their Phase 3 gate.

### I.5 Write-back candidates

Propose write-back candidates per {{protocol sources}}, section 4. Nothing is
written until the user confirms. In fan-out contexts, only the initiating
parent proposes them after promotion (see Section H.10).

### I.6 Present to user (GATE)

Read both the summary and recommendations back to the user. If `ar_end` or
`ar_status` lists deferred decisions (§B.14), present each one (kind, detail,
iteration, and for a retro-revert which iterations were rolled back) and ask
the user to confirm or reject it as part of this gate.

**The Phase 3 gate is owned by the per-agent `research.md` file**, not by this
shared protocol. Each agent requests its own Phase 3 gate with its
agent-specific ID (e.g., `ml-engineer-research-phase-3`
for ML Engineer, `ai-engineer-research-phase-3` for AI
Engineer, etc.). Do **not** request a shared-protocol Phase 3 gate here — doing
so would duplicate the gate or orphan the ID namespace.

The typical gate body is:

> Ask the user:
> - What do you want to adopt from this AR run?
> - Do you want to run another budget (fresh AR session)?
> - Or should we stop here?

Wait for the user's decision before taking any further action. Per-agent
`research.md` files define the exact gate line (see each agent's Phase 3
section).
