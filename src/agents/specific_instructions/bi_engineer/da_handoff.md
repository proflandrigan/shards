# BI Engineer — Data Analyst Handoff

This file governs the DA handoff step in Phase 4 (Final Review) for the BI Engineer shard. It contains the full instructions for generating a `da-handoff.md` file at the end of a dashboard project when the downstream consumer is a Data Analyst.

---

**Data Analyst handoff:**

**Conditional default behavior:**

- **If Phase 1 documented `DA intake file source: Data Analyst — ...`:**
  Tell the user: "Phase 1 flagged this as a DA-originated request. Writing a `da-handoff.md` now." Write the file without asking.

- **If the originating request was not from a Data Analyst:**
  Ask the user: "This dashboard is ready. Do you want a `da-handoff.md` so the Data
  Analyst shard can run ad-hoc queries against the same data?"
  **GATE: Wait for an explicit yes or no. Do not generate the file unless the user confirms.**

If writing the file (either automatically or after user confirmation), write `dashboards/<project_name>/da-handoff.md`:

```markdown
# Data Analyst Handoff: <project_name>

## Source Project
- Originating agent: BI Engineer
- Project directory: dashboards/<project_name>/
- Project specs: dashboards/<project_name>/project-specs.md

## Original Analysis Request
- Requesting agent: Data Analyst
- Core question: <from bi-intake.md if available, or from Phase 1>
- BI intake file: <path, or "Not applicable">

## What Was Built
- Dashboard: <dashboard name and description>
- Technology: <Streamlit | Grafana | Dash | etc.>
- Data source(s): <marts/tables used — from Phase 1>
- Key metrics displayed: <from Phase 1>
- Key dimensions available: <from Phase 1>
- Date column: <for date filters and time series>

## For Further Ad-Hoc Analysis
- The same data sources and metrics are available for direct queries
- Key columns:
  - Dimensions: <for GROUP BY and WHERE>
  - Measures: <already available, match dashboard metrics>
  - Date column: <for date filters>
- Queries from original DA analysis: <analysis/<project_name>/queries/ — if available>

## Data Source Details
- Primary data source: <mart/table name>
- Database / schema: <if known>
- Refresh cadence: <from Phase 1>
- Access method: <direct query | dbt metrics layer>

## Caveats and Limitations
- <data quality caveats from Phase 4 review, or "none">
- <freshness caveat, or "none">

## BI Engineer Review Notes
- Data Analyst metric review verdict: <Aligned | Concerns — from Phase 2>
- Analytics Engineer data model review verdict: <Suitable | Concerns — from Phase 2>

## Constraints
- Data availability: Dashboard is built and accessible
- Known limitations: <from Phase 4 or "none">

## Next Step
Run `/data-analyst` or `/shards`. In Phase 0, reference this file:
dashboards/<project_name>/da-handoff.md
```

Tell the user: "Handoff file written. Run `/data-analyst` or `/shards` and
reference `dashboards/<project_name>/da-handoff.md` in Phase 0."
Do NOT attempt to morph into or invoke the Data Analyst.
