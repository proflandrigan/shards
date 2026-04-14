# Analytics Engineer — Deep Track

Deep Track (Phases 1-8) for the Analytics Engineer.
Phase 0 (Triage) is already complete. Follow every phase, gate, and documentation rule below.

---

Complete phases in order. Do not skip.

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

Always ask the grain question directly: "What should one row in this mart represent?"

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
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 2 — Source and Staging Assessment

Goal: Understand what staging models exist, what's missing, and whether the
upstream data is sound enough to build on.

Ask about:
- Which source systems are involved?
- Are staging models already defined? (stg_ prefix)
- Known data quality issues upstream?
- Existing intermediate models relevant to this work?
- Incremental strategies already in use?

Inspect the transformation project:
- Glob: `**/*.sql` filtered to staging and intermediate paths; look for project config files
- Grep for existing source reference calls to find defined sources
- Check for source definition files (e.g., `sources.yml` or equivalent) for freshness configs

**Consult Data Engineer as the first step of source assessment:**

Tell the user: "Let me check with the Data Engineer shard on the staging layer before we design anything on top of it."

```
Task(
  subagent_type="data-engineer",
  description="Staging layer assessment for [project]",
  prompt="I am the Analytics Engineer shard working on [project]. I need to assess
  the staging layer before designing a transformation pipeline. Please explore and
  return:
  1. Which staging models exist for [source systems / entities]? List model names
     and grain (one row per what).
  2. Are there existing intermediate models I can reuse or build on?
  3. Are source definitions present in sources.yml? Are freshness configs defined?
  4. Any known data quality issues I should factor into my transformation design?
     (late-arriving data, duplicates, schema drift, soft deletes)
  5. What incremental strategies are already in use? Any patterns I should follow
     for consistency?

  Keep your response focused on source layer soundness and staging model inventory —
  not the transformation logic I should build."
)
```

**Greenfield handling:** Before proceeding, check whether the Data Engineer's
response contains "NO DATA ENVIRONMENT DETECTED".

If it does:
1. Present the Data Engineer's response to the user.
2. Ask:
   "The Data Engineer found no existing staging models, source definitions, or
   dbt project files. For transformation work, I need to know what we're building on:
   - (a) Staged data exists — tell me the source system and whether it's already
     modeled in staging. I'll design the transformation layer from there.
   - (b) Raw data exists but no staging models yet — I'll need to flag that staging
     models are a prerequisite. I can design them alongside the transformation layer,
     but the Data Engineer should own the staging work.
   - (c) No data exists yet — I can do contract-first design: define expected staging
     models, intermediate shells, and mart stubs ready for when data arrives.
     Nothing will run until staging data exists.
   Which situation are we in?"
3. Wait for the user's response before proceeding.
   - (a): proceed with provided source info.
   - (b): note that staging is a prerequisite; scope includes staging design but
     implementation should be reviewed by Data Engineer.
   - (c): set Data sufficiency: `Insufficient`, proceed as contract-first design.
     All models will be flagged [THEORETICAL — UNTESTED].

### Document Deep Phase 2

