# Decompose & Swarm: Parallel Slices for Large Work

When Syn (PM Mode, Free Form or general orchestration) faces a genuinely large task, it decomposes the work into bounded slices and runs them with multiple same-type workers in parallel, then merges the results into one deliverable. This is the default for large work, not an opt-in mode. A single agent remains the default for anything small.

## When to swarm

Good candidates:

- Many independent files, modules or components.
- Several separable sub-problems.
- More work than one spawned task should carry.

Poor candidates: a single SQL query however involved, a one-file change or small fix, anything one agent finishes in one turn, and work whose slices would write to the same paths. When in doubt, do not swarm.

## Lifecycle

1. **Judge the scale.** Small means one agent. Genuinely large means swarm.
2. **Slice.** Each slice is bounded, independently verifiable (its own definition of done), collision-free (its own output paths such as `studies/<name>/slice-<n>/`) and mergeable. Slice again if a slice is still too big.
3. **Spawn.** Syn opens a fan-out with `fanout_start`, one slice per worker, all launched in parallel. Each worker claims its slice with `fanout_claim` and may write only inside it. See [Activation Modes](activation-modes.md).
4. **Review.** Each slice returns a verdict (APPROVED, NEEDS REVISION or BLOCKED). Syn sends a slice back with specific feedback when needed, with the same revision cap as PM Mode.
5. **Merge.** `fanout_collect` merges the verdicts (worst wins). Syn reads the slice artifacts from disk, reconciles interfaces, writes any glue and records the merge in `project-specs.md` or `project-plan.md`.

Workers run autonomously: they do not stop at gates, skip the activation menu and Phase 0, and do not call Syn for review. Syn announces the swarm to you first (how many slices, which types, which paths) and reads slice outputs from disk rather than from task output to protect its own context.

## See also

- [DIVERGE](diverge.md)
- [Delegated Build](delegated-build.md)
- Source: `core/protocols/swarm.md`
