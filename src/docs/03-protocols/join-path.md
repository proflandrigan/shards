# Join-Path Protocol

A self-check for tracing and validating multi-table joins before writing or executing SQL. Used by the Data Analyst, Data Scientist, Data Engineer, Analytics Engineer, ML Engineer and BI Engineer. It complements Data Modeller reviews and does not replace them.

## The problem it solves

Multi-table joins are the biggest source of silent data bugs. A forgotten one-to-many explodes rows, a missed left join drops data, a grain mismatch double-counts. The protocol catches these before execution. "Joins" includes table-to-table joins, CTE-to-CTE joins, and joins hidden inside upstream models you query.

## Tiers

| Tier | Trigger | What to do |
|---|---|---|
| 1, simple | One table or CTE chain with no joins, or two tables joined on a primary key | State each table's grain in one sentence. No verification query. |
| 2, standard | 2 to 3 tables or CTEs with foreign-key joins | Full trace, plus one verification query (row count before and after the key join). |
| 3, complex | 4 or more tables or CTEs, any suspected many-to-many, fan-out risk, cross-grain aggregation, or unverified upstream models | Full trace for every join, verification per join, a predicted fan-out multiplier, and escalation to the Data Modeller if anything is uncertain. |

Count joins, not just tables. A model built from five CTEs with internal joins raises the tier. When in doubt, go up a tier.

## Before the trace: check the knowledge source

Search the knowledge source for each table in the planned join (see [Knowledge](knowledge.md)). Documented grain or key-type facts go into the trace and are cited. Treat them as hints to verify.

## The trace

Presented in chat before the query is written:

```
Join Path Trace - Tier <N>
- <table_a>: grain = one row per <entity>
- <table_b>: grain = one row per <entity>
- <table_a> JOIN <table_b> ON <key> - <1:1 | 1:M | M:1 | M:M>
  Output grain after this join: one row per <entity>
- Predicted final grain: one row per <entity>
- Fan-out risk: none | <describe>
```

For every join, check three things: grain match, key semantics (same entity and type, not just the same column name) and cardinality (and whether any fan-out is expected and collapsed downstream).

For a model you did not build, verify its grain before using it: check for a `unique` test on its key, otherwise read its SQL and trace its CTEs, otherwise run `count(*)` against `count(distinct <suspected_pk>)`.

## Verification query (Tier 2 and up)

Compare `count(*)` of the left table with the count after the join. If the count grew, confirm the fan-out is expected. If not, diagnose before writing the query. For three or more joins this sweep is the pattern [Auto-Verify](auto-verify.md) is for.

## Escalate to the Data Modeller when

- Any many-to-many is detected or suspected.
- A verification query shows unexpected fan-out.
- You cannot state a table's grain with confidence.
- Tier 3 work touches tables not previously explored with the Data Modeller.
- Join keys come from different source systems and the semantic match is unclear.
- An upstream model has no grain tests and its logic is unclear after reading.

## Documentation

The trace lives in chat only. If it reveals a problem, record it in the phase specs as `Join path issues: <finding> | none`. In `.sql` files, put the output grain in the header comment: `-- Output grain: one row per <entity>`.

## See also

- [Data Modeller](../02-agents/data-modeller.md)
- [Data Engineer](../02-agents/data-engineer.md)
- [Auto-Verify](auto-verify.md)
- Source: `core/protocols/join_path.md`
