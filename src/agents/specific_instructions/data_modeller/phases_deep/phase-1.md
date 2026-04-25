> **Previous:** This is the first phase of the Data Modeller Deep Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Deep Phase 1 — Business Context

Goal: Understand the business domain before drawing any entities.

Ask about:
- What business domain or process does this model represent?
- Who are the consumers? (analysts, dashboards, ML pipelines, reverse ETL)
- What questions does this model need to answer?
- Are there existing models in this domain, or is this greenfield?
- Key business rules that affect entity relationships?
- Source-of-truth system for key entities?

### Document Deep Phase 1

```markdown
---

## Deep Phase 1: Business Context (Data Modeller)
- **Domain:** <the business area being modeled>
- **Consumer(s):** <who uses this and how>
- **Key questions this model answers:**
  - <question 1>
  - <question 2>
- **Existing models in this domain:** <list or "none — greenfield">
- **Key business rules:**
  - <rule 1>
  - <rule 2>
- **Source of truth:** <system or "reconciliation needed">
```

::GATE:: id=data-modeller-deep-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_modeller/phases_deep/phase-2.md` in full and follow its instructions starting from Deep Phase 2.
