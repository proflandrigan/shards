# Data Scientist — BI Dashboard Handoff

This file governs two BI Engineer touchpoints in the Data Scientist shard:
1. **Phase 5 flag** — consult the BI Engineer on chart design when visualizations are part of the deliverable.
2. **Phase 7, Step 7** — generate a `bi-engineer-handoff.md` to productionize recurring visualizations as a live dashboard.

---

## Phase 5: BI Engineer Flag (Visualization Deliverables)

**BI Engineer flag (visualization deliverables):**
If the agreed output format includes charts, plots, or any visual deliverable
in the notebook or report, consult the BI Engineer before execution:

Tell the user: "The deliverables include visualizations — consulting the BI Engineer on chart design. Won't take long."

```
Task(
  subagent_type="bi-engineer",
  description="Visualization design review for [study]",
  prompt="I am the Data Scientist shard working on study [name].
  The study deliverables include the following visualizations:
  [describe each chart or plot: what it shows, intended chart type, axes, purpose]
  Please review: Are these the right chart types for this analysis? Any design,
  color, or layout recommendations? I need brief, actionable guidance only."
)
```

Present the BI Engineer's feedback to the user before finalizing the output plan.

---

## Phase 7, Step 7: BI Dashboard Handoff (Recurring Visualizations)

7. **BI dashboard handoff (recurring visualizations):**

   Check Phase 5 of project-specs.md. If `BI Engineer review (if applicable)` shows
   "Not applicable" or "N/A", skip this step.

   Otherwise, ask: "The study included visualizations reviewed by the BI Engineer shard.
   If these need to be a live dashboard — rather than notebook-embedded charts — I can
   write a handoff file for the BI Engineer. Do you want a `bi-engineer-handoff.md`?"

   **GATE: Wait for an explicit yes or no. Do not generate the file unless the user confirms.**

   If yes, write `studies/<project_name>/bi-engineer-handoff.md`:

   ```
   # BI Engineer Handoff: <project_name>

   ## Source Study
   - Originating agent: Data Scientist
   - Study directory: studies/<project_name>/
   - Study specs: studies/<project_name>/project-specs.md
   - Study report: studies/<project_name>/report.md

   ## What Was Built
   - Study objective: <business question from Phase 1>
   - Analysis type: <task type from Phase 4> — <one-line summary>
   - Key findings: <top 2-3 findings in plain language from Phase 7>

   ## Dashboarding Objective
   - Purpose: Productionize recurring visualizations from this study as a live dashboard
   - Intended audience: <audience from Phase 1>
   - Dashboard type: Recurring reporting dashboard / exploratory analytics view

   ## Visualizations to Productionize
   <chart list from Phase 5 BI Engineer review — chart type, what it shows, data source>

   ## Key Metrics and Data Sources
   - Primary metric(s): <metric list>
   - Dimensions / filters: <dimension list>
   - Data source(s): <table or mart references from Phase 2 or 3>
   - Update frequency needed: <one-off or refresh cadence>

   ## BI Engineer Design Review (from Phase 5)
   <paste BI Engineer review verdict and notes from Phase 5 specs>

   ## Tool Recommendation
   - <Streamlit / Dash / Altair / Superset> — <one-sentence rationale>
   - No preference? Let the BI Engineer recommend during Phase 0.

   ## Constraints
   - Data availability: <exists and accessible / design only>

   ## Next Step
   Run `/bi-engineer` or `/shards`. In Phase 0, reference this file:
   studies/<project_name>/bi-engineer-handoff.md
   ```

   Tell the user: "Handoff file written. Run `/bi-engineer` or `/shards` and
   reference `studies/<project_name>/bi-engineer-handoff.md` in Phase 0."
   Do NOT attempt to morph into or invoke the BI Engineer.
