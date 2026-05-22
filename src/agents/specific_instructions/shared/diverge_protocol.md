---
name: diverge-protocol
description: >
  Time-Travel branching protocol for parallel experimentation. Defines the full
  fork-execute-converge lifecycle: when to propose DIVERGE, how to spawn parallel
  branch Tasks, how branches produce reports, how Syn arbitrates, and how the
  winning branch is promoted back to the main project directory.
type: reference
---

# DIVERGE Protocol — Time-Travel Branching

This protocol governs parallel experimentation in Shards. It is referenced by
DIVERGE-capable specialists during planning phases when multiple viable approaches
are identified.

---

## A. When to Propose DIVERGE

DIVERGE is appropriate when ALL of the following are true:

1. You are in an **allowed phase**:
   - (a) A **planning phase** (methodology, architecture, or model design), or
   - (b) The **start of an `[AR]` (Autonomous Research) session** — specifically before the Phase 1 research-brief gate, per `autonomous_research.md` Section H. DIVERGE inside an already-executing AR loop is forbidden; only at AR session start.
2. You have identified **2-3 mutually exclusive approaches** that are genuinely viable.
3. **No single approach is clearly superior.** If one approach dominates on every dimension (accuracy, complexity, interpretability, cost), just pick it. DIVERGE is for genuine uncertainty.
4. The approaches are **fundamentally different** — different model families, different analytical methodologies, different architectural paradigms. Not minor hyperparameter variations (that is Experiment Mode or the inner AR loop).

**Do NOT propose DIVERGE when:**
- One approach is clearly better — just pick it
- The difference is a tuning choice (learning rate, regularization) — use Experiment Mode or let AR's own loop explore it
- The user has already expressed a strong preference for one approach
- The project is in an execution phase **other than** the allowed AR-session start — DIVERGE is never mid-loop

**Gate ID namespace for AR-initiated DIVERGE:**
Use the ID prefix `specific-instructions-shared-diverge-protocol-ar-<project>`
to avoid collision with planning-phase DIVERGE gates (which use
`specific-instructions-shared-diverge-protocol-phase0`). See Section B.

---

## B. DIVERGE Proposal Gate

Present the fork to the user. Do not spawn any branches until the user explicitly confirms.

**Proposal format:**

```
**DIVERGE PROPOSED — Time-Travel Fork**

I've identified [N] viable but mutually exclusive approaches for this project.
Rather than committing to one and hoping it works, I can run them in parallel
as isolated branches, then compare results side by side.

| Branch | Approach | Rationale | Risk |
|--------|----------|-----------|------|
| `<branch-slug-1>` | <approach summary> | <why this is viable> | <Low/Med/High> |
| `<branch-slug-2>` | <approach summary> | <why this is viable> | <Low/Med/High> |

**What this means:** Each branch runs autonomously in its own directory,
produces artifacts and a branch report, then Syn compares them as an arbiter
so you can pick the winner.

**Proceed with DIVERGE, or pick one approach and go straight?**
```

**Branch slug rules:** lowercase, hyphenated, descriptive. Examples: `xgboost-raw-features`, `linear-pca-transformed`, `transformer-architecture`, `rule-based-baseline`.

**Gate to emit:**

- **Planning-phase DIVERGE:** emit with ID
  `specific-instructions-shared-diverge-protocol-phase0`.
- **AR-session-start DIVERGE:** emit with ID
  `specific-instructions-shared-diverge-protocol-ar-<project>` (substitute
  the project slug). This is required to avoid collision with planning-phase
  IDs when both DIVERGE forms occur in the same project's state file.

Example (planning-phase form):

::GATE:: id=specific-instructions-shared-diverge-protocol-phase0 phase=0 kind=phase

::ENDGATE::

The user must explicitly confirm DIVERGE. If they pick a single approach, proceed with the standard phased workflow — no fork. If they confirm DIVERGE, continue to Section C.

---

## C. Branch Directory Setup

For each confirmed branch, create the directory:

```
<project_dir>/.shards/branches/<branch-slug>/
```

Branches do NOT get their own `project-specs.md`. They produce a `branch-report.md` instead. The main `project-specs.md` remains the single source of truth for the project.

---

## D. Document DIVERGE to project-specs.md

Before spawning any branch Tasks, append the following to the main `project-specs.md`:

```markdown
---

## DIVERGE: Time-Travel Fork

- **Specialist:** <agent name>
- **Fork point:** After Phase <N>
- **Trigger:** <why you proposed forking — what made the approaches equally viable>
- **Branches:**
  - `<branch-slug-1>`: <approach summary>
  - `<branch-slug-2>`: <approach summary>
- **Branch directories:**
  - `<project_dir>/.shards/branches/<branch-slug-1>/`
  - `<project_dir>/.shards/branches/<branch-slug-2>/`
- **Status:** Spawning
```

---

## E. Branch Task Calls

Spawn one Task per branch. **All branch Tasks must be called in parallel** — do not run them sequentially.

