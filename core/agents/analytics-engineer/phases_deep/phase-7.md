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

### Component specifications

Each task in `shards/<project_name>/tasks.yaml` cites one of these specifications through its `plan_ref`. Components, in dependency order:

1. Source definitions (sources.yml updates); source freshness passes.
2. Staging models (one task per model or small related group), each with its schema file.
3. Intermediate models, each with its schema file; fan-out matches Phase 3 predictions.
4. Mart models, each with its schema file; full validation suite.
5. Snapshot models (if SCD Type 2).
6. Singular test files.

Every model component comprises:
- **Join path trace (models with joins):** Before writing SQL for any model that
  joins tables, trace the join path following
  [`protocols/join_path.md`](../../../protocols/join_path.md). Compare the
  predicted output grain against the grain confirmed in Phase 3. If they diverge,
  stop and report the deviation instead of building (worker: via `task_report`; lead: fix the design first).
- The SQL (CTEs from source to final; use parameterized model references — never hardcoded table names)
- The schema file (model description, column descriptions, all required tests)
- The stack's build/validate command (e.g., `dbt build --select +model_name`); failures are fixed within the task before it reports
- A task is not reportable until its model is green
- **Post-build validation (per model, after `dbt build` passes):** Run the
  applicable checks below using `dbt show` or the warehouse CLI. If any check
  fails, the task fails. In a contract-first / no-data environment (Phase 2 Data
  sufficiency: Insufficient), skip validation queries and note "THEORETICAL — no
  data to validate" in the evidence row.

  **Auto-verify mode**: each task's post-build sweep, and the lead's re-verification
  of a layer, is a bulk read-only verification stretch. Open the block with
  `{{auto_verify start tool_budget=30 ttl=900}}` at the start of the validation pass and close it
  with `{{auto_verify end}}` before recording evidence. While it is open, `dbt show`
  and SELECT-only warehouse-CLI queries are auto-approved; `dbt build`
  and writes still prompt, and gates always win. See [`protocols/auto_verify_mode.md`](../../../protocols/auto_verify_mode.md).

  1. **Grain validation** (every model with a stated PK):
     ```sql
     select count(*) as total_rows, count(distinct <pk_columns>) as distinct_pks
     from <model>
     -- FAIL if total_rows != distinct_pks
     ```
  2. **Join fan-out verification** (models with joins — Tier 2+ from
     `protocols/join_path.md`):
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
     types, and values look correct.

  Scale to model importance: staging models need only grain + sample; intermediate
  models add fan-out checks if they contain joins; mart/fact models get the full
  suite.

Task acceptance commands must name the exact test command and the measured facts expected (row counts, `null rate on join key = 0.00%`, grain check result).

### Lead loop

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

Follow {{protocol delegated_build}}. You are the lead: you dispatch, verify and record; you do not write build code yourself except for `delegate: inline` tasks.

1. **Load the task list.** Load `shards/<project_name>/tasks.yaml` (approved at the plan gate) with `tasks_set`. Fix any rejection (cycle, overlapping owned paths, missing acceptance) with the user before building.
2. **Dispatch.** `task_dispatch` the ready tasks (all `depends_on` done), in parallel up to `max_parallel=3`. Each task card cites its `plan_ref`, so workers see only the Component specifications they need.
3. **Collect.** Each worker returns a result through `task_report`.
4. **Lead verifies every report before it counts.** Re-run (or independently check) the task's acceptance command and compare the outcome with the cited `plan_ref`. Then write a per-task evidence row to the `## Validation` Evidence table (Check = task id + component, Expected, Observed, Pass/Fail). Never mark a task done on the worker's word alone. {{protocol incremental_testing}} is task evidence guidance.
5. **Failures.** Re-dispatch with the failure output as feedback, at most 2 retries; then stop and ask the user with a summary of what failed.
6. **Deviations.** If a worker reports a deviation, or the plan cannot be met, pause dependent tasks and follow {{protocol plan_drift}}; amend the plan only through a confirmed gate.
7. **Unblock.** After each verified task, dispatch the tasks it unblocks.
8. **DAG updates.** After the lead verifies a model task, update the DAG file with the completed model highlighted (e.g. `style stg_orders fill:#1a3a1a,stroke:#2a6a2a,color:#60a060`) and re-emit with the same `panel_id` from Phase 4 so it updates in place:
   {{artifact.emit type=dag path=shards/<project_name>/dag.mmd meta="title=DAG: <project_name> panel_id=dag-<project_name>"}}
9. **Final integration check.** When all tasks are done, the lead runs the full stack build/test (e.g. `dbt build`) and records the result as an evidence row before the gate.

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
- **Task evidence:** one row per task in the `## Validation` Evidence table (task id, expected, observed, pass/fail)
- **Deviations from design:** <changes from Phases 4-6 and why, or "none">
- **Performance notes:** <run time, row counts, anything notable>
```

{{gate kind=phase validates=analytics-engineer}}

---

## When this gate is confirmed

{{phase 8}} in full and follow its instructions starting from Deep Phase 8. Do not pre-read further phase files.
