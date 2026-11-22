> **Previous:** phase-1.md confirmed
> **Next:** This is the final phase of the Quick Track — follow escalation rules if scope grew, otherwise close the project.

---

## Quick Phase 2 — Implement and Validate

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

### Component specifications

Each task in `shards/<project_name>/tasks.yaml` cites one of these specifications through its `plan_ref`:

1. The fix.
2. Updated or added tests, if warranted.
3. Validation with `dbt build --select +model_name`.

### Lead loop

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

Follow {{protocol delegated_build}}. You are the lead: you dispatch, verify and record; you do not write build code yourself except for `delegate: inline` tasks.

This is a small build (two tasks or fewer in practice). The plan may mark its tasks `delegate: inline`; when it does, the lead performs those tasks itself, but still follows the same loop, the same acceptance commands and the same per-task evidence rows below.

1. **Load the task list.** Load `shards/<project_name>/tasks.yaml` (approved at the plan gate) with `tasks_set`. Fix any rejection (cycle, overlapping owned paths, missing acceptance) with the user before building.
2. **Dispatch.** `task_dispatch` the ready tasks (all `depends_on` done), in parallel up to `max_parallel=3`. Each task card cites its `plan_ref`, so workers see only the Component specifications they need.
3. **Collect.** Each worker returns a result through `task_report`.
4. **Lead verifies every report before it counts.** Re-run (or independently check) the task's acceptance command and compare the outcome with the cited `plan_ref`. Then write a per-task evidence row to the `## Validation` Evidence table (Check = task id + component, Expected, Observed, Pass/Fail). Never mark a task done on the worker's word alone. {{protocol incremental_testing}} is task evidence guidance.
5. **Failures.** Re-dispatch with the failure output as feedback, at most 2 retries; then stop and ask the user with a summary of what failed.
6. **Deviations.** If a worker reports a deviation, or the plan cannot be met, pause dependent tasks and follow {{protocol plan_drift}}; amend the plan only through a confirmed gate.
7. **Unblock.** After each verified task, dispatch the tasks it unblocks.
8. **Wrap up.** When all tasks are done, summarize what changed.

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Quick Phase 2

```markdown
---

## Quick Phase 2: Implementation (Data Engineer)
- **Files changed:**
  - <file path>: <what changed>
- **Tests added/modified:** <list or "none">
- **Task evidence:** one row per task in the `## Validation` Evidence table
- **Validation result:** Pass | Fail — <details>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Write-backs proposed:**
  - <title> → <knowledge job destination> (confirmed | declined | pending)
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

{{gate kind=final validates=data-engineer}}

---

## When this gate is confirmed

This is the final phase of the Quick Track. If escalation to Deep Track is required, read [`phases_deep/index.md`](../phases_deep/index.md) and continue from there. Otherwise, the project is complete.