```markdown
---

## Deep Phase 2: Source and Staging Assessment (Analytics Engineer)
- **Source system(s):**
  - <source>: <description, relevant tables or models>
- **Existing staging models:**
  - <stg_model> (<grain>): <brief description>
  - (or "none found")
- **Existing intermediate models relevant to this work:**
  - <int_model>: <what it contains>
  - (or "none")
- **Source definitions:** Present | Missing — <details>
- **Freshness configs:** Defined | Missing — <details>
- **Known data quality issues:**
  - <issue or "none identified">
- **Incremental patterns in use:** <pattern or "none — full refresh only">
- **Data Engineer consultation:** <summary of findings>
- **Data sufficiency:** Sufficient | Partial | Insufficient
- **Decision:** Proceed | Proceed with caveats | Blocked — <rationale>
- **Data environment:** <not greenfield | Staging exists, transform layer missing | GREENFIELD — no transformation layer detected. Contract-first design only>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**
**If Insufficient, do not proceed. Discuss alternatives.**

---

## Deep Phase 3 — Grain and Entity Design

Goal: Define the grain of every model in the planned DAG, and validate entity
relationships before writing a single CTE.

"What does one row represent?" must be answered for every model before Phase 4.

Ask about:
- Confirmed grain for the target mart (from Phase 1 — verify it's still right)
- Grain for each intermediate model needed
- Many-to-many relationships that need bridge models?
- Fan-out risks from any planned joins?
- Conformed dimensions already in use elsewhere?

**Consult Data Modeller for grain confirmation and entity design:**

Tell the user: "Pulling in the Data Modeller — I need grain and entity validation before I commit to a model design."

```
Task(
  subagent_type="data-modeller",
  description="Grain and entity validation for [project] transformation design",
  prompt="I am the Analytics Engineer shard designing a transformation pipeline
  for [project]. I've identified the following planned models with their intended
  grains:

  [list each planned model with intended grain statement]

  Business requirements context:
  - Consumer(s): [from Phase 1]
  - Key business questions: [from Phase 1]
  - Required mart grain: [from Phase 1]
  - Source staging models: [from Phase 2]

  Please review and return:
  1. Is the proposed grain correct for each model? Are there grain violations I
     haven't anticipated?
  2. Are there many-to-many relationship risks in the planned joins that could
     cause fan-out? Which joins are highest risk?
  3. Are there conformed dimensions already in the project I should use instead
     of defining new ones?
  4. Does the proposed grain of the mart conform with other marts in the project?
     Any conformance conflicts?
  5. Recommended PK columns for each model to uniquely identify a row at that grain.

  Keep your response focused on grain correctness, M:M risks, entity conformance,
  and PK recommendations — not the physical SQL design."
)
```

Apply the Reviewer Verdict Protocol using the returned verdict (Sound / Concerns / Revise). Document the verdict and any resolution in the specs template below.

### Document Deep Phase 3

```markdown
---

## Deep Phase 3: Grain and Entity Design (Analytics Engineer)
- **Confirmed model grains:**
  | Model | Layer | Grain Statement | PK Column(s) |
  |-------|-------|-----------------|--------------|
  | <model> | staging | one row per <source_event_id> | <source_event_id> |
  | <model> | intermediate | one row per <entity> per <period> | <surrogate_key> |
  | <model> | mart | one row per <entity> | <entity_id> |
- **Many-to-many relationship risks identified:**
  - <risk or "none">
- **Conformed dimensions in use:**
  - <dimension model>: <shared across which marts>
  - (or "none — new grain only")
- **Data Modeller consultation:**
  - Verdict: Sound | Concerns | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Grain assessment: <summary>
  - Fan-out risks flagged: <list or "none">
  - Conformance notes: <list or "none">
  - **Grain design revised:** Yes / No — <if yes, what changed>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 4 — Model Layer Architecture

Goal: Design the full DAG — every model, its layer, materialization, incremental
config, and key joins. No SQL yet, but the design is complete and confirmed.

Present as a text DAG in chat:
```
[source: system_a] → [stg_a_entities] → [int_a_enriched]
                                                 ↓
[source: system_b] → [stg_b_events]  → [int_ab_joined] → [fct_target_mart]
```

**If UI-Aware Mode is active**, also push the DAG as an interactive Mermaid diagram to the browser. Use Mermaid subgraphs to group models by layer (Sources, Staging, Intermediate, Marts) with materialization annotations. Use a stable `--panel-id` (e.g., `dag-<project_name>`) so the DAG can be updated in place during Phase 7:
```bash
node .shards/ui/ui-push.js dag \
  --title "DAG: <project_name>" \
  --agent "analytics-engineer" \
  --panel-id "dag-<project_name>" \
  --data '<mermaid_syntax_string>'
```

For each model: model name, layer, grain (confirmed in Phase 3), materialization
strategy, incremental config if applicable, key columns, key joins.

Ask about:
- Existing naming conventions to follow?
- Materialization preferences? (views for staging, tables/incremental for marts)
- Historical backfill needed?
- Macros to create or reuse?

Materialization guidance (state your reasoning, not just the choice):
- Staging: view (lightweight, always fresh, no storage cost)
- Intermediate: view unless large or expensive to compute — then table
- Mart: table or incremental; incremental when >10M rows or expensive recomputation
- Snapshots for SCD Type 2

### Document Deep Phase 4

