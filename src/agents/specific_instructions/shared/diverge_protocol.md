---
name: diverge-protocol
description: >
  Time-Travel branching protocol for parallel experimentation. Defines the full
  fork-execute-converge lifecycle: when to propose DIVERGE, how to spawn parallel
  branch Tasks, how branches produce reports, how JFL arbitrates, and how the
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

1. You are in a **planning phase** (methodology, architecture, or model design) — never during execution phases.
2. You have identified **2-3 mutually exclusive approaches** that are genuinely viable.
3. **No single approach is clearly superior.** If one approach dominates on every dimension (accuracy, complexity, interpretability, cost), just pick it. DIVERGE is for genuine uncertainty.
4. The approaches are **fundamentally different** — different model families, different analytical methodologies, different architectural paradigms. Not minor hyperparameter variations (that is Experiment Mode).

**Do NOT propose DIVERGE when:**
- One approach is clearly better — just pick it
- The difference is a tuning choice (learning rate, regularization) — use Experiment Mode
- The user has already expressed a strong preference for one approach
- The project is in execution phases — DIVERGE only during planning

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
produces artifacts and a branch report, then JFL compares them as an arbiter
so you can pick the winner.

**Proceed with DIVERGE, or pick one approach and go straight?**
```

**Branch slug rules:** lowercase, hyphenated, descriptive. Examples: `xgboost-raw-features`, `linear-pca-transformed`, `transformer-architecture`, `rule-based-baseline`.

**GATE:** The user must explicitly confirm DIVERGE. If they pick a single approach, proceed with the standard phased workflow — no fork. If they confirm DIVERGE, continue to Section C.

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

Spawn one Task per branch. **All branch Tasks must be called in parallel** — do not run them sequentially. Use the same specialist type as yourself (a data-scientist fork spawns data-scientist branches).

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
   the template below. This is the artifact JFL will read during arbitration.

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

---

## F. Post-Branch Convergence

After ALL branch Tasks have completed:

1. Update the DIVERGE section in `project-specs.md`:
   ```markdown
   - **Status:** Converged — awaiting arbiter
   ```

2. Call JFL in Arbiter Mode:

```python
Task(
  subagent_type="jfl",
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

3. Present JFL's leaderboard and recommendation to the user.

4. Ask the user to select the winning branch:
   ```
   **Time-Travel complete.** JFL has compared the branches.

   <present leaderboard summary>

   Which branch do you want to promote? Or would you like to:
   (a) Pick a winner and continue
   (b) Run additional branches
   (c) Abandon the fork and pick a different approach entirely
   ```

**GATE:** Wait for user to select a winner before proceeding.

---

## G. Promotion Protocol

When the user selects a winning branch:

1. **Copy artifacts** from `<project_dir>/.shards/branches/<winning-branch>/` to the
   appropriate locations in the main project directory. Place files where they would
   have been produced in a normal phased run (e.g., queries in `queries/`, notebooks
   in `notebooks/`, code files at project root).

2. **Do NOT copy `branch-report.md`** to the main directory — it stays in the branch
   directory as historical record.

3. **Preserve all branch directories** — do not delete losing branches. They remain
   in `.shards/branches/` for future reference.

4. **Document CONVERGE** in `project-specs.md`:

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

5. **Update DIVERGE status:**
   ```markdown
   - **Status:** Resolved — winner: `<winning-branch-slug>`
   ```

6. **Resume normal workflow** at the phase after the fork point. The winning branch's
   artifacts are now in place as if they had been produced by the standard phased
   workflow. Continue with remaining phases (output format, review, handoff, etc.)
   using the promoted artifacts.
