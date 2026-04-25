# Join-Path Protocol

A self-check protocol for tracing and validating multi-table joins before writing or executing SQL. Used by Data Analyst, Data Scientist, Data Engineer, Analytics Engineer, ML Engineer, and BI Engineer.

## The problem it solves

Multi-table joins are the single biggest source of silent data bugs. A forgotten one-to-many explodes rows; a missed left-join drops data; a grain mismatch produces double-counting. The join-path protocol catches these before execution.

## The check

Before writing a multi-table query, the specialist traces the join path:

1. **Enumerate tables** — list every table in the join.
2. **Identify grain** — for each table, state its grain (one row per X).
3. **Trace the join keys** — for each join, verify that the key enforces the intended cardinality.
4. **Document expected cardinality** — one-to-one, one-to-many, many-to-many, filtered.
5. **Check for grain changes** — does the join change the grain of the result? If yes, is aggregation applied?
6. **Check for null handling** — left joins, nullable keys, implicit inner-join behavior.

Output is a short block in `project-specs.md` before the query is written.

## Example

```
::GATE::
## Join Path (orders → customers → subscriptions)

Tables:
- orders: one row per order (order_id)
- customers: one row per customer (customer_id)
- subscriptions: one row per customer per active_from date (customer_id, active_from)

Joins:
- orders.customer_id = customers.customer_id   (many-to-one)
- customers.customer_id = subscriptions.customer_id   (one-to-many!)

Grain change: subscriptions join explodes rows.
Mitigation: filter to active subscription first via window function before join.
::ENDGATE::
```

## See also

- [Data Modeller](../02-agents/data-modeller.md)
- [Data Engineer](../02-agents/data-engineer.md)
- Source: `src/agents/specific_instructions/shared/join_path_protocol.md`