**Specialist type across branches:**
- A fork initiated by a specialist typically spawns branches of the same specialist type (a data-scientist fork spawns data-scientist branches).
- **AR fan-out explicitly allows multiple branches of the same specialist type**, each constrained to a different approach family. Example slugs for an ML Engineer AR fan-out: `ml-xgboost`, `ml-neural-net`, `ml-linear-baseline`. The `subagent_type` repeats across the parallel Task calls — that is expected and correct.
- A Syn-initiated fork may mix specialist types across branches (e.g., one `ml-engineer` branch + one `ai-engineer` branch, each with its own approach). Arbitration (Section F) handles mixed-type comparison by reading `branch-report.md` files regardless of which specialist produced them.

**Branch slug conventions:**
- Lowercase, hyphenated, descriptive.
- AR fan-out slugs should reflect the approach family, not the specialist type (since multiple branches share the specialist). Examples: `xgboost-raw-features`, `transformer-architecture`, `rule-based-baseline`, `ml-linear-baseline`, `ml-neural-net`.

```python
Task(
  subagent_type="<your specialist type>",
  description="Time-Travel branch: <branch-slug>",
  prompt="""
You are in BRANCH MODE — an isolated Time-Travel branch execution.

**Branch name:** <branch-slug>
**Branch directory:** <project_dir>/.shards/branches/<branch-slug>/
**Approach to execute:** <detailed description of the specific approach this branch must implement>

## Project Context (from completed planning phases)

<Insert the full text of all completed phase sections from project-specs.md here,
verbatim — every phase from Phase 0 through Phase N (the fork point). Include
documented decisions, reviewer verdicts, and data discovery findings. Do NOT
include the DIVERGE section itself or any brainstorm transcripts.>

## Your Task

Execute the approach described above through a condensed autonomous workflow.
You are autonomous within this branch — no user gates, no phase-by-phase
confirmation. Work efficiently and produce results.

1. **Implement** — write all code, queries, configs, and notebooks to the branch
   directory. Do NOT write to the main project directory or any other branch's
   directory.
2. **Evaluate** — run training, evaluation, or analysis and collect metrics.
   Use the best proxy available for the primary success metric.
3. **Write branch-report.md** — produce `<branch_dir>/branch-report.md` using
   the template below. This is the artifact Syn will read during arbitration.

## Branch Report Template

```markdown
# Branch Report: <branch-slug>

- **Specialist:** <agent name>
- **Approach:** <one-line summary>
- **Branch directory:** <path>
- **Date:** <date>

## Approach Description
<2-3 paragraphs: what was done and why this approach was chosen>

## Implementation
| File | Description |
|------|-------------|
| `<filename>` | <what it does> |

## Metrics
| Metric | Value | Notes |
|--------|-------|-------|
| **<primary metric>** | **<value>** | <context> |
| <secondary metric> | <value> | <context> |

## Strengths
<bulleted list — what went well, what this approach excels at>

## Weaknesses
<bulleted list — limitations, failure modes, concerns>

## Artifacts Summary
<list of all files in the branch directory with paths>
```
  """
)
```

After spawning all branch Tasks, wait for all of them to complete before proceeding.

### Concurrent git strategy for parallel branches

When branches run in parallel they all commit to the same repo. Naive usage of
`experiment_versioning.md` Section B (shared by AR Section B.9) will race on
the git index lock, collide on tag names, and produce interleaved history.

**Each branch MUST select one strategy at spawn time** and record it in
`results.json.branchContext.gitStrategy`. The initiating specialist must name
the chosen strategy in each branch's Task prompt.

- **`branch-local` (default for AR fan-out):** before Phase 2 starts, the
  branch runs `git checkout -b ar/<branch-slug>` and commits exclusively on
  its own git branch. Tags are namespaced
  `research/<project>/<branch-slug>/<N>-<name>` (AR) or
  `exp/<project>/<branch-slug>/<N>-<name>` (planning-phase). No cross-branch
  collisions. Promotion (Section G) merges the winner's ref into the main
  working branch. Losing branches remain as refs for reference; deletion
  requires explicit user confirmation.

- **`lockfile`:** branches share the same working ref but serialize all git
  operations via a file lock at `.shards/branches/.git-lock` (file-creation
  with `O_EXCL`; retry-with-backoff on contention — default 5 retries,
  100ms-1s exponential backoff). Acceptable for small K (≤2); degrades under
  contention. Tag namespace includes the branch slug to prevent collisions
  even on a shared ref: `research/<project>/<branch-slug>/<N>-<name>`.

- **`no-vcs`:** branches disable Section B checkpoint calls entirely and rely
  solely on per-iteration markdown + `results.json` for lineage. A single
  consolidation commit is made at promotion time. Fallback only, when git is
  unavailable or intentionally disabled.

The chosen strategy is included in each branch's Task prompt above (the AR
fan-out prompt in `autonomous_research.md` Section H.3 already includes a
`Git strategy:` field). Planning-phase DIVERGE with parallel implementation
work should also pick a strategy explicitly rather than relying on the shared
ref.

