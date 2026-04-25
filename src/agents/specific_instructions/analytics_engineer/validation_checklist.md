# Analytics Engineer Validation Checklist

Applied at the end of any phase that creates or modifies a mart, intermediate model, staging model, or macro with data-shaping logic. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (AE-01 through AE-09) are stable — reference them in the evidence table so coverage is auditable over time.

## AE-01 — Field Completeness

All expected columns are present with correct types.

- Expected column list comes from the spec (deep) or the ticket/ask (quick).
- Verify types match contract (dbt `data_tests`, or `SELECT column_name, data_type FROM information_schema.columns`).
- No stray columns added without a spec entry.

**Observed format:** `all_expected_cols_present: true | missing: [col_a, col_b]`

## AE-02 — Row Count Sanity

Output row counts are within the expected magnitude.

- Compare to: source row count (staging), prior run (incremental), and prediction from the join-path trace.
- Flag a deviation of >10% vs prior run unless explained.

**Observed format:** `rows: 48,211 | source: 48,211 | prior_run: 47,988 (+0.5%)`

## AE-03 — Grain & Primary Key

The declared grain holds. The PK is unique.

- Run: `SELECT COUNT(*) AS total, COUNT(DISTINCT <pk>) AS distinct_pk FROM <model>`
- For composite grain, test all key columns together.
- If the model has a `unique` test in `schema.yml`, this is satisfied by a successful `dbt test` run; record the test name.

**Observed format:** `pk=<col>: total=48,211 distinct=48,211 ✓` or `dbt test unique_<model>_<col> PASSED`

## AE-04 — Null Coverage

Nullability matches the contract.

- Required columns: zero nulls.
- Optional columns: null rate within expected range (document the range in the spec).
- Flag any column where null rate jumped >5pp vs prior run.

**Observed format:** `required_cols_null_counts: {user_id: 0, order_id: 0} | optional: {shipped_at_null_pct: 12.4% (expected <15%)}`

## AE-05 — Distribution Sanity

Value distributions are plausible.

- **Categoricals:** value counts for every dimension column. No new unexpected values. No sudden concentration shifts.
- **Numerics:** min, max, mean, p50, p99. Flag impossible values (negatives where positive expected, extreme outliers).
- **Timestamps:** min and max. No future-dated rows where not expected. No pre-epoch values.

**Observed format:** `amount: min=0.00 max=9,842.10 mean=127.33 p50=45.00 p99=1,204.77 ✓ | status: {active: 92%, churned: 7%, pending: 1%} ✓`

## AE-06 — Join Integrity

Fan-out from upstream joins is expected and bounded.

- Uses the same join-path trace discipline from `shared/join_path_protocol.md`.
- For Tier 2+ queries, record the before/after row counts at the key join.
- Flag any M:M or unexpected multiplier.

**Observed format:** `orders JOIN items: 10,021 → 48,211 (4.8x, expected ~5x items per order) ✓` or `none — Tier 1 single-table`

## AE-07 — Downstream Impact

Dependent models and dashboards still build and produce stable outputs.

- Identify dependents via `dbt ls --select <model>+` or the DAG view.
- For each dependent: confirm it still compiles and runs. If it consumes the changed columns, confirm its output row count and grain are unchanged (or explain the change).
- Dashboards: name each dashboard that queries this model and either (a) verify it renders OK, or (b) note it as not-checked and list the consumer team.

**Observed format:** `fct_revenue ✓ rebuilt (48,211 rows, unchanged grain) | dim_customer_daily ✓ | dashboard "Revenue Weekly" — not re-rendered, flagged to finance team`

## AE-08 — Test Artifacts

Tests exist, on disk, and pass.

- `schema.yml` entry for the model includes at minimum:
  - `unique` on the PK (composite test if composite grain)
  - `not_null` on every required column from the contract
  - `relationships` test on every FK to a model we own
- Custom generic tests (or singular tests) for any business rule that cannot be expressed via standard tests (e.g., `revenue >= 0`, `status IN (...)`).
- `dbt test --select <model>` exits zero.

**Observed format:** `schema.yml: 7 tests (unique, 4 not_null, 2 relationships) | custom: test_<model>_amount_positive.sql | dbt test: PASSED`

## AE-09 — Refresh Mode Parity

Incremental and full-refresh runs produce the same result.

- Only applicable when `materialized='incremental'`.
- Run: drop + `--full-refresh` → record row count. Then reset to incremental → record row count.
- Any divergence is a bug in the incremental predicate or uniqueness key.
- Skip if the model is a view or table (record `n/a`).

**Observed format:** `incremental=48,211 full_refresh=48,211 ✓` or `n/a (materialized=table)`

---

## Track Calibration

Run the subset of checks appropriate to the track. Mode is optional for AE — the Track values already capture the common flavors of analytics work. Use Mode only if you want to distinguish, e.g., `build` vs `refactor` vs `adhoc` within a Track.

| Track | Required | Recommended | Skippable |
|-------|----------|-------------|-----------|
| **deep** | AE-01, AE-02, AE-03, AE-04, AE-05, AE-06, AE-07, AE-08, AE-09 | — | — |
| **quick** | AE-01, AE-02, AE-03, AE-08 | AE-05, AE-07 | AE-04, AE-06, AE-09 |
| **fixer** | AE-02, AE-03 + "what changed, what didn't break" paragraph | AE-07 | rest |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason (e.g., `skipped for track=quick`, or `n/a — materialized=view`). The audit trail must show *what was chosen to skip*, not an implicit gap. See `shared/validation_protocol.md` for the n/a convention.

## When to Escalate

Stop validation and escalate rather than proceeding if:

- AE-03 fails (grain broken) — model is fundamentally wrong, do not ship.
- AE-06 surfaces unexpected fan-out — re-run the join-path protocol, likely a Data Modeller consultation.
- AE-07 surfaces a downstream break that is not trivially fixable — escalate to the owning team before closing the gate.
- Any check produces a result the agent cannot explain — do not mark ✓. Record as `?` and surface in Open Issues.