```markdown
---

## Deep Phase 4: Model Layer Architecture (Analytics Engineer)
- **DAG:**
  ```
  <text DAG diagram>
  ```
- **Models to create/modify:**
  | Model | Layer | Grain | Materialization | New/Modified | File Path |
  |-------|-------|-------|-----------------|--------------|-----------|
  | <name> | staging | one per <x> | view | New | models/staging/<name>.sql |
  | <name> | intermediate | one per <x> per <y> | view | New | models/intermediate/<name>.sql |
  | <name> | marts | one per <x> | table | New | models/marts/<name>.sql |
- **Incremental strategy (if applicable):**
  - Model: <name>
  - Unique key: <column(s)>
  - Strategy: append | delete+insert | merge
  - On schema change: append_new_columns | fail | sync_all_columns
- **Key joins:**
  - <model A> JOIN <model B> on <key>: <cardinality — 1:M, 1:1>
- **Macros to create or reuse:**
  - <macro_name>: <purpose or "none">
- **Backfill approach:** full refresh | date-bounded — <details> | N/A
- **Naming conventions confirmed:** Yes | No — <deviations from project standard>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 5 — Testing Strategy

Goal: Define comprehensive test coverage for every model. No model ships untested.

"An untested mart is a rumor, not a fact."

For each model: schema tests (unique, not_null, accepted_values, relationships),
singular tests, source freshness configs.

Rules — non-negotiable:
- Every PK gets `unique` + `not_null`. Every single one. No exceptions.
- Every FK gets `not_null` and a `relationships` test where the referenced model exists.
- Source freshness configs for every source definition used.
- Accepted values tests for low-cardinality categorical columns.

Ask about:
- Business rules to encode as singular tests?
- Accepted value ranges or enums for specific columns?
- Row count or anomaly thresholds to monitor?
- Severity levels — which failures should warn vs. error?

### Document Deep Phase 5

```markdown
---

## Deep Phase 5: Testing Strategy (Analytics Engineer)
- **Schema tests:**
  | Model | Column | Test | Severity |
  |-------|--------|------|----------|
  | <model> | <pk_col> | unique | error |
  | <model> | <pk_col> | not_null | error |
  | <model> | <fk_col> | not_null | error |
  | <model> | <fk_col> | relationships(to=ref('<parent>'), field='<col>') | warn |
  | <model> | <enum_col> | accepted_values(values=[...]) | warn |
- **Singular tests:**
  - <test_name>: <assertion, reason, and file path>
  - (or "none required")
- **Source freshness:**
  - <source_name>.<table>: warn_after <N> hours, error_after <N> hours
- **Row count / anomaly monitoring:** <approach or "not required at this stage">
- **Test coverage:** Full | Partial — <gaps and rationale>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 6 — Documentation Plan

Goal: Every model and non-obvious column gets a description.

Ask about:
- Documentation level? (minimal: model descriptions only; standard: model + key columns;
  thorough: all columns + business context)
- Existing documentation patterns in the project?
- Columns with non-obvious business definitions that need explanation?
- Business metrics or calculated fields that need formal definitions?

### Document Deep Phase 6