Solo (non-fanned-out) AR and planning-phase DIVERGE with sequential branch
execution use the main working ref directly — no branch-local ref required.

---

## F. Post-Branch Convergence

After ALL branch Tasks have completed:

1. Update the DIVERGE section in `project-specs.md`:
   ```markdown
   - **Status:** Converged — awaiting arbiter
   ```

2. Call Syn in Arbiter Mode:

```python
Task(
  subagent_type="syn",
  description="ARBITER MODE: Time-Travel branch comparison",
  prompt="""
ARBITER MODE

Compare the following Time-Travel branches for project: <project_name>

**Project specs:** <path to project-specs.md>
**Branch reports:**
- `<project_dir>/.shards/branches/<branch-slug-1>/branch-report.md`
- `<project_dir>/.shards/branches/<branch-slug-2>/branch-report.md`

Read all branch reports and the project-specs.md, then follow your Arbiter Mode
instructions to produce a leaderboard and comparison.
  """
)
```

3. Present Syn's leaderboard and recommendation to the user.

4. Ask the user to select the winning branch:
   ```
   **Time-Travel complete.** Syn has compared the branches.

   <present leaderboard summary>

   Which branch do you want to promote? Or would you like to:
   (a) Pick a winner and continue
   (b) Run additional branches
   (c) Abandon the fork and pick a different approach entirely
   ```

**Gate to emit (convergence/arbitration):**

- **Planning-phase DIVERGE:** emit with ID
  `specific-instructions-shared-diverge-protocol-phase0-2`.
- **AR-session-start DIVERGE:** emit with ID
  `specific-instructions-shared-diverge-protocol-ar-<project>-converge` to
  avoid collision with the planning-phase convergence ID.

Example (planning-phase form):

::GATE:: id=specific-instructions-shared-diverge-protocol-phase0-2 phase=0 kind=final

::ENDGATE::

Wait for user to select a winner before proceeding.

---

## G. Promotion Protocol

When the user selects a winning branch:

1. **Handle the git strategy** recorded in the winning branch's
   `results.json.branchContext.gitStrategy`:
   - **`branch-local`:** run `git merge --squash ar/<winning-branch>` onto the
     main working ref. Create a consolidation commit:
     ```bash
     git commit -m "research: converge <winning-branch> — <metric>: <baseline> -> <final>"
     git tag -a "research/<project>/converged/<winning-branch>" -m "Converged from AR fan-out"
     ```
     Losing branches remain as refs (e.g., `ar/<losing-branch>`) for reference. **Do
     NOT delete losing refs** without explicit user confirmation.
   - **`lockfile`:** artifacts and tags already live on the main ref under the
     branch-slug-prefixed tag namespace. No merge needed. Still create the
     consolidation tag:
     ```bash
     git tag -a "research/<project>/converged/<winning-branch>" -m "Converged from AR fan-out (lockfile strategy)"
     ```
   - **`no-vcs`:** make the single consolidation commit now, staging the
     promoted artifacts (step 2):
     ```bash
     git add <promoted paths>
     git commit -m "research: converge <winning-branch> — <metric>: <baseline> -> <final>"
     ```
     (If git itself is unavailable, skip the commit and tag — record in
     `project-specs.md` that no VCS artifacts were produced.)

2. **Copy artifacts** from `<project_dir>/.shards/branches/<winning-branch>/` to the
   appropriate locations in the main project directory. Place files where they would
   have been produced in a normal phased run (e.g., queries in `queries/`, notebooks
   in `notebooks/`, code files at project root). For AR fan-out, copy the
   `experiments/` contents (brief, results.json, iteration files,
   history_summary.md) to `<project_dir>/experiments/`.

3. **Do NOT copy `branch-report.md`** to the main directory — it stays in the branch
   directory as historical record.

4. **Preserve all branch directories** — do not delete losing branches. They remain
   in `.shards/branches/` for future reference.

5. **Document CONVERGE** in `project-specs.md`:

```markdown
---

## CONVERGE: Time-Travel Resolution

- **Winner:** `<winning-branch-slug>`
- **Approach:** <winning approach summary>
- **Key metrics:**
  | Metric | Value |
  |--------|-------|
  | <primary metric> | <value> |
- **Runners-up:**
  - `<branch-slug>`: <approach> — <primary metric value> — <one-line why not chosen>
- **Arbiter leaderboard:** `.shards/branches/leaderboard.md`
- **Artifacts promoted to:** <main project directory paths>
- **Date:** <date>
```

6. **Update DIVERGE status:**
   ```markdown
   - **Status:** Resolved — winner: `<winning-branch-slug>`
   ```

7. **Resume normal workflow** at the phase after the fork point. The winning branch's
   artifacts are now in place as if they had been produced by the standard phased
   workflow. Continue with remaining phases (output format, review, handoff, etc.)
   using the promoted artifacts.

   For AR fan-out specifically, the parent specialist continues at AR Phase 3
   (see `autonomous_research.md` Section I) and runs knowledge harvest at that
   point (not during the branch loops — see Section H.10 of that protocol).
