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
- **What needs to be true for this data to be correct?**

Push the acceptance-criteria question hard. Ask the user for concrete conditions,
invariants, or sanity checks that must hold, and how each could be tested — and
steer toward domain-specific criteria, not just generic structural ones. Example
(a pipeline feeding recommender-effectiveness analysis): "every treated user has
≥1 impression", "CTR ∈ [0,1]", "no user appears in both control and treatment",
"row count matches the experiment assignment table". These are the user's
definition of "the pipeline is correct" and become the backbone of the Phase 4
testing strategy.

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
- **Acceptance criteria (what must be true):**
  - <criterion 1 — e.g. one row per user-day, no gaps>
  - <criterion 2 — e.g. CTR ∈ [0,1]>
- **How each will be verified:** <test/query per criterion, or "designed in Phase 4">
```

::GATE:: id=data-engineer-deep-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_engineer/phases_deep/phase-2.md` in full and follow its instructions starting from Deep Phase 2.
