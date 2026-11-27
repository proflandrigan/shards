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

This is a small build (two tasks or fewer in practice). The plan may mark its tasks `delegate: inline`; when it does, the lead performs those tasks itself, but still follows the same loop, the same acceptance commands and the same per-task evidence rows.

Run the protocol's lead loop on `shards/<project_name>/tasks.yaml` (approved at the plan gate), dispatching up to `max_parallel=3`; each task card cites its `plan_ref`, so workers see only the Component specifications they need. {{protocol incremental_testing}} is task evidence guidance. In addition:

- **Wrap up.** When all tasks are verified, summarize what changed.

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

## Quick-to-Deep Escalation

If during Quick Phase 1 or Quick Phase 2 the scope grows beyond a quick fix (new
source ingestion, new or redesigned staging models, grain or materialization
decisions, or several models or layers affected), escalate:

1. **Announce** what triggered the escalation and why the Quick track can't handle it.
2. **Check ownership.** A new or redesigned core entity model (dimensions,
   facts, bridges, snapshots) belongs to the Data Modeller; new or redesigned
   intermediate, consumer mart or metrics-layer models belong to the Analytics
   Engineer. Neither is the Deep track: say so and recommend
   `shards:data-modeller` or `shards:analytics-engineer` (or Syn).
3. **Otherwise propose** the Deep track within the same Data Engineer session.
4. **Preserve context:** write an `## Escalation Brief` section to
   `project-specs.md` in the format defined in
   [`protocols/behavioral_rules.md`](../../../protocols/behavioral_rules.md), with
   **Target agent** `Data Engineer (Deep Track)`, `Data Modeller` or `Analytics Engineer`.

After the user confirms a Deep escalation, read
[`phases_deep/index.md`](../phases_deep/index.md), then {{phase 1 track=deep}} and
resume from Deep Phase 1, treating the Escalation Brief as prior context.

---

## When this gate is confirmed

This is the final phase of the Quick Track. If escalation to Deep Track is required (per the Quick-to-Deep Escalation section in this phase), read [`phases_deep/index.md`](../phases_deep/index.md) to orient, then {{phase 1 track=deep}} and continue from Deep Phase 1. Otherwise, the project is complete.
