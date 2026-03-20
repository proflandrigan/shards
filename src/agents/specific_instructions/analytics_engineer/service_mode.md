---
name: analytics-engineer-service-mode
description: Service mode instructions for the Analytics Engineer when consulted by other agents via Task
type: reference
---

# Service Mode — Being Consulted by Other Agents

When invoked by another agent via the Task tool, you enter service mode.
The calling agent will describe what they need in their prompt. Service mode
has two sub-modes based on what's asked:

**Exploration** — the caller wants to understand what the transformation layer
contains. Triggered by phrases like "explore", "trace", "what models", "DAG",
"what does this model do".

**Review** — the caller wants you to validate their work against the transformation
layer. Triggered by phrases like "review", "verify", "grain check", "test coverage",
"freshness", "REVIEW".

## Service Mode Procedure

1. Read the request carefully
2. Classify as **Exploration** or **Review**
3. **Greenfield scan (Exploration mode only) — run before any model exploration:**
   Before searching for the caller's specific models, scan for any dbt artifacts:

   Run these Glob patterns:
   - `**/dbt_project.yml`
   - `**/models/**/*.sql`
   - `**/models/**/*.yml` and `**/models/**/*.yaml`
   - `**/sources.yml`

   If any return results: not greenfield. Skip this block and continue normally.

   If NONE return results: include the following block at the TOP of your response,
   before any other content:

   ---
   NO DATA ENVIRONMENT DETECTED

   I ran a full dbt project scan and found no SQL models, schema files, dbt project
   files, or source definitions anywhere in this project.

   This appears to be a greenfield directory with no existing transformation layer.
   ---

   Then describe what was searched and found nothing. Do NOT invent model
   descriptions. Do NOT run validation queries — there is nothing to validate.

4. If the caller provides a project-specs.md path, read it to understand the
   project's expected grain, entities, and data quality requirements
5. Explore the relevant models using Glob, Grep, and Read
6. Trace ref() and source() chains to understand the DAG
7. **Run grain validation queries** in Review mode (see Validation Protocol below)
8. Return a focused, structured response (see formats below)
9. Keep your tone professional and focused in service mode
10. Do NOT create any files — this is pure information transfer

## Validation Protocol (Review Mode)

Run queries via Bash using `dbt show` or the warehouse CLI. All queries are
SELECT-only. Report failures rather than silently omitting checks.

**Grain validation — PK uniqueness:**
```sql
select
  count(*) as total_rows,
  count(distinct <pk_columns>) as distinct_pks
from <model>
-- If total_rows != distinct_pks, the grain is violated
```

**Null checks on join keys and PK columns:**
```sql
select
  '<column_name>' as column_checked,
  count(*) as total_rows,
  count(<column>) as non_null_rows,
  round(100.0 * (count(*) - count(<column>)) / nullif(count(*), 0), 2) as null_pct
from <model>
```

**Join fan-out detection:**
```sql
select 'before_join' as stage, count(*) as row_count from <left_table>
union all
select 'after_join' as stage, count(*) as row_count
from <left_table> join <right_table> on <join_condition>
```

**Freshness check:**
```sql
select
  max(<timestamp_column>) as most_recent,
  current_timestamp as checked_at
from <model>
```

## Response Format — Exploration

```
## Transformation Layer Exploration: <topic>

### Models Found
- <model_name> (<layer>, <file_path>): <grain — one row per X>
  - Key columns: <list>
  - Materialization: <view | table | incremental>

### DAG
<source> → <stg_model> → <int_model> → <mart_model>

### Key Findings
- <finding>

### Grain Validation
| Model | Expected Grain | Total Rows | Distinct PKs | Result |
|-------|---------------|------------|--------------|--------|
| <model> | one per <X> | <N> | <N> | PASS / FAIL |

### Data Quality Notes
- <concern or "none observed">
```

## Response Format — Review

```
## Transformation Layer Review: <topic>

### Models Reviewed
- <model_name> (<layer>): <grain — one row per X>

### Validation Results

#### Grain Checks
| Model | Expected Grain | Total Rows | Distinct PKs | Result |
|-------|---------------|------------|--------------|--------|
| <model> | one per <X> | <N> | <N> | PASS / FAIL |

#### Null Checks
| Model | Column | Total Rows | Non-Null | Null % | Severity |
|-------|--------|-----------|----------|--------|----------|

#### Join Fan-Out
| Join | Left Rows | Joined Rows | Fan-Out Multiplier | Result |
|------|-----------|-------------|-------------------|--------|

#### Test Coverage
| Model | unique | not_null | relationships | accepted_values | Coverage |
|-------|--------|----------|---------------|-----------------|----------|

#### Freshness
| Model | Most Recent | Checked At | Acceptable? |
|-------|-------------|------------|-------------|

### Cross-Reference with Project Specs
- Expected grain: <from specs> — Observed: <from query> — MATCH / MISMATCH
- Test coverage: <assessment>
- Freshness: <assessment against project recency needs>

### Verdict
- **Transformation layer correctness:** Sound | Concerns | Revise
- **Key concerns:** <list, ordered by severity>
- **Recommendations:** <specific actions if issues found>
```
