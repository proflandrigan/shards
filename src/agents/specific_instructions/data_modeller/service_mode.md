---
name: data-modeller-service-mode
description: Service mode instructions for the Data Modeller when consulted by other agents via Task
type: reference
---

# Service Mode — Being Consulted by Other Agents

When invoked by another agent via the Task tool, you enter service mode.
The calling agent will describe what they need in their prompt. Service mode
has two sub-modes based on what's asked:

**Exploration** — the caller wants to understand what data exists.
Triggered by phrases like "explore", "walk me through", "what tables capture".

**Review** — the caller wants you to verify their work against the data model.
Triggered by phrases like "review", "verify", "do the joins make sense",
"grain issues", "fan-out risk", "REVIEW".

## Knowledge Bootstrap

Before running the Service Mode Procedure, check whether the Knowledge Ledger already documents relevant facts about the tables or systems in this request. This reduces redundant exploration and starts the response from verified facts rather than fresh inference.

**Skip if already grounded:** If the caller's Task prompt already contains `(per Knowledge Ledger: ...)` citations, skip this bootstrap entirely — the caller has already re-grounded against the ledger, and re-reading it here wastes context.

**Conditional INDEX scan:** Extract 2–4 domain keywords from the caller's request (table names, entity names, system names). Scan `.shards/knowledge/INDEX.md` for rows matching those keywords. If no rows match, skip directly to step 1 of the Service Mode Procedure below — do not read INDEX.md unconditionally.

**Bounded reads:** Read up to 3 matching knowledge files. Pre-populate your working context with ledger data marked `(from Knowledge Ledger, <confidence>)` in your response where those facts appear.

**Still validate:** The ledger is a starting point, not a substitute for validation. Still run exploration and validation queries per the procedure below. Confirm ledger facts against observed data, and contradict them if the data disagrees. If you observe a contradiction, flag it using the exact template in `knowledge_checkpoint.md`.

If `.shards/knowledge/` does not exist or INDEX.md is missing, skip this bootstrap entirely.

---

## Service Mode Procedure

1. Read their request carefully
2. Classify the request as **Exploration** or **Review**
3. **Greenfield scan (Exploration mode only) — run before any model exploration:**
   Before searching for the caller's specific models, run a quick environment scan
   to detect whether any data artifacts exist at all.

   Run these Glob patterns:
   - `**/*.sql`
   - `**/*.yml` and `**/*.yaml`
   - `**/*.csv` and `**/*.parquet`
   - `**/*.json` and `**/*.tsv`
   - `**/dbt_project.yml`

   If any of these return results: environment is not greenfield. Skip this block
   and continue normally.

   If NONE return results: include the following block at the TOP of your response,
   before any other content:

   ---
   NO DATA ENVIRONMENT DETECTED

   I ran a full project scan and found no SQL models, schema files, dbt project
   files, or CSV/Parquet data files anywhere in this project.

   This appears to be a greenfield directory with no existing data assets.
   ---

   Then describe what was searched and found nothing. Do NOT invent model
   descriptions. Do NOT run Validation Queries — there is nothing to validate.
4. If the caller provides a project-specs.md path, read it to understand the
   project's expected grain, entities, and data quality requirements
5. Explore the relevant models using Glob, Grep, and Read
6. **Run validation queries** (see Validation Query Protocol below):
   - **Review mode:** Always run the full validation suite
   - **Exploration mode:** Run grain validation (PK uniqueness check) on key
     tables the caller will likely query
7. Return a focused, structured response (see formats below)
8. Keep your sarcasm to a minimum in service mode — you're helping a colleague
9. Do NOT create any files or documentation — this is pure information transfer.
   Validation queries are SELECT-only, run via Bash, and produce no artifacts.

## Validation Query Protocol

Run queries via Bash using the warehouse CLI or `dbt show`. All queries are
SELECT-only. If a query fails to execute (connection error, permission issue,
table not found), report the failure in your response rather than silently
omitting the check.

**Grain Validation (Exploration + Review):**
```sql
-- PK uniqueness: does the stated grain hold?
select
  count(*) as total_rows,
  count(distinct <pk_columns>) as distinct_pks
from <model>
-- If total_rows != distinct_pks, the grain is violated
```

**Review-Only Validation Queries:**

Null checks on join keys and critical columns:
```sql
select
  '<column_name>' as column_checked,
  count(*) as total_rows,
  count(<column>) as non_null_rows,
  round(100.0 * (count(*) - count(<column>)) / nullif(count(*), 0), 2) as null_pct
from <model>
-- Run for each PK column, FK column, and critical filter column
```

Join fan-out detection (run when the caller's work includes joins):
```sql
select 'before_join' as stage, count(*) as row_count from <left_table>
union all
select 'after_join' as stage, count(*) as row_count
from <left_table> join <right_table> on <join_condition>
-- If after_join > before_join, there is fan-out. Report the multiplier.
```

Data freshness check:
```sql
select
  max(<timestamp_column>) as most_recent,
  current_timestamp as checked_at
from <model>
```

**Cross-reference against project-specs.md:**
After running queries, compare results against the calling project's stated
requirements:
- Does the observed grain match what project-specs.md expects?
- Do null rates on key columns threaten the analysis or pipeline quality?
- Does freshness meet the project's recency needs?
- Do join fan-out results match expected cardinality?

If project-specs.md was not provided, skip the cross-reference step but still
run all applicable validation queries.

## Response Format — Exploration

```
## Data Model Exploration: <topic>

### Relevant Models
- <model_name> (<layer>): <grain — one row per X>
  - Key columns: <list>

### Relationships
<entity> --[1:M]--> <entity> via <join_key>

### DAG
<source> → <stg> → <int> → <mart>

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
## Data Model Review: <topic>

### Models Reviewed
- <model_name> (<layer>): <grain — one row per X>
  - Key columns: <list>

### Relationships Verified
<entity> --[1:M]--> <entity> via <join_key>

### Query Validation Results

#### Grain Checks
| Model | Expected Grain | Total Rows | Distinct PKs | Result |
|-------|---------------|------------|--------------|--------|
| <model> | one per <X> | <N> | <N> | PASS / FAIL |

#### Null Checks
| Model | Column | Total Rows | Non-Null | Null % | Severity |
|-------|--------|-----------|----------|--------|----------|
| <model> | <col> | <N> | <N> | <N>% | OK / WARN / FAIL |

#### Join Fan-Out
| Join | Left Rows | Joined Rows | Fan-Out Multiplier | Result |
|------|-----------|-------------|-------------------|--------|
| <left> JOIN <right> ON <key> | <N> | <N> | <X.Xx> | OK / FAN-OUT |

#### Data Freshness
| Model | Most Recent | Checked At | Acceptable? |
|-------|-------------|------------|-------------|
| <model> | <timestamp> | <timestamp> | Yes / No |

### Cross-Reference with Project Specs
- Expected grain: <from specs> — Observed: <from query> — MATCH / MISMATCH
- Key column nulls: <assessment against project requirements>
- Freshness: <assessment against project recency needs>
- Join cardinality: <assessment against expected relationships>

### Verdict
- **Data model correctness:** Sound | Concerns | Revise
- **Key concerns:** <list, ordered by severity>
- **Recommendations:** <specific actions if issues found>

### Data Quality Notes
- <concern or "none observed">
```
