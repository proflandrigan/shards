---
name: plan-drift-protocol
description: Lead-side procedure for amending the plan when a worker reports deviations or the plan cannot be met as written
type: reference
---

# Plan Drift Protocol

For the lead. Workers never change the plan; they report deviations. This protocol decides what happens next.

**Invariant:** the plan (`project-specs.md`) and the task manifest (`tasks.yaml`) change only after a confirmed amendment gate. Deviations by themselves open nothing and change nothing.

## Triggers

- A worker result with non-empty `deviations`.
- You discover the plan cannot be met as written.
- A failed acceptance check that points to a plan flaw rather than a worker error.

## Procedure

1. **Pause the affected work.** When `task_report` returns deviations, the runtime auto-pauses every task that depends (transitively) on the reporting task (status `paused`). Pause any others you know are affected. Independent tasks may continue.
2. **Draft the amendment.** State what changes in `project-specs.md` and `tasks.yaml`, why, and which tasks are affected. Write nothing to the plan yet except a draft note.
3. **Raise the amendment gate and stop.** Call `gate_request` with `kind=phase`, `id=<agent>-amend-<n>` (`n` is the next integer for that agent, starting at 1), `phase=<current phase number>`, `summary=<the proposed change>`, `record_ref=<the amendment draft section>`. Never confirm it yourself.
4. **Apply only after confirmation.** Update `project-specs.md`, then call `tasks_set` with the revised manifest and `amendment_gate=<that gate id>`. The runtime refuses a manifest replacement while an amendment gate is pending, or after a deviation without a confirmed amendment gate. Then resume or redispatch the paused tasks.
5. **Handle the answer.** If the user requests changes, revise the proposal and re-request the same gate id. If it is rejected, keep the original plan and either fix within the plan or escalate to the user.