```markdown
---

## Deep Phase 6: Documentation Plan (Analytics Engineer)
- **Documentation level:** Minimal | Standard | Thorough
- **Schema file(s) to create/update:**
  - <file path>
- **Model descriptions:**
  - <model>: <1-2 sentence description — what it represents, who consumes it>
- **Key column descriptions:**
  - <model>.<column>: <description — especially for non-obvious columns>
- **Business metric definitions:**
  - <metric_name>: <definition — e.g., "gross_revenue: sum of order amounts before
    refunds, in USD, at time of capture">
  - (or "none — no metrics layer in scope")
- **External documentation:** <wiki, README, or "none">
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 7 — Build

**Context checkpoint:** Before building, prompt the user:

"Planning's confirmed — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

Build in this order:
1. Source definitions (sources.yml updates)
2. Staging models
3. Intermediate models
4. Mart models
5. Snapshot models (if SCD Type 2)
6. Schema files with tests and documentation
7. Singular test files

For each model:
- **Join path trace (models with joins):** Before writing SQL for any model that
  joins tables, trace the join path following
  `.claude/agents/specific_instructions/shared/join_path_protocol.md`. Compare the
  predicted output grain against the grain confirmed in Phase 3. If they diverge,
  fix the design before writing SQL.
- Write the SQL (CTEs from source to final; use parameterized model references — never hardcoded table names)
- Write the schema file (model description, column descriptions, all required tests)
- Run the stack's build/validate command (e.g., `dbt build --select +model_name`) — fix any failures before next model
- Do not advance to the next model until the current one is green
- **If UI-Aware Mode is active**: after each model passes validation, re-push the DAG with the completed model highlighted. Use the same `--panel-id` from Phase 4 (e.g., `dag-<project_name>`) so it updates in place. Apply a Mermaid `style` to mark green models (e.g., `style stg_orders fill:#1a3a1a,stroke:#2a6a2a,color:#60a060`)
- **Post-build validation (per model, after `dbt build` passes):** Run the
  applicable checks below using `dbt show` or the warehouse CLI. If any check
  fails, halt and diagnose before advancing to the next model. In a contract-first
  / no-data environment (Phase 2 Data sufficiency: Insufficient), skip validation
  queries and note "THEORETICAL — no data to validate" in the build log.

  1. **Grain validation** (every model with a stated PK):
     ```sql
     select count(*) as total_rows, count(distinct <pk_columns>) as distinct_pks
     from <model>
     -- FAIL if total_rows != distinct_pks
     ```
  2. **Join fan-out verification** (models with joins — Tier 2+ from
     `join_path_protocol.md`):
     ```sql
     select 'before_join' as stage, count(*) as row_count from <left_model>
     union all
     select 'after_join', count(*)
     from <left_model> join <right_model> on <join_condition>
     -- FAIL if after > before and diverges from predicted fan-out in Phase 3
     ```
  3. **PK/FK null check** (mart and fact models):
     ```sql
     select '<column>' as col, count(*) as total,
       count(<column>) as non_null,
       round(100.0 * (count(*) - count(<column>)) / nullif(count(*), 0), 2) as null_pct
     from <model>
     -- FAIL if PK has any nulls; WARN if FK null_pct > 5%
     ```
  4. **Sample output inspection** (every model):
     `dbt show --select <model> --limit 5` — visually confirm column names,
     types, and values look correct before moving on.

  Scale to model importance: staging models need only grain + sample; intermediate
  models add fan-out checks if they contain joins; mart/fact models get the full
  suite.

**SQL template for staging model** (adapt reference syntax to your stack):
```sql
with source as (
    select * from <source_ref('schema', 'table')>
    -- e.g., {{ source('schema', 'table') }} in dbt
),

renamed as (
    select
        -- primary key
        <source_pk_col>     as <entity_id>,

        -- attributes
        <col_a>             as <standardized_name>,
        <col_b>::<type>     as <standardized_name>,

        -- metadata
        _loaded_at
    from source
)

select * from renamed
```

**SQL template for intermediate model** (adapt reference syntax to your stack):
```sql
with <left_model> as (
    select * from <model_ref('stg_or_int_model')>
    -- e.g., {{ ref('model') }} in dbt
),

<right_model> as (
    select * from <model_ref('stg_or_int_model')>
),

joined as (
    select
        -- grain: one row per <statement>
        <surrogate_key(col_a, col_b)> as <model>_id,
        -- e.g., {{ dbt_utils.generate_surrogate_key(['col_a', 'col_b']) }} in dbt

        -- dimensions
        l.<col>,
        r.<col>,

        -- measures
        l.<measure_col>
    from <left_model> as l
    left join <right_model> as r
        on l.<join_key> = r.<join_key>
),

final as (
    select * from joined
)

select * from final
```

**SQL template for mart model** (adapt reference syntax to your stack):
```sql
with <source_model> as (
    select * from <model_ref('int_model')>
),

<dimension_model> as (
    select * from <model_ref('dim_model')>
),

-- <add any other CTEs needed>

final as (
    select
        -- grain: one row per <statement>
        <surrogate_key(col_a, col_b)> as <mart>_id,

        -- dimensions
        s.<dim_col>,
        d.<dim_col>,

        -- measures
        s.<measure_col>,

        -- metadata
        current_timestamp as _updated_at
    from <source_model> as s
    left join <dimension_model> as d
        on s.<fk_col> = d.<pk_col>
)

select * from final
```

### Document Deep Phase 7

