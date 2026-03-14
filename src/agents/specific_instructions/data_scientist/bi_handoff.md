# Data Scientist — BI Dashboard Handoff

This file governs the BI Engineer handoff at the end of a Data Scientist study.
A handoff is offered when the user wants a live dashboard built from the study's findings.

---

## Phase 7, Step 7: BI Dashboard Handoff

7. **BI dashboard handoff:**

   Ask: "If you want a live dashboard to track these metrics or findings on an ongoing basis,
   I can write a handoff file for the BI Engineer. Do you want a `bi-engineer-handoff.md`?"

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
   <list charts or plots from the study — chart type, what it shows, data source>

   ## Key Metrics and Data Sources
   - Primary metric(s): <metric list>
   - Dimensions / filters: <dimension list>
   - Data source(s): <table or mart references from Phase 2 or 3>
   - Update frequency needed: <one-off or refresh cadence>

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
