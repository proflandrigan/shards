> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Deep Phase 6 — Build

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

### Component specifications

Each task in `shards/<project_name>/tasks.yaml` cites one of these specifications through its `plan_ref`. Components, in dependency order:

1. Source definitions
2. Staging models
3. Intermediate models
4. Mart / dimension / fact models
5. Schema files with tests and docs (part of each model's task)
6. Snapshots for SCD Type 2

Every model component comprises its SQL, its .yml schema, and a `dbt build --select +model_name` run; failures are fixed within the task before it reports.

**Post-build validation (per model, after `dbt build` passes):** Run the
applicable checks below using `dbt show` or the warehouse CLI. If any check
fails, the task fails and is diagnosed before dependents proceed. In a contract-first
/ no-data environment, skip validation queries and note "THEORETICAL — no data
to validate" in the evidence row.

> **Auto-verify mode**: each validation sweep is a bulk read-only verification stretch — the
> kind that otherwise spams permission prompts. Open `{{auto_verify start tool_budget=40 ttl=900}}`
> at the start of a post-build sweep and `{{auto_verify end}}` at the end. The runtime
> auto-approves `dbt show`, `dbt debug`, and SELECT-only warehouse-CLI queries while
> the block is open; `dbt build` and any write still prompt as normal. See
> [`protocols/auto_verify_mode.md`](../../../protocols/auto_verify_mode.md).

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
   -- FAIL if after > before and diverges from predicted fan-out
   ```
3. **PK/FK null check** (dimension and fact models):
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

Scale to model importance: staging models need only grain + sample; dimension/fact
models get the full suite.

Task acceptance commands name the exact test command and the measured facts expected.

### Lead loop

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

Follow the lead loop in {{protocol delegated_build}} (task evidence guidance: {{protocol incremental_testing}}). Each task card cites its `plan_ref`, so workers see only the Component specifications they need.

**Final integration check:** when all tasks are done, the lead runs the full `dbt build` and records the result as an evidence row before the gate.

### Document Deep Phase 6

```markdown
---

## Deep Phase 6: Build Log (Data Modeller)
- **Files created:**
  - <file path>: <brief description>
- **Files modified:**
  - <file path>: <what changed>
- **Build validation:**
  - `dbt build` result: Pass | Fail — <details>
  - Tests passing: <N> / <N>
- **Post-build validation:**
  | Model | Grain Check | Fan-Out Check | PK/FK Nulls | Sample OK | Notes |
  |-------|-------------|---------------|-------------|-----------|-------|
  | <model> | PASS / FAIL | PASS / FAIL / N/A | PASS / WARN / FAIL | Yes / No | <details or "clean"> |
  - (or "THEORETICAL — no data to validate" if contract-first design)
- **Task evidence:** one row per task in the `## Validation` Evidence table (task id, expected, observed, pass/fail)
- **Deviations from design:** <changes from earlier phases and why, or "none">
- **Entity-relationship diagram (final):**
  ```
  <updated text diagram>
  ```
```

{{gate kind=phase validates=data-modeller}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Deep Phase 7.
