> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Deep Phase 5 — Documentation Plan

Goal: Document every model and column for downstream consumers.

Ask about:
- Documentation level? (minimal, standard, thorough)
- Existing documentation patterns?
- Columns needing business-context descriptions?

### Document Deep Phase 5

```markdown
---

## Deep Phase 5: Documentation Plan (Data Engineer)
- **Documentation level:** Minimal | Standard | Thorough
- **Schema file(s):**
  - <file path>
- **Model descriptions:**
  - <model>: <1-2 sentence description>
- **Key column descriptions:**
  - <model>.<column>: <description>
- **Business context notes:** <columns needing extra context>
- **External documentation:** <wiki, README, or "none">
```

::GATE:: id=data-engineer-deep-phase-5 phase=5 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_engineer/phases_deep/phase-6.md` in full and follow its instructions starting from Deep Phase 6.
