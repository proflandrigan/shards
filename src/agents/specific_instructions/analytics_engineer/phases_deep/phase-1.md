> **Previous:** This is the first phase of the Analytics Engineer Deep Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Deep Phase 1 — Business Requirements

Goal: Understand who consumes this data and what questions it must answer.

Ask about:
- Who consumes this mart or pipeline? (analyst, dashboard, ML model, reverse ETL, finance report)
- What specific business questions does this need to answer?
- What grain do they need? (one row per what?)
- Refresh cadence? (real-time, hourly, daily, weekly)
- SLA or dependency constraints?
- Net-new or replacing something existing? If replacing, what are the differences?
- Any known edge cases or business rules that affect the data? (refunds, soft deletes, multi-currency)
- **Will this mart feed a dashboard or BI tool?** (This affects how I'll design aggregations and dimensions.)
- **What needs to be true for this data to be correct?**

Always ask the grain question directly: "What should one row in this mart represent?"

Push the acceptance-criteria question hard. Ask the user for concrete conditions,
invariants, or sanity checks that must hold, and how each could be tested — and
steer toward domain-specific criteria, not just generic structural ones. Example
(a mart measuring recommender effectiveness): "every treated user has ≥1
impression", "CTR ∈ [0,1]", "no user appears in both control and treatment", "row
count matches the experiment assignment table". These are the user's definition of
"the mart is correct" and become the backbone of the Phase 5 testing strategy.

**If the downstream consumer is a BI dashboard:** Note in Phase 4 (Model Layer Architecture) that aggregations and the date spine should be designed with dashboard query patterns in mind — pre-aggregated at the mart level where possible, date dimension at the right granularity for time-series charts, and dimension columns kept at manageable cardinality for filter dropdowns.

**If the user references an `ae-intake.md` file:** Read that file. Check the
`Originating agent` field to determine the source:

- **If originating agent is "BI Engineer":** Pre-populate Phase 1 business
  requirements — grain, downstream consumer, business questions, required
  measures and dimensions, date spine, and refresh cadence. Set
  `Downstream consumer: Dashboard (BI Engineer)`. Confirm pre-populated
  values with the user before proceeding.

- **If originating agent is "Data Analyst":** Pre-populate Phase 1 business
  requirements — grain, business questions the mart must answer, required
  measures, required dimensions, date spine, and update frequency. Set
  `Downstream consumer: Direct analyst queries (Data Analyst)`. Also
  populate analysis context fields (core question, filters, definition of
  done) from the intake file. Confirm pre-populated values with the user
  before proceeding. Do not re-ask questions already answered in the intake file.

In both cases: if a required field is missing or unclear, ask only about
the missing field — not the whole set.

### Document Deep Phase 1

```markdown
---

## Deep Phase 1: Business Requirements (Analytics Engineer)
- **Consumer(s):** <who uses this and how>
- **Downstream consumer:** Dashboard (BI Engineer) | ML feature store | Finance report | Direct analyst queries (Data Analyst) | Other: <describe>
- **Intake file source:** Not applicable | BI Engineer — dashboards/<project_name>/ae-intake.md | Data Analyst — analysis/<project_name>/ae-intake.md
- **Analysis context (DA intake only):** <core question from DA intake, or "N/A">
- **Business questions this mart answers:**
  - <question 1>
  - <question 2>
- **Required grain:** <one row per ___>
- **Refresh cadence:** Real-time | Hourly | Daily | Weekly
- **SLA / dependency:** <time constraint or "none">
- **Replaces existing model:** Yes — <which> | No — net new
- **Key business rules:**
  - <rule 1: e.g., refunds reduce gross revenue>
  - <rule 2>
- **Acceptance criteria (what must be true):**
  - <criterion 1 — e.g. one row per user-day, no gaps>
  - <criterion 2 — e.g. CTR ∈ [0,1]>
- **How each will be verified:** <test/query per criterion, or "designed in Phase 5">
```

::GATE:: id=analytics-engineer-deep-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/analytics_engineer/phases_deep/phase-2.md` in full and follow its instructions starting from Deep Phase 2. Do not pre-read further phase files.
