# Analytics Engineer — BI Dashboard Handoff

This file governs Step 6 of Phase 8 (Deliver and Document) for the Analytics Engineer shard. It contains the full instructions for generating a `bi_engineer_handoff.md` file at the end of a mart build project.

---

6. **BI dashboard handoff:**

   **Conditional default behavior:**

   - **If Phase 1 documented "Downstream consumer: Dashboard (BI Engineer)":**
     Tell the user: "Phase 1 flagged this mart as destined for a BI dashboard. Writing a `bi_engineer_handoff.md` now." Write the file without asking.

   - **If the downstream consumer was not a BI dashboard:**
     Ask the user: "This mart is built for downstream consumption. Do you want a
     `bi_engineer_handoff.md` so the BI Engineer shard can build a dashboard on
     top of it?"
     ::GATE:: id=specific-instructions-analytics-engineer-bi-engineer-handoff-phase0 phase=0 kind=phase
Wait for an explicit yes or no. Do not generate the file unless the user confirms.
::ENDGATE::

   If writing the file (either automatically or after user confirmation), write `data_models/<project_name>/bi_engineer_handoff.md`:

   ```
   # BI Engineer Handoff: <project_name>

   ## Source Project
   - Originating agent: Analytics Engineer
   - Project directory: data_models/<project_name>/
   - Project specs: data_models/<project_name>/project-specs.md

   ## What Was Built
   - Mart name: <final mart model name from Phase 4>
   - Grain: <grain statement from Phase 3 — one row per X>
   - dbt project: <dbt project path or N/A>
   - Key columns: <primary key, main dimensions, main measures — from Phase 4>
   - Business questions answered: <from Phase 1>

   ## Dashboarding Objective
   - Purpose: Build a reporting / analytics dashboard on top of this mart
   - Intended audience: <consumer from Phase 1>
   - Dashboard type: Reporting dashboard / self-serve analytics

   ## Key Metrics and Dimensions Available
   - Measures: <measure columns from Phase 4 model design>
   - Dimensions: <dimension columns from Phase 4>
   - Date spine: <date column and grain for time-series charts>
   - Filters: <high-cardinality columns suitable for filters>

   ## Data Source Details
   - Mart model: <mart model name>
   - Database / schema: <from Phase 3 or Phase 7 build output>
   - Refresh cadence: <from Phase 1 freshness requirement>
   - Row count (spot-check): <from Phase 8 validation>
   - Access method: <direct query / dbt metrics layer / BI tool connection>

   ## Analytics Engineer Mart Review Notes
   - Data Analyst verdict: <Aligned / Concerns — summary from Phase 8>
   - Data Modeller grain validation: <PASS / FAIL — details from Phase 8>
   - BI Engineer mart-usability verdict: <Suitable / Concerns / Redesign — summary from Phase 8, or "Not reviewed">

   ## Tool Recommendation
   - <Streamlit / Dash / Superset / Metabase> — <one-sentence rationale>
   - No preference? Let the BI Engineer recommend during Phase 0.

   ## Suggested KPIs for the Dashboard
   - Primary metric(s) this mart is designed to surface: <from Phase 1 business questions>
   - Secondary metrics available: <measure columns that have clear business meaning>
   - Recommended starting panels: <e.g., "trend over time for X, breakdown by Y">

   ## Performance Characteristics
   - Approximate row count: <from Phase 8 spot-check>
   - Expected query pattern: Aggregated at mart level | Requires GROUP BY in dashboard queries
   - Index / partition key: <date column and pk column — confirms fast filtering>

   ## Known Limitations for Dashboarding
   - <data quality caveats from Phase 8 peer reviews, or "none">
   - <freshness delays that affect dashboard accuracy, or "none">

   ## Constraints
   - Data availability: Mart is built and accessible
   - Known limitations: <from Phase 8 known limitations or "none">

   ## Next Step
   Run `/bi-engineer` or `/shards`. In Phase 0, reference this file:
   data_models/<project_name>/bi_engineer_handoff.md
   ```

   Tell the user: "Handoff file written. Run `/bi-engineer` or `/shards` and
   reference `data_models/<project_name>/bi_engineer_handoff.md` in Phase 0."
   Do NOT attempt to morph into or invoke the BI Engineer.
