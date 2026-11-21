# DIVERGE: Time-Travel Branches

When 2 or 3 viable approaches exist in a planning phase, you can fork the project into parallel branches, run them at the same time, compare results and promote the winner. This is Shards' answer to "I can't decide which approach will work best, so try all of them."

## When to use it

DIVERGE is allowed only (a) in a planning phase (methodology, architecture or model design), or (b) at the start of an `[AR]` session, before its Phase 1 gate. Never mid-loop. It also needs 2 or 3 mutually exclusive, genuinely viable approaches with no clear winner, and approaches that differ fundamentally (model families, methodologies, architectures), not hyperparameters.

Poor candidates: there is a clear right answer, the approaches differ only in code structure, you have budget for one attempt, or you already prefer one approach.

DIVERGE is opt-in and user-gated. A specialist proposes it and never forks on its own.

## Lifecycle

1. **Propose.** The specialist presents a table of branches (slug, approach, rationale, risk) and calls `gate_request` with the proposal as the summary. Nothing spawns until you confirm. If you pick a single approach, the normal phased workflow continues.
2. **Document.** Before spawning, the specialist appends a DIVERGE section to `project-specs.md` (fork point, trigger, branches, directories, status).
3. **Fork.** Each branch is a worker in a parallel fan-out with its own directory `<project_dir>/.shards/branches/<branch-slug>/`. Branches get the completed planning phases as context but no `project-specs.md` of their own. They run autonomously, with no user gates, and write only inside their directory (see [Activation Modes](activation-modes.md)).
4. **Report.** Each branch writes `branch-report.md` (approach, implementation, metrics, strengths, weaknesses, artifacts) from `core/templates/branch-report.md`.
5. **Converge.** Syn Arbiter reads every report, builds a leaderboard with metrics and trade-offs, and returns an advisory recommendation. A convergence gate then asks you to pick a winner, run more branches or abandon the fork. You make the final decision.
6. **Promote.** The winning branch is promoted into the main project directory. `branch-report.md` stays in the branch directory, and losing branches are preserved. A CONVERGE section is added to `project-specs.md`.

Gate ids for AR-initiated forks use an `-ar-<project>` suffix so they do not collide with planning-phase fork gates in the same project.

## Concurrent git strategy

Parallel branches share a repository, so each picks one strategy at spawn time and records it in `results.json`:

- **`branch-local`** (default for AR fan-out): each branch commits on its own git branch (`ar/<branch-slug>`) with namespaced tags. Promotion squash-merges the winner. Losing refs are kept, and deleting them needs your confirmation.
- **`lockfile`**: branches share a ref and serialize git operations through a file lock under `.shards/branches/`. Fine for two branches, degrades under contention.
- **`no-vcs`**: checkpoints are disabled and a single consolidation commit happens at promotion. A fallback when git is unavailable.

## See also

- [Autonomous Research](autonomous-research.md): AR composes with DIVERGE (AR fan-out)
- [Experiment Versioning](experiment-versioning.md)
- [Swarm](swarm.md)
- [Example: DIVERGE Exploration](../07-workflows/diverge-exploration.md)
- Source: `core/protocols/diverge.md`, `core/agents/syn/modes/arbiter.md`
