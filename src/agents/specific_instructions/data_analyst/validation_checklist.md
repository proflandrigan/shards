# Data Analyst Validation Checklist

Applied at the end of any adhoc analysis that produces a number, table, chart, or claim stakeholders will act on. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Data Analyst work is quick-track by nature. This checklist is deliberately short — six checks, most land in Observed as a single measured value.

## DA-01 — Query Executes & Row Count Sanity

The query runs to completion and returns a row count consistent with expectations.

- Query lives on disk (`sql/<name>.sql` in the analysis directory), not just in the chat transcript.
- Row count matches ballpark: totals check against source, temporal bounds honored, no accidental zero-row or all-rows result.

**Observed format:** `sql/active_teachers_q1.sql | rows: 14,207 | expected range 12k-16k ✓`

## DA-02 — Aggregation Correctness

If the analysis aggregates, the aggregation is correct — totals tie out, grain collapses are intentional, no double-counting.

- Spot-check: sum of a breakdown equals the aggregate total (or the gap is explained).
- No implicit join fan-out inflating numbers. See `shared/join_path_protocol.md` if joins are involved.
- Distinct-count vs count-of-rows chosen deliberately for the question being asked.

**Observed format:** `sum by region = 14,207 | total query = 14,207 ✓ | distinct user_id used (not row count) for active-users question`

## DA-03 — Filter & Time-Range Integrity

Filters applied in the query match the question being answered.

- Date ranges explicit and cover the period asked (inclusive/exclusive boundaries stated).
- Exclusions named (e.g., test accounts, internal users, churned segments) with rationale.
- Any implicit filter (e.g., default `is_active = true` in a view) called out.

**Observed format:** `filters: signup_date ∈ [2026-01-01, 2026-04-01) (inclusive/exclusive), excluded is_test=true and is_internal=true (n=482) | date range matches ask`

## DA-04 — Claims-Data Alignment

Every number stated in the summary or chat reply is traceable to a specific query or cell, and key numbers are recomputed from source to confirm.

- Top 3-5 headline numbers verified by an independent recount or cross-reference.
- No claim in the reply that can't be backed by a query result.

**Observed format:** `4 numbers in summary | all traced to sql/active_teachers_q1.sql or sql/breakdown_by_region.sql | top-2 recomputed: 14,207 total ✓, 3,840 APAC ✓`

## DA-05 — Visualization Accuracy

(Skip with `n/a` if no chart produced.) If the reply includes a chart, the chart visually matches the underlying data.

- Axis scales appropriate (no misleading truncation unless called out).
- Labels, units, and legend present and correct.
- Spot-check at least one data point against the underlying query result.

**Observed format:** `chart: analysis/figs/region_breakdown.png | data spot-check APAC bar = 3,840 ✓ | linear y-axis, percentage labels, sorted desc | alt-text provided`

## DA-06 — Open Questions Flagged

Any data gaps, caveats, or uncertainty that shape the answer are explicitly surfaced to the user — not buried.

- Known data quality issues affecting the analysis (late-arriving data, schema changes, missing segment).
- Ambiguity in the question where the answer depends on interpretation.
- If the analysis should escalate to a Data Scientist, say so.

**Observed format:** `caveats stated: (1) April data partial through the 18th, (2) "active" defined as ≥1 session — confirmed with user | no escalation needed`

---

## Track Calibration

Data Analyst work is quick-track by default. Deep-track work should escalate to Data Scientist.

| Track | Mode | Required | Skippable |
|-------|------|----------|-----------|
| **quick** | (Mode omitted, or `adhoc`) | DA-01, DA-02, DA-03, DA-04, DA-06 | DA-05 (only if no chart) |
| **fixer** | (Mode omitted) | DA-01, DA-04 + "what changed, what didn't break" | DA-02, DA-03, DA-05, DA-06 |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason. See `shared/validation_protocol.md`.

## Artifacts Expected

- SQL file(s) for every query run: `sql/<descriptive_name>.sql`
- Chart file(s) if visualization was produced: `analysis/figs/<name>.png`
- Summary markdown or the chat reply itself captured in `analysis/<project_name>/summary.md`

## Downstream Impact — What to Cover

- **Who acts on this:** name the stakeholder and the decision.
- **Shelf life:** when would this number materially change? Is a follow-up needed on a cadence?
- **Re-use risk:** will this query get copy-pasted elsewhere? If yes, consider escalating to Analytics Engineer for a mart.

## When to Escalate

- **Question requires causal interpretation** — escalate to Data Scientist.
- **Analysis would grow beyond 3-4 queries or require feature engineering** — escalate to Data Scientist.
- **DA-02 aggregation errors that can't be resolved** — consult Data Modeller on grain.
- **DA-04 claims that can't be traced** — remove the claim or find the source; never ship unverifiable numbers.
