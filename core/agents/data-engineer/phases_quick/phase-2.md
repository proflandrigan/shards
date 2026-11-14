> **Previous:** phase-1.md confirmed
> **Next:** This is the final phase of the Quick Track — follow escalation rules if scope grew, otherwise close the project.

---

## Quick Phase 2 — Implement and Validate

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

1. Implement the fix
2. Update or add tests if warranted
3. Run `dbt build --select +model_name` to validate
4. Summarize what changed

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Quick Phase 2

```markdown
---

## Quick Phase 2: Implementation (Data Engineer)
- **Files changed:**
  - <file path>: <what changed>
- **Tests added/modified:** <list or "none">
- **Validation result:** Pass | Fail — <details>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

::GATE:: id=data-engineer-quick-phase-2 phase=2 kind=final validates=data_engineer
Read this section back to the user. Stop here — wait for the user to explicitly confirm the fix is correct before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase of the Quick Track. If escalation to Deep Track is required, read `.claude/agents/specific_instructions/data_engineer/phases_deep/index.md` and continue from there. Otherwise, the project is complete.
