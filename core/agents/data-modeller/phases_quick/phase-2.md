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

Each task in `shards/<project_name>/tasks.yaml` cites one of these specifications through its `plan_ref`.

**Scope:** the change is to the core entity model (dimensions, facts, bridges,
snapshots). A change that is really to staging belongs to the Data Engineer, and
one to a consumer mart or metric to the Analytics Engineer: say so and recommend
that agent instead.

1. The change in model SQL and .yml schema.
2. Downstream models that reference changed columns (for a consumer mart owned
   by the Analytics Engineer, only the minimal compatible update; flag anything
   more for the Analytics Engineer).
3. Validation with `dbt build --select +model_name+`.
4. **Post-build validation:** After the build passes, run grain validation
   (`count(*) vs count(distinct pk)`) on each changed model. For models with
   joins, run the fan-out check from `protocols/join_path.md` Tier 2+. Run
   `dbt show --select <model> --limit 5` to confirm output looks right.
   If any check fails, the task fails. Skip if no-data environment.
   **Auto-verify:** if 3+ models are being validated, open
   `{{auto_verify start tool_budget=20 ttl=600}}` before the sweep and
   `{{auto_verify end}}` after. See [`protocols/auto_verify_mode.md`](../../../protocols/auto_verify_mode.md).

### Lead loop

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

Follow the lead loop in {{protocol delegated_build}} (task evidence guidance: {{protocol incremental_testing}}). Each task card cites its `plan_ref`, so workers see only the Component specifications they need.

This is a small build (two tasks or fewer in practice). Tasks marked `delegate: inline` are done by the lead itself, through the same loop, acceptance commands and per-task evidence rows. When all tasks are done, summarize what changed.

**Analytics Engineer review.** You orchestrate the build; the Analytics Engineer reviews it and surfaces issues, without editing:

{{consult analytics-engineer entry=review task="Review the quick-track model change for [project_name]"}}

Brief: the project-specs path, the files changed and the change's intent; ask for each issue with file, line and the change to make. Apply {{protocol reviewer_verdict}}: for NEEDS REVISION or BLOCKED findings, the reviewed tasks are already done and cannot be re-dispatched, so add review-fix tasks through {{protocol plan_drift}}: raise its amendment gate with the findings as the proposed change, then call `tasks_set` with the revised manifest (one fix task per affected component, for your own workers, acceptance = the original check plus the finding resolved) and `amendment_gate`, dispatch them and verify each with `task_verify`.

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Quick Phase 2

Append to project-specs.md:

```markdown
---

## Quick Phase 2: Implementation (Data Modeller)
- **Files changed:**
  - <file path>: <what changed>
- **Downstream updates:** <files updated or "none needed">
- **Task evidence:** one row per task in the `## Validation` Evidence table
- **Validation result:** Pass | Fail — <details>
- **Analytics Engineer review:** APPROVED | NEEDS REVISION → resolved | BLOCKED → resolved — <issues or "none">
- **Post-build validation:** PASS | FAIL | SKIPPED (no data) — <details>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Write-backs proposed:**
  - <title> → <knowledge job destination> (confirmed | declined | pending)
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update the specs header status to `Complete`.

{{gate kind=final}}

---

## When this gate is confirmed

This is the final phase of the Quick Track. If escalation to Deep Track is required, read [`phases_deep/index.md`](../phases_deep/index.md) to orient, then {{phase 1 track=deep}} and continue from Deep Phase 1. Otherwise, the project is complete.
