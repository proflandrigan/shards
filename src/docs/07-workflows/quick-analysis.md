# Workflow: Quick Adhoc Analysis

The shortest productive path through Shards. Use when you have a specific question answerable in a handful of SQL queries.

## Flow

```
/shards
  └─ Syn triages → Data Analyst
     ├─ Phase 0: understand the question
     ├─ Phase 1: check Knowledge Ledger, consult Data Modeller for schema
     ├─ Phase 2: write query (join-path check)
     ├─ Phase 3: execute, inspect
     ├─ Phase 4: findings + chart (BI Engineer review if visual)
     └─ Phase 5: Syn final review + knowledge harvest
```

Output: `analysis/<project>/` with `project-specs.md`, `query.sql`, and `findings.md`.

## Example session

**You:**
> /shards
> What is the weekly conversion rate by cohort for Q3?

**Syn (triage):** Confirms scope, creates `analysis/q3_conversion_by_cohort/`, hands off to Data Analyst.

**Data Analyst:**
- Phase 1 gate — lists known tables (`users`, `signups`, `conversions`), notes grain of each, flags that `conversions` has one row per event (not per user).
- Phase 2 gate — join path documented (left join `signups` → `conversions`, aggregated to weekly grain).
- Phase 3 — runs query, notes one cohort is suspicious (unusually high rate).
- Phase 4 — findings written, chart spec handed to BI Engineer for review.
- Phase 5 — Syn reviews, knowledge-harvest suggests adding an entry about the suspicious cohort's data quality issue.

## When to escalate

- If answering the question requires modeling, feature engineering, or more than ~3 queries → escalate to `/data-scientist`.
- If the question is actually about infrastructure (missing tables, broken pipeline) → escalate to `/data-engineer`.
- If the chart is the real deliverable → consider running `/bi-engineer` directly.

## See also

- [Data Analyst](../02-agents/data-analyst.md)
- [Join Path Protocol](../03-protocols/join-path.md)
- [Gate Pattern](../03-protocols/gate-pattern.md)
