# DIVERGE — Time-Travel Branches

When 2-3 viable approaches exist in a planning phase, you can fork the project into parallel branches, execute them simultaneously, compare results, and promote the winner. This is Shards' answer to "I can't decide which approach will work best — let's just try all of them."

## When to use it

Good DIVERGE candidates:

- Multiple model architectures worth comparing (tree-based vs. gradient boosting vs. neural).
- Multiple prompt strategies (few-shot vs. chain-of-thought vs. tool use).
- Multiple join strategies for a query.
- Multiple transformation-layer designs.

Poor DIVERGE candidates:

- There's a clear right answer, you just haven't asked.
- The approaches differ in code structure, not outcomes.
- You only have budget for one attempt.

## Lifecycle

1. **Propose** — a specialist identifies 2-3 viable approaches during a planning phase and proposes DIVERGE. It names the branches, the success metric, and the budget per branch.
2. **Confirm** — you approve or veto.
3. **Fork** — each branch spawns as an autonomous Task. Each branch gets its own directory under `.shards/branches/<branch-slug>/`.
4. **Execute** — branches run independently. They share the same `project-specs.md` scaffold up to the fork point, then diverge.
5. **Report** — each branch produces a `branch-report.md` with its result and self-assessment.
6. **Converge** — Syn Arbiter reads all branch reports, builds a side-by-side leaderboard with metrics and trade-offs, and returns an **advisory recommendation**. You make the final decision.
7. **Promote** — the winning branch is promoted back to the main project directory.

## Branch report template

Each branch produces `branch-report.md` with:

- Branch name and approach description.
- Metric results (comparable across branches).
- What worked / what didn't / what surprised the specialist.
- Self-assessed trade-offs.

Template: `src/templates/branch-report.md`.

## Syn Arbiter mode

When all branches complete, Syn enters Arbiter mode (`src/agents/specific_instructions/syn/arbiter.md`). It reads every `branch-report.md`, builds a leaderboard table, and produces an advisory recommendation. **The user makes the final decision.**

## See also

- [Autonomous Research](autonomous-research.md) — DIVERGE composes with AR (Section H: "AR fan-out").
- [Example: DIVERGE Exploration](../07-workflows/diverge-exploration.md)
- Source: `src/agents/specific_instructions/shared/diverge_protocol.md`
- Source: `src/agents/specific_instructions/syn/arbiter.md`
