---
name: join-path-protocol
description: Self-check protocol for tracing join paths before writing or executing multi-table SQL
type: reference
---

# Join Path Self-Check Protocol

Before writing or executing any SQL that joins tables, trace the join path. This
is a self-check — you do it yourself, in-chat, before writing the query. It
complements but does not replace Data Modeller reviews.

"Joins" means any place two datasets meet — table-to-table joins, CTE-to-CTE
joins within a query, and joins hidden inside upstream models you're querying.
Trace all of them.

## Tier Assessment

Assess query complexity before tracing:

| Tier | Trigger | What to do |
|------|---------|------------|
| **Tier 1 — Simple** | Single table or single CTE chain with no joins, or two tables joined on PK | State the grain of each table/CTE. One sentence. No verification query needed. |
| **Tier 2 — Standard** | 2-3 tables/CTEs with FK joins | Full trace: grain per table and per CTE that introduces a join, relationship type per join, predicted output grain. Run one verification query (row count before/after the key join). |
| **Tier 3 — Complex** | 4+ tables/CTEs with joins, any suspected M:M, fan-out risk, cross-grain aggregation, or querying upstream models whose internal logic you haven't verified | Full trace for every join (including within CTEs). Run verification queries for each join. Predict fan-out multiplier per join. Escalate to Data Modeller if anything is uncertain. |

**Count joins, not just tables.** A query against two tables looks simple, but if
one table is a model built from five CTEs with internal joins, the real complexity
is higher. When in doubt, bump the tier up.

## Knowledge Pre-Check

Before beginning the join trace, run a Knowledge Checkpoint for each table in the planned join. Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` (fast path first, deep path if needed).

If a knowledge entry documents the grain, key type, or semantics of a table involved in the join, incorporate it into the trace and cite it using the citation format in the checkpoint protocol. Grain and key-type mismatches that the ledger already documents should be called out before any SQL is written — not discovered post-execution.

If the ledger has no relevant entries, proceed directly to the trace.

## The Trace

Present the trace in-chat before writing the query. Format:

```
**Join Path Trace** — Tier <N>
- <table_a>: grain = one row per <entity>
- <table_b>: grain = one row per <entity>
- <table_a> JOIN <table_b> ON <key> — <1:1 | 1:M | M:1 | M:M>
  Output grain after this join: one row per <entity>
- Predicted final grain: one row per <entity>
- Fan-out risk: none | <describe the risk>
```

For queries with CTEs, trace the CTE chain from source to final:

```
**Join Path Trace** — Tier <N>
CTE: source_orders — selects from orders; grain = one row per order_id
CTE: order_items — selects from line_items; grain = one row per line_item_id
CTE: enriched — source_orders JOIN order_items ON order_id — 1:M
  Output grain: one row per line_item_id (fan-out from order to items — expected)
CTE: aggregated — GROUP BY order_id on enriched
  Output grain: one row per order_id (fan-out collapsed by aggregation)
CTE: final — aggregated JOIN dim_customers ON customer_id — M:1
  Output grain: one row per order_id (no fan-out — customer is a dimension)
- Predicted final grain: one row per order_id
- Fan-out risk: none — 1:M fan-out in enriched is collapsed by aggregation before final
```

For Tier 2+, append verification results after running the query:

```
- Verification: <left_table> rows = <N> → after join = <N> (<multiplier>x)
```

### What to check at each join

For every join in the query, answer these three questions:

1. **Grain match:** What is one row in the left table? What is one row in the
   right table? After the join, what is one row in the result?
2. **Key semantics:** Do the join keys represent the same entity? Same type?
   (Not just same column name — same meaning.)
3. **Cardinality:** Is this 1:1, 1:M, M:1, or M:M? If 1:M, is the fan-out
   expected and handled (e.g., by a downstream aggregation)?

### Tracing through upstream models

When your query references a model you did not build (a mart, intermediate model,
or staging model), do not assume its grain — verify it before including it in
your trace:

1. **Check for schema tests first.** If the model has a `unique` or
   `unique_combination_of_columns` test on its PK in a `.yml` file, the grain is
   documented and tested. State it in your trace and move on.
2. **If no tests exist, read the model's SQL.** Open the `.sql` file and trace
   its CTEs the same way you trace your own query. Identify where joins happen
   inside the model, what cardinality they introduce, and what the final CTE's
   grain is.
3. **If you can't find the model definition** (e.g., it's a raw table from a
   source system), run a grain validation query:
   ```sql
   select count(*) as total_rows, count(distinct <suspected_pk>) as distinct_pks
   from <model>
   ```
   If `total_rows != distinct_pks`, the column you assumed was the PK is not
   unique — your grain assumption is wrong. Escalate to the Data Modeller.

**Why this matters:** A query that joins two well-tested marts is Tier 1. A query
that joins two undocumented intermediate models with internal CTEs and no grain
tests is Tier 3 — you're inheriting every unvalidated join inside those models.

### Verification query (Tier 2+)

Run before the actual query to confirm your cardinality assumption:

```sql
select 'before' as stage, count(*) as rows from <left_table>
union all
select 'after', count(*)
from <left_table> join <right_table> on <join_condition>
```

If after > before: fan-out is occurring. Confirm it is expected. If unexpected,
diagnose before writing the query.

**Auto-verify**: when a query has 3+ joins and you're running this sweep
once per join, that's the bulk read-only pattern auto-verify is for. Open
`::AUTO-VERIFY:: agent=<your-agent> phase=<N>` before the sweep and
`::ENDAUTO::` after. See `specific_instructions/shared/auto_verify_mode.md`.

## Escalation Triggers

Invoke the Data Modeller via Task instead of self-assessing when:

- Any M:M relationship is detected or suspected
- Verification query shows unexpected fan-out (predicted 1.0x, observed > 1.0x)
- You cannot confidently state a table's grain
- Tier 3 complexity on tables you have not previously explored with the Data Modeller
- Join keys come from different source systems and semantic match is unclear
- Upstream model has no grain tests and its internal CTE logic is unclear after reading

Escalation prompt pattern:

> "Before I write this query, I need the Data Modeller to verify the join path.
> Here is my trace: [include trace]. The concern is: [specific concern]."

## Outcome Documentation

The trace itself lives in-chat only — do not write it to project-specs.md.

If the trace reveals an issue (unexpected fan-out, grain mismatch, M:M risk),
document it in the phase specs template:

```
- **Join path issues:** <finding> | none
```

## SQL Header Convention

When writing `.sql` files, include the output grain in the header comment:

```sql
-- Output grain: one row per <entity>
```

This goes alongside existing header fields (Analysis/Dashboard name, Query
description, Date, Filters/Data sources). It makes grain visible to anyone
reading the query later.
