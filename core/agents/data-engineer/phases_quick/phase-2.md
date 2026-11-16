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

1. Implement the fix
2. Update or add tests if warranted
3. Run `dbt build --select +model_name` to validate
4. Summarize what changed

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Quick Phase 2

```markdown
---

## Quick Phase 2: Implementation (Data Engineer)
- **Files changed:**
  - <file path>: <what changed>
- **Tests added/modified:** <list or "none">
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
