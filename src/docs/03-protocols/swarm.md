# Decompose & Swarm — Parallel Slices for Large Work

When Syn (PM Mode, Free Form, or general orchestration) faces a genuinely large
task, it defaults to decomposing the work into bounded slices and executing them
with **multiple same-type subagents running in parallel** — then Syn merges the
slice results into one deliverable. This is the default for large work, not an
opt-in mode.

## When to swarm

Good swarm candidates:

- A task with many independent files or modules.
- Several different sub-problems that can be worked in parallel.
- More work than one subagent should carry in a single spawned task.

Poor swarm candidates:

- A single SQL query, no matter how involved.
- A one-file change or small fix.
- Anything a single agent completes cleanly in one turn.
- Work where slices would write to the same paths and collide.

## Lifecycle

1. **Judge the scale.** Small → one agent. Genuinely large → swarm.
2. **Slice.** Break the task into bounded, independently verifiable units, each
   with its own output paths and a definition of done.
3. **Spawn.** Issue parallel Task calls of the same `subagent_type`, one per
   slice, each with a distinct brief and distinct output directory.
4. **Review.** Review each slice (APPROVED / NEEDS REVISION / BLOCKED).
5. **Merge.** Syn reads the slice artifacts from disk, reconciles interfaces,
   and produces the coherent final deliverable.

Syn is never limited to one instance of an agent per project — multiple data
scientists, ML engineers, or any specialist type may run in parallel when the
work warrants it.

Supported by `specific_instructions/shared/swarm_protocol.md` (agent-facing
instructions).
