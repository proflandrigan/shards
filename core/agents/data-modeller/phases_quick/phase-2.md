> **Previous:** phase-1.md confirmed
> **Next:** This is the final phase of the Quick Track — follow the escalation rules if scope grew, otherwise close the project.

---

## Quick Phase 2 — Implement and Validate

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol knowledge_checkpoint}} before building.

1. Implement the change in model SQL and .yml schema
2. Update any downstream models that reference changed columns
3. Run `dbt build --select +model_name+` to validate
4. **Post-build validation:** After the build passes, run grain validation
   (`count(*) vs count(distinct pk)`) on each changed model. For models with
   joins, run the fan-out check from `join_path_protocol.md` Tier 2+. Run
   `dbt show --select <model> --limit 5` to confirm output looks right.
   If any check fails, fix before proceeding. Skip if no-data environment.
   **Auto-verify:** if 3+ models are being validated, open
   `{{auto_verify start tool_budget=20 ttl=600}}` before the sweep and
   `{{auto_verify end}}` after. See [`protocols/auto_verify_mode.md`](../../../protocols/auto_verify_mode.md).
5. Summarize what changed

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
{{protocol knowledge_harvest}} and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Quick Phase 2

Append to project-specs.md:

```markdown
---

## Quick Phase 2: Implementation (Data Modeller)
- **Files changed:**
  - <file path>: <what changed>
- **Downstream updates:** <files updated or "none needed">
- **Validation result:** Pass | Fail — <details>
- **Post-build validation:** PASS | FAIL | SKIPPED (no data) — <details>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update the specs header status to `Complete`.

{{gate kind=final}}

---

## When this gate is confirmed

This is the final phase of the Quick Track. If escalation to Deep Track is required, read [`phases_deep/index.md`](../phases_deep/index.md) and continue from there. Otherwise, the project is complete.
