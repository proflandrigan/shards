> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Deep Phase 6 — Documentation Plan

Goal: Every model and non-obvious column gets a description.

Ask about:
- Documentation level? (minimal: model descriptions only; standard: model + key columns;
  thorough: all columns + business context)
- Existing documentation patterns in the project?
- Columns with non-obvious business definitions that need explanation?
- Business metrics or calculated fields that need formal definitions?

### Document Deep Phase 6

```markdown
---

## Deep Phase 6: Documentation Plan (Analytics Engineer)
- **Documentation level:** Minimal | Standard | Thorough
- **Schema file(s) to create/update:**
  - <file path>
- **Model descriptions:**
  - <model>: <1-2 sentence description — what it represents, who consumes it>
- **Key column descriptions:**
  - <model>.<column>: <description — especially for non-obvious columns>
- **Business metric definitions:**
  - <metric_name>: <definition — e.g., "gross_revenue: sum of order amounts before
    refunds, in USD, at time of capture">
  - (or "none — no metrics layer in scope")
- **External documentation:** <wiki, README, or "none">
```

::GATE:: id=analytics-engineer-deep-phase-6 phase=6 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/analytics_engineer/phases_deep/phase-7.md` in full and follow its instructions starting from Deep Phase 7. Do not pre-read further phase files.
