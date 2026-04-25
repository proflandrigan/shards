> **Previous:** This is the first phase of the Data Engineer Deep Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Deep Phase 1 — Requirements

Goal: Understand what the downstream consumer needs.

Ask about:
- Who consumes this data? (analyst, dashboard, ML model, reverse ETL)
- What questions do they need this data to answer?
- What grain do they need? (one row per what?)
- Refresh cadence requirement? (real-time, hourly, daily)
- SLAs or dependencies?
- Net-new or replacing something existing?

### Document Deep Phase 1

```markdown
---

## Deep Phase 1: Requirements (Data Engineer)
- **Consumer(s):** <who uses this data and how>
- **Key questions this data answers:**
  - <question 1>
  - <question 2>
- **Required grain:** <one row per ___>
- **Refresh cadence:** Real-time | Hourly | Daily | Weekly
- **SLA / dependency:** <time constraint or "none">
- **Replaces existing model:** Yes — <which> | No — net new
```

::GATE:: id=data-engineer-deep-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_engineer/phases_deep/phase-2.md` in full and follow its instructions starting from Deep Phase 2.
