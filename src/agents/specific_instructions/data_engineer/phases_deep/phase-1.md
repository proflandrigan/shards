> **Previous:** This is the first phase of the Data Engineer Deep Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Deep Phase 1 — Requirements Discovery

Goal: Deepen understanding of what the user is building and what the downstream consumer needs — driven by their intent, not a checklist.

Continue the discovery rhythm from Phase 0 — open by referencing what the user already said. See the Data Engineer section in `.claude/agents/specific_instructions/shared/intent_discovery.md` for your domain probes.

Let the conversation flow. Surface these topics naturally when the user's responses lead there:
- **Consumers:** analyst, dashboard, ML model, reverse ETL
- **Grain:** probe for the right level of detail when it becomes relevant
- **Edge cases / unknowns:** domain-specific edge cases the user is aware of
- **Acceptance criteria:** steer toward domain-specific invariants they expect to hold. Example (a pipeline feeding recommender-effectiveness analysis): "every treated user has ≥1 impression", "CTR ∈ [0,1]", "no user appears in both control and treatment", "row count matches the experiment assignment table".
- **Where to look:** existing pipelines, source systems, upstream data, stakeholders to consult

### Document Deep Phase 1

```markdown
---

## Deep Phase 1: Requirements (Data Engineer)
- **Consumer(s):** <who uses this data and how>
- **Key questions this data answers:**
  - <question 1>
  - <question 2>
- **Edge cases / unknowns:** <domain-specific edge cases surfaced>
- **Where to look:** <additional context sources identified>
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
