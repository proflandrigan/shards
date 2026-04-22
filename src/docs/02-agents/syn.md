# Syn — Orchestrator

> Friendly, structured. The entry point to everything.

Syn is the orchestrator of the Shards suite. Its job is to triage incoming requests, decide which specialist should handle the work, initialize the project directory and `project-specs.md`, and hand off. Syn also serves as the universal final reviewer — every specialist invokes Syn for sign-off before execution.

## Activation menu

- `[T]` **Triage** — Tell me what you need and I'll figure out who handles it.
- `[F]` **Fix** — Quick fix or minor update on something that exists. Syn applies the fix directly, suspending the "facilitate don't generate" rule.
- `[P]` **Project** — Multi-specialist project. Syn plans, coordinates, and reviews the whole thing.
- `[S]` **Status** — Check on a current project.
- `[R]` **Review** — Review a specialist's plan before execution.
- `[B]` **Brainstorm** — Bring a problem (or nothing) and let the shards ideate.
- `[D]` **Diff** — Compare two projects side by side.
- `[K]` **Knowledge** — Seed, browse, or manage the Knowledge Ledger.
- `[G]` **GitHub PR** — Walk through PR review comments and apply fixes with approval.

## Modes

Syn's mode files live at `.claude/agents/specific_instructions/syn/`:

| Mode | File | Purpose |
|---|---|---|
| Brainstorm | `brainstorm.md` | Multi-agent ideation. Also has the `/brainstorm` command entry point. |
| Fixer | `fixer.md` | `[F]` Direct fix mode. Syn implements minor fixes without specialist handoff. |
| Code Review | `code_review.md` | Triggered when a specialist calls Task with `CODE REVIEW MODE`. Partitions Python vs. non-Python and dispatches to Backend Engineer / Analytics Engineer. |
| Final Review | `final_review.md` | Read when specialists invoke Syn for sign-off. Returns `APPROVED` / `NEEDS REVISION` / `BLOCKED`. |
| Arbiter | `arbiter.md` | Time-Travel branch comparison. Reads all branch reports, builds leaderboard, recommends a winner. |
| Diff | `diff.md` | `[D]` Cross-project comparison. Produces structured diff report. |
| Knowledge | `knowledge.md` | `[K]` and `/knowledge` command. Seed, browse, and manage the Knowledge Ledger. |
| PR Review | `pr_review.md` | `[G]` and `/review-pr` command. Walks through GitHub PR comments with guided fixes. |

## Phases

Syn does not have phases of its own. It runs a **Phase 0 Triage** that selects a specialist, creates the project directory and `project-specs.md` scaffold, then performs an **in-session persona transfer** (Syn becomes the specialist). All subsequent phases belong to that specialist.

## Consulted by

Every specialist invokes Syn for final review via Task. Syn returns a three-tier verdict — see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md).

## Output directory

Syn doesn't have a dedicated output directory. It writes to:

- `brainstorm/` for brainstorm sessions.
- `fixes/` for the Fixer mode.
- `.shards/branches/` for DIVERGE branches.
- The target project directory when acting as final reviewer.

## Entry points

| From | How |
|---|---|
| Slash command | `/shards` |
| Brainstorm | `/brainstorm` |
| Knowledge Ledger | `/knowledge` |
| PR review | `/review-pr` |
| UI | Any agent card labeled "Syn" in the agent picker |

## See also

- [The Gate Pattern](../03-protocols/gate-pattern.md)
- [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)
- [DIVERGE](../03-protocols/diverge.md) — Syn Arbiter mode
- Source: `src/agents/syn.md`
