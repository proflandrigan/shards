# Swarm Protocol — Decompose Large Work into Parallel Slices

This protocol defines Syn's **default behavior for genuinely large tasks**:
decompose the work into bounded, independently verifiable slices and run them
as multiple same-type subagents in parallel, then merge the results. It applies
whenever Syn orchestrates — PM Mode, Free Form, or general routing. It is the
default, not an opt-in mode. Syn is never limited to one instance of an agent
per project.

## When to swarm

Swarm when the task is genuinely large:

- The task touches many files, modules, or independent components.
- It contains several clearly separable sub-problems that can be worked in
  parallel.
- One subagent would be carrying far more work than a single spawned task
  should.
- The natural seams (data partitions, file sets, sub-questions, end-to-end
  layers) allow slices to be worked independently.

Do NOT swarm when the task is small:

- A single SQL query, no matter how involved.
- A one-file change, small fix, or trivial update.
- Anything one agent completes cleanly in a single turn's work.
- Work whose only splits would force the slices to write to the same paths and
  collide.

When in doubt, do not swarm. A single agent is the default; a swarm is a
deliberate response to genuine scale.

## Slice heuristics

Each slice must be:

- **Bounded** — one clearly-scoped sub-task, expressible in a short brief.
- **Independently verifiable** — it has its own definition of done.
- **Collision-free** — it writes to its own output paths (e.g.
  `studies/<name>/slice-<n>/`), so parallel slices never overwrite each other.
- **Mergeable** — its outputs can be read from disk and integrated by Syn.

Slice names are short kebab-case slugs. If a slice is still too big after
slicing, slice it again rather than letting any subagent grind on an oversized
chunk.

## Spawn mechanics

Spawn all slices in a single parallel fan-out: one Task call per slice, all in
the same message. The `subagent_type` repeats across the calls — that is
expected and correct; same-type instances simply get different slice briefs.

```
Task(
  subagent_type="<specialist>",
  description="Slice: <slice-slug>",
  prompt="""
SWARM SLICE — You are one of N parallel same-type subagents executing a slice
of a larger task that Syn orchestrated.

**Slice:** <slice-slug>
**Slice directory:** <path>
**Scope:** <what this slice specifically builds or analyzes>
**Inputs:** <what upstream slices or existing systems provide>
**Outputs:** <what this slice must produce, and where on disk>
**Definition of done:** <one sentence>

Work autonomously. Do not wait for user gates. Do not invoke Syn for review.
Return a concise report: artifacts produced, key decisions, issues, confidence,
and anything the merge step needs to know.
  """
)
```

## Review and merge

- **Review each slice** as its Task returns, against the slice's definition of
  done: APPROVED / NEEDS REVISION / BLOCKED. Send a slice back for revision
  with specific feedback when needed (same cap as PM Mode revisions).
- **Merge** after (some or all) slices pass: read each slice's artifacts from
  disk, reconcile interfaces and outputs, write any glue, and produce the
  workstream's single coherent deliverable. Record the merge in
  `project-specs.md` or `project-plan.md` as appropriate.
- **Re-slice** if you find a slice was mis-sized: split it further and spawn
  again rather than letting one agent grind.

## Cross-cutting rules

- Announce swarming to the user: how many slices, which types, what paths.
- Prefer parallel spawns — do not await one slice before dispatching the next.
- Guard your own context: read slice outputs from disk, not from Task output.
- Never degrade to a single massive workstream task when the work is large —
  decompose is the default.
