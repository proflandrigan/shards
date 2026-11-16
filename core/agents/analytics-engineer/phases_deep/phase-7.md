> **Previous:** phase-6.md confirmed
> **Next:** phase-8.md (read only after this phase's gate is confirmed)

---

## Deep Phase 7 — Build

**Context checkpoint:** Before building, prompt the user:

"Planning's confirmed — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

### Incremental testing — checkpoint gates between layers

{{protocol incremental_testing}} during this build. Each layer below is a checkpoint seam — after a layer's models all build green and their post-build validation (grain, fan-out, nulls, sample) passes, call `gate_request` with a `kind=checkpoint` gate (macro below) before advancing to the next layer. Do not batch the entire DAG into a single build and eyeball a pass/fail at the end.

Checkpoint gate — pass `evidence={status: pass|fail, checks: [...]}`: put the layer name, the exact test command you ran, and the measured facts (e.g. row counts, `null rate on join key = 0.00%`, grain check result) in `checks`. Under the default `phase` policy a passing checkpoint is recorded automatically and blocks only on fail/anomaly. Never confirm your own gate.

{{gate kind=checkpoint name=component-slug}}

Expected checkpoint names for this phase (use as `name`, in order as you build):

- `sources` — sources.yml updates validate; source freshness passes.
- `staging` — all staging models build green; grain + sample inspection pass per the post-build rubric.
- `intermediate` — intermediate models build green; fan-out verification matches Phase 3 predictions.
- `marts` — mart/fact models build green; grain / fan-out / PK-FK null / sample checks all pass.
- `tests` — singular tests and snapshot models (if present) run green.

If a checkpoint fails, diagnose, fix, and call `gate_request` again with updated evidence before advancing.

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
  [`protocols/join_path.md`](../../../protocols/join_path.md). Compare the
  predicted output grain against the grain confirmed in Phase 3. If they diverge,
  fix the design before writing SQL.
- Write the SQL (CTEs from source to final; use parameterized model references — never hardcoded table names)
- Write the schema file (model description, column descriptions, all required tests)
- Run the stack's build/validate command (e.g., `dbt build --select +model_name`) — fix any failures before next model
- Do not advance to the next model until the current one is green
- After each model passes validation, update the DAG file with the completed model highlighted (e.g. `style stg_orders fill:#1a3a1a,stroke:#2a6a2a,color:#60a060`) and re-emit with the same `panel_id` from Phase 4 so it updates in place:
  {{artifact.emit type=dag path=data_models/<project_name>/dag.mmd meta="title=DAG: <project_name> panel_id=dag-<project_name>"}}
- **Post-build validation (per model, after `dbt build` passes):** Run the
  applicable checks below using `dbt show` or the warehouse CLI. If any check
  fails, halt and diagnose before advancing to the next model. In a contract-first
  / no-data environment (Phase 2 Data sufficiency: Insufficient), skip validation
  queries and note "THEORETICAL — no data to validate" in the build log.

  **Auto-verify mode**: each layer's post-build sweep is a bulk read-only
  verification stretch. Open the block with `{{auto_verify start tool_budget=30 ttl=900}}`
  at the start of the layer's validation pass and close it with `{{auto_verify end}}` before
  the layer's checkpoint gate. While it is open, `dbt show`
  and SELECT-only warehouse-CLI queries are auto-approved; `dbt build`
  and writes still prompt, and gates always win. See [`protocols/auto_verify_mode.md`](../../../protocols/auto_verify_mode.md).

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

{{gate kind=phase validates=analytics-engineer}}

---

## When this gate is confirmed

{{phase 8}} in full and follow its instructions starting from Deep Phase 8. Do not pre-read further phase files.
