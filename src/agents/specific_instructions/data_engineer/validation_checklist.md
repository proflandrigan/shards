# Data Engineer Validation Checklist

Applied at the end of any phase that creates or modifies a data pipeline, dbt model, staging/intermediate layer, source ingestion, or warehouse infrastructure. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (DE-01 through DE-09) are stable. Data Engineering validation is pipeline-mechanic focused: contract adherence, re-run correctness, recovery behavior — not the semantic meaning of the data (that's Analytics Engineer territory).

## DE-01 — Schema Contract

Source and output schemas match contracts; any breaking change is explicit.

- For new sources: document the expected schema (column names, types, nullability, semantic meaning) in a `schema.yml` or README.
- For modified models: confirm no downstream-breaking column renames, type changes, or drops without coordination.
- Run `dbt ls --resource-type source --output json` or equivalent to diff against prior schema.

**Observed format:** `source: stripe_invoices v2 | columns: 24 (+2 vs v1, no removals, no type changes) | schema.yml: sources/stripe/schema.yml | downstream diff: 0 breaking ✓`

## DE-02 — Incremental & Full-Refresh Parity

For incremental models, the incremental result equals the full-refresh result.

- Run full-refresh → record row count and a checksum (hash of sorted PKs, or similar).
- Run incremental from a prior state → record row count and checksum.
- Any divergence is a bug in the incremental predicate, uniqueness key, or late-arrival handling.

**Observed format:** `fct_events | full_refresh: 2,481,302 rows, hash=ab3f... | incremental (3-day lookback): 2,481,302 rows, hash=ab3f... ✓` or `n/a (materialized=table)`

## DE-03 — Idempotency

Re-running the pipeline on the same inputs produces the same outputs.

- Run the pipeline end-to-end twice without changing inputs.
- Row counts, hashes, and any side-effect artifacts (e.g., external file writes) must match.
- Flag any non-determinism (unseeded randomness, clock-dependent logic, append-only side effects).

**Observed format:** `run 1: 2,481,302 rows, hash=ab3f... | run 2: 2,481,302 rows, hash=ab3f... ✓ | no side effects outside warehouse`

## DE-04 — Backfill Safety

Re-running a backfill over historical data does not corrupt data already in place.

- Test backfill on a small historical window.
- Verify: row counts match what a from-scratch load would produce, no duplicates, no orphaned records.
- If the pipeline uses `delete+insert` or `merge`, confirm keys are correct.

**Observed format:** `backfill test: Q4-2025 window (92 days) | produced 412,018 rows matching full-refresh reference | no duplicates on PK, no orphans | test script: tests/backfill_smoke.sh`

Skip with `n/a` (+ reason) for append-only streaming sources where backfill is structurally not applicable.

## DE-05 — Data Freshness

Pipeline meets the SLA for data freshness defined in the spec.

- Expected freshness lag (e.g., T+2 hours from source event) recorded.
- Measured on the most recent 24-hour window.
- Any deviation flagged, and the cause documented.

**Observed format:** `SLA: T+4h | measured p50=1h 22m, p99=3h 47m (last 24h) ✓ | source check: stripe webhook delivery p99=40min (well under pipeline budget)`

## DE-06 — Lineage Integrity

The pipeline DAG is valid and complete.

- `dbt compile` / `dbt ls` runs without errors.
- Every model's upstream dependencies are declared (`ref()`, `source()`).
- No circular dependencies.
- No orphaned intermediate models (built but unused).

**Observed format:** `dbt compile: 0 errors | 142 models (14 staging, 81 intermediate, 47 marts) | orphans: 0 | cycles: 0 | DAG: target/graph.gpickle`

## DE-07 — Failure Recovery

Partial failures do not corrupt downstream state.

- Simulate a mid-run failure (kill process during a step) and confirm: no partial writes committed, no lock or state file left behind, re-run from the failure point completes cleanly.
- Transactions/commits are at boundaries that preserve atomicity.

**Observed format:** `failure test: killed at intermediate step 4/7 | no partial writes in target schema (verified via checksum) | re-run completed cleanly | state file cleaned on abort ✓`

Skip with `n/a` (+ reason) for truly stateless, idempotent-by-construction pipelines where failure recovery is trivial.

## DE-08 — Tests on Disk

Schema tests (dbt `data_tests`) and unit tests for custom logic exist and pass.

- `schema.yml` tests at minimum: `unique` on PKs, `not_null` on required columns, `relationships` for FKs.
- Custom generic tests for business rules.
- Python unit tests for custom macros, Python models, or non-SQL transform logic.
- `dbt test` exits zero; `pytest tests/` exits zero where applicable.

**Observed format:** `dbt test: 87 tests passed (unique, not_null, relationships, custom) | pytest tests/: 11 tests passed | test file: tests/, schema.yml`

## DE-09 — Observability Hooks

Logging, metrics, and alerting necessary to operate the pipeline are in place.

- Structured logs on key boundaries (run start/end, row counts, errors).
- Freshness alerts or monitors configured (even if just Slack webhooks).
- Runbook notes where to look when it breaks.

**Observed format:** `logging: structured JSON to warehouse audit table | metrics: dbt artifacts uploaded to <observer> | alerts: Slack #data-pipelines on freshness >1.5× SLA | runbook: docs/runbooks/stripe_pipeline.md`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `greenfield` (new pipeline/source) | DE-01, DE-02, DE-03, DE-04, DE-05, DE-06, DE-08, DE-09 | DE-07 | — |
| **deep** | `iteration` (modify existing) | DE-01, DE-02, DE-03, DE-06, DE-08 | DE-04, DE-05, DE-07, DE-09 | — |
| **quick** | `fix` (bug fix or small change) | DE-01, DE-03, DE-08 | DE-02, DE-06 | rest |
| **fixer** | (Mode omitted) | DE-03 + DE-08 + "what changed, what didn't break" | DE-01 | rest |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason. See `shared/validation_protocol.md`.

## Artifacts Expected

- `schema.yml` entries for sources and models — DE-01, DE-08
- `tests/` directory — DE-08
- `models/staging/<source>/` + `models/intermediate/` + `models/marts/` SQL files
- Runbook: `docs/runbooks/<pipeline>.md` — DE-09
- Freshness/monitoring config — DE-05, DE-09

## Downstream Impact — What to Cover

- **Analytics Engineer marts** consuming changed staging/intermediate models — name each, confirm still builds.
- **Data Science / ML feature pipelines** consuming raw or intermediate tables — name each, confirm no contract break.
- **Operational consumers** (reverse-ETL, API feeds, alerting) — if the pipeline feeds any of these, confirm they still receive valid data.

## When to Escalate

- **DE-02 parity failures that can't be resolved** — consult Analytics Engineer on the incremental logic; the issue may be semantic not mechanical.
- **DE-06 cycle or broken lineage** — stop and consult Data Modeller; the entity design may be broken.
- **DE-04 backfill produces different data than full refresh** — the pipeline has non-determinism; investigate before shipping.
- **DE-01 breaking schema changes with active downstream consumers** — coordinate with consumers before shipping; don't unilaterally break contracts.
