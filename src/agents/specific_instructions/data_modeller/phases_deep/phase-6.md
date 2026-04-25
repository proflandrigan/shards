> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Deep Phase 6 — Build

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

Build in this order:
1. Source definitions
2. Staging models
3. Intermediate models
4. Mart / dimension / fact models
5. Schema files with tests and docs
6. Snapshots for SCD Type 2

For each model: write SQL, write .yml schema, run `dbt build --select +model_name`,
fix failures before next model.

**Post-build validation (per model, after `dbt build` passes):** Run the
applicable checks below using `dbt show` or the warehouse CLI. If any check
fails, halt and diagnose before advancing to the next model. In a contract-first
/ no-data environment, skip validation queries and note "THEORETICAL — no data
to validate" in the build log.

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
- **Deviations from design:** <changes from earlier phases and why, or "none">
- **Entity-relationship diagram (final):**
  ```
  <updated text diagram>
  ```
```

::GATE:: id=data-modeller-deep-phase-6 phase=6 kind=phase validates=data_modeller
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_modeller/phases_deep/phase-7.md` in full and follow its instructions starting from Deep Phase 7.
