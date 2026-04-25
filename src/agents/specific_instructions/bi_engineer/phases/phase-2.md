> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

---

## Phase 2 — Dashboard Design

Goal: Define the charts, layout, and components — then get it reviewed.

**Design decisions to make:**
- How many panels / pages?
- Which chart type for each metric? (bar, line, scatter, heatmap, KPI card, table, etc.)
- Layout: cards at top, charts below? Tabs? Single scrolling page?
- Color palette (or generate one from brand colors provided)
- Loading strategy: all-at-once vs. lazy / paginated
- If Streamlit or Dash: component breakdown (sidebar filters, main area, detail panel)
- If Altair: chart composition and layering approach

**Request Data Analyst review:**

Tell the user: "Getting the Data Analyst to verify I'm visualizing the right metrics. Can't have a beautiful chart tracking the wrong number."

```
Task(
  subagent_type="data-analyst",
  description="Review dashboard metric and analysis design for [project]",
  prompt="I am the BI Engineer shard designing a dashboard for [topic].
  Here is my dashboard design plan:
  [include panel descriptions, chart types, and metrics to be displayed]
  Please review: Are these the right metrics for the question being answered?
  Are there obvious gaps or better measures? Any concerns about how the data
  is being aggregated or displayed? Keep the review brief and focused."
)
```

**Request Analytics Engineer review:**

Tell the user: "Pulling in the Analytics Engineer to confirm these marts exist and are actually correct. No point building a dashboard on broken data."

```
Task(
  subagent_type="analytics-engineer",
  description="Review data model correctness for dashboard [project]",
  prompt="I am the BI Engineer shard designing a dashboard for [topic].
  Here is my dashboard design and the data sources I plan to use:
  [include panel descriptions, chart types, and tables/marts to be queried]
  Please review: Are these marts the right ones to use for this purpose?
  Are there grain, definition, or data quality concerns I should know about?
  Do these marts have the necessary columns and aggregations for this design?
  Keep the review brief and actionable."
)
```

Present both the Data Analyst's and Analytics Engineer's findings to the user.
Address any concerns raised before finalizing the design.

### Document Phase 2

```markdown
---

## Phase 2: Dashboard Design (BI Engineer)
- **Panels / pages:**
  1. <panel name>: <description — chart types, metrics, layout>
  2. <panel name>: <description>
  3. <if applicable>
- **Chart types chosen:**
  - <metric>: <chart type> — <rationale>
  - <metric>: <chart type> — <rationale>
- **Layout:** <description of overall structure>
- **Color palette:** <colors or scheme>
- **Loading strategy:** <all-at-once | lazy | paginated>
- **Component breakdown:** <sidebar | main area | detail panel | tabs — brief description>
- **Data Analyst review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary of metric/analysis review>
  - Issues addressed: <how concerns were resolved, or "none raised">
- **Analytics Engineer review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary of data model review>
  - Issues addressed: <how concerns were resolved, or "none raised">
```

::GATE:: id=bi-engineer-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/bi_engineer/phases/phase-3.md` in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
