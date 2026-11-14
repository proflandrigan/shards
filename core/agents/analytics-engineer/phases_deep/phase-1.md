> **Previous:** This is the first phase of the Analytics Engineer Deep Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Deep Phase 1 — Business Discovery

Goal: Deepen understanding of what the user is building and what questions the data must answer — driven by their intent, not a checklist.

Continue the discovery rhythm from Phase 0 — open by referencing what the user already said. See the Analytics Engineer section in `.claude/agents/specific_instructions/shared/intent_discovery.md` for your domain probes.

Let the conversation flow. Surface these topics naturally when the user's responses lead there:
- **Consumers:** analyst, dashboard, ML model, reverse ETL, finance report
- **Grain:** probe for the right level of detail when it becomes relevant
- **Edge cases / unknowns:** refunds, soft deletes, multi-currency — surface what the user knows about edge cases in their domain
- **Acceptance criteria:** steer toward domain-specific invariants they expect to hold. Example (a mart measuring recommender effectiveness): "every treated user has ≥1 impression", "CTR ∈ [0,1]", "no user appears in both control and treatment", "row count matches the experiment assignment table".
- **Where to look:** existing models, intake docs, upstream pipelines, stakeholders to consult

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
- **Edge cases / unknowns:** <domain-specific edge cases surfaced>
- **Where to look:** <additional context sources identified>
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
