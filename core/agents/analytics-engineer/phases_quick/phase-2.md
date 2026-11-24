> **Previous:** phase-1.md confirmed
> **Next:** This is the final phase of the Quick Track — follow the escalation rules if scope grew, otherwise close the project.

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

1. The change in the model SQL and schema file (one task per changed model, or one combined task for a single-model change).
2. Downstream updates if column names or types changed.
3. The stack's build/validate command.
4. **Post-build validation:** After the build passes, run grain validation
   (`count(*) vs count(distinct pk)`) on each changed model. For models with
   joins, run the fan-out check from `protocols/join_path.md` Tier 2+. Run
   `dbt show --select <model> --limit 5` to confirm output looks right.
   If any check fails, the task fails. Skip if no-data environment.

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

## Quick Phase 2: Implementation (Analytics Engineer)
- **Files changed:**
  - <file path>: <what changed>
- **Downstream updates:** <files updated or "none needed">
- **Task evidence:** one row per task in the `## Validation` Evidence table
- **Validation result:** Pass | Fail — <details>
- **Tests passing:** <N> / <N>
- **Post-build validation:** PASS | FAIL | SKIPPED (no data) — <details>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Write-backs proposed:**
  - <title> → <knowledge job destination> (confirmed | declined | pending)
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

{{gate kind=final}}

---

## Quick-to-Deep Escalation

If during Quick Phase 1 or Quick Phase 2 the scope grows beyond a quick change (e.g., blast radius is Significant, new models are needed, or the change requires a full redesign), escalate to the Deep track:

1. **Announce:** Tell the user exactly what triggered the escalation and why the Quick track can't handle it.
2. **Propose:** Recommend switching to the Deep track within the same Analytics Engineer session.
3. **Preserve context:** Write an `## Escalation Brief` section to `project-specs.md` following the format defined in [`protocols/behavioral_rules.md`](../../../protocols/behavioral_rules.md). Set the **Target agent** to `Analytics Engineer (Deep Track)`.
4. **Hand off:** Tell the user:

> "This has grown beyond a quick change — [specific trigger]. I recommend switching to the **Deep track** for a full pipeline design.
>
> I've written an Escalation Brief to `project-specs.md` so nothing is lost. I'll load the Deep track phases now and pick up from the brief."

After the user confirms, read [`phases_deep/index.md`](../phases_deep/index.md) to orient on the Deep Track phases, then {{phase 1 track=deep}} and resume from Deep Phase 1, treating the Escalation Brief as prior context.

---

## When this gate is confirmed

This is the final phase of the Quick Track. If escalation to Deep Track is required (per the Quick-to-Deep Escalation section in this phase), read [`phases_deep/index.md`](../phases_deep/index.md) to orient, then {{phase 1 track=deep}} and continue from Deep Phase 1. Otherwise, the project is complete.
