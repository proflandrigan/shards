# Workflow: DIVERGE Exploration

When the approach is unclear and a single specialist guessing is likely wrong, fork parallel branches. Each branch runs to completion independently, Syn's arbiter compares them, and you pick a winner.

## Flow

```
Specialist identifies a branching point
  └─ Proposes DIVERGE: gate_request (kind=phase) with the proposal as summary
     └─ You confirm the fork
        ├─ Branch A (fan-out worker)
        ├─ Branch B (fan-out worker)
        └─ Branch C (fan-out worker)
              │
        Each branch writes a branch-report.md
              │
        Syn arbiter reads all reports
              │
        Leaderboard + trade-off analysis (advisory)
              │
        You select the winner
              │
        Winning branch promoted to the main project directory
```

## When to use

- Competing architectural choices (vector DB vs. keyword search).
- Competing modelling approaches (gradient boosting vs. transformer).
- Unclear whether a feature is worth building.
- You have budget for parallel work and want evidence, not opinion.

## When not to use

- The answer is constrained by known infrastructure.
- The differences between branches are cosmetic.
- You need any working answer now.

## How it runs in v2

- **Proposal is a gate.** The specialist calls `gate_request` with the fork proposal (branches, rationale, risk) as the summary and stops. No branch starts until you confirm. DIVERGE is proposed in planning phases or at the start of an `[AR]` session, never mid-loop.
- **Branches are fan-out workers.** Each branch runs in `fanout_worker` activation mode, fanned out in parallel by the runtime (`fanout_start`, `fanout_claim`, `fanout_collect`). Branch work lives under `<project_dir>/.shards/branches/<branch-slug>/`. Branches get no `project-specs.md` of their own; the main one stays the single source of truth. See [Activation modes](../03-protocols/activation-modes.md) and [Swarm](../03-protocols/swarm.md).
- **Isolation.** Branches cannot see each other's state, only compete on the report they emit.
- **Arbiter.** Syn's arbiter consult (`syn-arbiter`) reads every report, builds a side-by-side leaderboard and recommends. It does not promote anything; the decision is yours.
- **Promotion.** After you choose, the winner's artifacts move into the main project directory; the other branches stay under `.shards/branches/` for reference.

## Branch report

Every branch writes a `branch-report.md` following `core/templates/branch-report.md`: approach summary, results and metrics, trade-offs, estimated cost and confidence.

## Composition with AR

AR fan-out composes DIVERGE with Autonomous Research: each branch runs its own AR loop and the arbiter compares the best candidate from each. See [Autonomous Research](../03-protocols/autonomous-research.md).

## See also

- [DIVERGE protocol](../03-protocols/diverge.md)
- [Swarm](../03-protocols/swarm.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- [Syn](../02-agents/syn.md)
