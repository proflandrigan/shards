# Analytics Engineer — Data Analyst Handoff

This file governs Step 7 of Phase 8 (Deliver and Document) for the Analytics Engineer shard. It contains the full instructions for generating a `da-handoff.md` file at the end of a mart build project when the downstream consumer is a Data Analyst.

---

7. **Data Analyst handoff:**

   **Conditional default behavior:**

   - **If Phase 1 documented "Downstream consumer: Direct analyst queries (Data Analyst)":**
     Tell the user: "Phase 1 flagged this mart as destined for direct analyst queries. Writing a `da-handoff.md` now." Write the file without asking.

   - **If the downstream consumer was not a Data Analyst:**
     Ask the user: "This mart is built for downstream consumption. Do you want a
     `da-handoff.md` so the Data Analyst shard can run the analysis on top of it?"
     **GATE: Wait for an explicit yes or no. Do not generate the file unless the user confirms.**

   If writing the file (either automatically or after user confirmation), write `models/<project_name>/da-handoff.md`:

   ```
   # Data Analyst Handoff: <project_name>

   ## Source Project
   - Originating agent: Analytics Engineer
   - Project directory: models/<project_name>/
   - Project specs: models/<project_name>/project-specs.md

   ## Original Analysis Request
   - Requesting agent: Data Analyst
   - Core question: <from ae-intake.md if available, or from Phase 1 business questions>
   - Definition of done: <from ae-intake.md if available, or from Phase 1>
   - Filters requested: <from ae-intake.md if available, or "not specified in intake">
   - AE intake file: <path, or "Not applicable">

   ## What Was Built
   - Mart name: <from Phase 4>
   - dbt project: <path or N/A>
   - Grain: <grain statement from Phase 3 — one row per X>
   - Primary key: <PK column(s)>
   - Key columns:
     - Dimensions: <for GROUP BY and WHERE>
     - Measures: <already computed, ready to aggregate>
     - Date column: <for date filters and time series>

   ## Business Questions Answered
   - <question 1>: directly answered | partially answered — <notes> | not answered — <reason>
   - <question 2>: ...

   ## Data Source Details
   - Mart model: <name>
   - Database / schema: <from Phase 3 or build output>
   - Refresh cadence: <from Phase 1>
   - Row count (spot-check): <from Phase 8 validation>
   - Access method: <direct query / dbt metrics layer>

   ## Query Patterns That Will Work
   - <example pattern 1 — not runnable SQL, column name placeholders>
   - <example pattern 2>

   ## Caveats and Limitations
   - <data quality caveats from Phase 8, or "none">
   - <grain caveat, or "none">
   - <freshness caveat, or "none">

   ## Analytics Engineer Mart Review Notes
   - Data Modeller grain validation: <PASS / FAIL — from Phase 8>
   - Data Analyst peer review verdict: <Aligned / Concerns — from Phase 8>
   - Known data quality issues: <from Phase 8, or "none">

   ## Constraints
   - Data availability: Mart is built and accessible
   - Known limitations: <from Phase 8 or "none">

   ## Next Step
   Run `/data-analyst` or `/shards`. In Phase 0, reference this file:
   models/<project_name>/da-handoff.md
   ```

   Tell the user: "Handoff file written. Run `/data-analyst` or `/shards` and
   reference `models/<project_name>/da-handoff.md` in Phase 0."
   Do NOT attempt to morph into or invoke the Data Analyst.
