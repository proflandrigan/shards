# Workflow: DIVERGE Exploration

When the approach is unclear and a single specialist guessing is likely wrong, fork parallel branches. Each branch runs to completion independently; Syn Arbiter compares them; the user picks a winner.

## Flow

```
Specialist identifies branching point
  └─ Proposes DIVERGE to Syn
     └─ Syn approves fork
        ├─ Branch A (Task: specialist in isolation)
        ├─ Branch B (Task: specialist in isolation)
        └─ Branch C (Task: specialist in isolation)
           │   │   │
           ▼   ▼   ▼
        Each branch produces branch-report.md
           │
        Syn Arbiter reads all reports
           │
        Leaderboard + trade-off analysis
           │
        User selects winner
           │
        Promote winning branch to main project dir
```

## When to use

- Competing architectural choices (e.g., vector DB vs. keyword search).
- Competing modeling approaches (e.g., gradient boosting vs. transformer).
- Unclear whether a feature is even worth building.
- You have budget for parallel work and want evidence, not opinion.

## When not to use

- The answer is constrained by known infrastructure.
- The differences between branches are cosmetic.
- You're under time pressure and need any working answer now.

## Branch isolation

Each branch runs as an isolated Task. Branches cannot see each other's state — they can only compete on the branch report they emit. This prevents cross-contamination and ensures fair comparison.

## Branch report

Every branch emits a `branch-report.md` following the template at `src/templates/branch-report.md`:

- Approach summary.
- Results / metrics.
- Trade-offs.
- Estimated cost (compute, latency, engineering effort).
- Confidence in recommendation.

## Syn Arbiter

After branches complete, Syn enters Arbiter mode:

- Reads every branch report.
- Builds a side-by-side leaderboard.
- Calls out metrics where branches diverge.
- Provides an advisory recommendation.

The user makes the final call — Arbiter does not unilaterally promote.

## Promotion

After user selection, the winning branch's artifacts are promoted to the main project directory. Other branches are archived (not deleted) under `<project>/branches/<branch-id>/` for reference.

## Composition with AR

AR fan-out composes DIVERGE with Autonomous Research: each branch runs its own AR loop. When finished, Arbiter compares the best candidate from each branch's loop. Covered in section H of the AR protocol.

## See also

- [DIVERGE protocol](../03-protocols/diverge.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- [Syn](../02-agents/syn.md)