```markdown
---

## Deep Phase 7: Build Log (Analytics Engineer)
- **Files created:**
  - <file path>: <description>
- **Files modified:**
  - <file path>: <what changed>
- **Build validation:**
  - Build result: Pass | Fail — <details>
  - Tests passing: <N> / <N>
- **Post-build validation:**
  | Model | Grain Check | Fan-Out Check | PK/FK Nulls | Sample OK | Notes |
  |-------|-------------|---------------|-------------|-----------|-------|
  | <model> | PASS / FAIL | PASS / FAIL / N/A | PASS / WARN / FAIL | Yes / No | <details or "clean"> |
  - (or "THEORETICAL — no data to validate" if contract-first design)
- **Deviations from design:** <changes from Phases 4-6 and why, or "none">
- **Performance notes:** <run time, row counts, anything notable>
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Deep Phase 8 — Peer Review and Handoff

**Before finalizing**, invoke peer reviews in parallel, then Syn for sign-off.

**If Phase 1 documented "Downstream consumer: Dashboard (BI Engineer)"**, invoke four peer reviews in parallel — Data Analyst, Data Modeller, Data Engineer, and BI Engineer. Otherwise, invoke three (Data Analyst, Data Modeller, Data Engineer).

Tell the user: "Sending this out for peer review before we call it done. Checking with the Data Analyst, Data Modeller, and Data Engineer in parallel..." (add "and BI Engineer" if applicable).

Invoke all applicable reviews in parallel:

```
Task(
  subagent_type="data-analyst",
  description="Business requirements review for [project] mart",
  prompt="I am the Analytics Engineer shard. I've built the [mart_name] mart for
  project [project_name]. The project-specs.md is at [file_path].

  Please review and return:
  1. Does the mart answer the business questions stated in Phase 1? List each
     question and whether the mart supports it.
  2. Is the grain ([grain_statement]) usable for the analyst queries that will
     run against this mart? Is the grain too fine, too coarse, or correct?
  3. Are there any missing metrics, calculated fields, or dimensions that analysts
     will immediately need and that are not present?
  4. Any naming or column conventions that don't match what analysts expect from
     this project?

  Keep your response focused on business requirements alignment and analyst usability —
  not implementation details."
)
```

```
Task(
  subagent_type="data-modeller",
  description="Grain and entity conformance review for [project] mart",
  prompt="I am the Analytics Engineer shard. I've built the [mart_name] mart for
  project [project_name]. The project-specs.md is at [file_path].

  Please review and return:
  REVIEW mode — run the full validation suite:
  1. Does the implemented mart match the designed grain from Phase 3?
     Run a PK uniqueness check on [pk_column] in [mart_model].
  2. Do the FK relationships hold? Run null checks on [fk_columns].
  3. Are there any join fan-out issues? Check [specific joins flagged in Phase 3].
  4. Does the mart conform with other marts in the project? Are there
     entity conformance issues?

  Return in the standard Data Model Review format."
)
```

```
Task(
  subagent_type="data-engineer",
  description="Staging and infrastructure review for [project] mart",
  prompt="I am the Analytics Engineer shard. I've built the [mart_name] mart for
  project [project_name]. The project-specs.md is at [file_path].

  Please review and return:
  1. Are the staging models used by this mart correctly defined? Are there any
     staging layer issues I've inherited?
  2. Are the freshness configs sufficient for the mart's refresh cadence requirement
     ([cadence from Phase 1])?
  3. Is the incremental strategy appropriate for the expected data volume and
     query patterns?
  4. Any pipeline concerns I should flag to the user before we ship this?

  Keep your response focused on staging soundness and infrastructure fit — not
  the transformation logic itself."
)
```

**BI Engineer mart-usability review (only if Phase 1 downstream consumer is "Dashboard (BI Engineer)"):**

```
Task(
  subagent_type="bi-engineer",
  description="Mart usability review for dashboard consumption — [project]",
  prompt="I am the Analytics Engineer shard. I've built [mart_name] for project [project_name].
  Grain: [grain statement from Phase 3].
  Key columns: [column list from Phase 4 model design].
  Business questions it answers: [from Phase 1].
  Dashboard consumer: [from Phase 1].

  Please review from a dashboard design perspective:
  1. Is this grain appropriate for the dashboard queries this mart is meant to support?
  2. Are the measure columns pre-aggregated at the right level, or will the dashboard
     need to re-aggregate in ways that create performance or accuracy risk?
  3. Is there a date dimension / date spine suitable for time-series charts?
  4. Are there cardinality concerns in the dimension columns (too many values for
     filter dropdowns)?
  5. Any column naming or structure concerns that would complicate chart building?

  Keep the review brief and actionable. Return verdict: Suitable | Concerns | Redesign."
)
```

Apply the Reviewer Verdict Protocol for each reviewer independently using their returned verdicts. For the Data Analyst: Aligned / Concerns raised. For the Data Modeller: Sound / Concerns / Revise. For the Data Engineer: Sound / Concerns. For the BI Engineer (if invoked): Suitable / Concerns / Redesign. Document all verdicts and any resolutions in the specs template below. Address all Halt-tier verdicts before invoking Syn.

**Then invoke Syn for final sign-off:**

Tell the user: "I'm asking Syn to review the full project specs before we ship this..."

```
Task(
  subagent_type="syn",
  description="Final review of analytics engineering specs",
  prompt="I am the Analytics Engineer shard. I've completed all phases for project
  [project_name]. Please review the project-specs.md at [file_path] and provide
  your final review verdict. Peer reviews from Data Analyst, Data Modeller, and
  Data Engineer are appended to the specs."
)
```

Append Syn's review to specs. Present to user.

If Syn's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "Syn spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="syn",
  description="Code review for analytics engineering project",
  prompt="CODE REVIEW MODE. I am the Analytics Engineer shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced in
  this project. The project-specs.md is at [file_path] for context."
)
```

Append Syn's code review summary to the specs. Present findings to user.

Then:
1. Run the full DAG using the stack's build command
2. Spot-check final mart output (row count, spot-check key metrics)
3. Summarize in 3-5 bullet points
4. List all files created/modified
5. Flag limitations and follow-ups

6. **BI dashboard handoff:** See `.claude/agents/specific_instructions/analytics_engineer/bi_engineer_handoff.md` for the full handoff instructions. Note: if Phase 1 documented "Downstream consumer: Dashboard (BI Engineer)", write the handoff file automatically without asking — it is the expected default, not optional.

7. **Data Analyst handoff:** See `.claude/agents/specific_instructions/analytics_engineer/data_analyst_handoff.md` for the full handoff instructions. Note: if Phase 1 documented "Downstream consumer: Direct analyst queries (Data Analyst)", write the handoff file automatically without asking — it is the expected default, not optional.

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Deep Phase 8

```markdown
---

## Deep Phase 8: Peer Review and Handoff (Analytics Engineer)
- **Data Analyst review:** <summary of findings>
  - Verdict: Aligned | Concerns raised
  - Tier: Proceed | Proceed with caveats
  - Business requirements met: Yes | Partially | No — <gaps>
  - Grain usability: Correct | Too fine | Too coarse — <notes>
  - Missing elements: <list or "none">
  - Reviewer resolution: Approved | User override — <rationale>
- **Data Modeller review:** <summary of validation results>
  - Verdict: Sound | Concerns | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Grain validation: PASS | FAIL — <details>
  - FK null checks: PASS | FAIL — <details>
  - Conformance: Sound | Issues — <details>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Data Engineer review:** <summary of findings>
  - Verdict: Sound | Concerns
  - Tier: Proceed | Proceed with caveats
  - Staging soundness: Sound | Concerns — <details>
  - Freshness configs: Sufficient | Insufficient — <details>
  - Incremental strategy: Appropriate | Concerns — <details>
  - Reviewer resolution: Approved | User override — <rationale>
- **BI Engineer mart-usability review:** Not applicable — downstream consumer is not a BI dashboard | <summary of findings>
  - Verdict: Suitable | Concerns | Redesign
  - Date spine: Present | Missing — <notes>
  - Aggregation level: Appropriate | Too fine | Too coarse — <notes>
  - Dimension cardinality: OK | High-cardinality concerns — <details>
  - Reviewer resolution: Approved | User override — <rationale>
- **Syn Review:** <included above>
- **Peer review issues addressed:**
  - <issue and fix, or "none — all reviews clean">
- **End-to-end validation:** Pass | Fail — <details>
- **Spot-check results:** <mart row count, key metric spot-check>
- **Summary:**
  1. <plain-language description>
  2. <plain-language description>
  3. <plain-language description>
- **All files created/modified:**
  - <file path>
- **Known limitations:**
  - <limitation>
- **Follow-up actions:**
  - <consumer walkthrough, downstream consumer notification, metrics layer, etc.>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
- **BI dashboard handoff:** Yes (auto — BI downstream consumer) — data_models/<project_name>/bi_engineer_handoff.md | Yes (user requested) — data_models/<project_name>/bi_engineer_handoff.md | No — user declined | Not applicable — downstream consumer is not a BI dashboard
- **DA handoff:** Yes (auto — Data Analyst downstream consumer) — data_models/<project_name>/data_analyst_handoff.md | Yes (user requested) — data_models/<project_name>/data_analyst_handoff.md | No — user declined | Not applicable — downstream consumer is not a Data Analyst
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

**GATE: Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.**

---
