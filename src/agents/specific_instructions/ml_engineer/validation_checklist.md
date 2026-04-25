# ML Engineer Validation Checklist

Applied at the end of any phase that trains, retrains, or modifies a model, its feature pipeline, or its inference path. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (ML-01 through ML-12) are stable — reference them in the evidence table so coverage is auditable over time.

ML validation produces more plot and dump artifacts than typical analytics work. The Evidence table carries headline measurements; full metric dumps, confusion matrices, reliability diagrams, and loss curves belong in `### Artifacts`.

## Data & Feature Integrity

### ML-01 — Feature Contract

All expected features are present with correct types, and feature names match what the inference path expects.

- Feature list comes from the spec or (for iteration) the prior model's feature manifest.
- Verify types — a float-coded category and a true float behave very differently.
- Training-time feature set == inference-time feature set, exactly. Any extras or gaps are a bug.

**Observed format:** `features: 47 expected, 47 present, types matched | diff vs prior: +2 (user_tenure_days, device_class), -0`

### ML-02 — Feature Distribution Stability

Feature distributions on the training data are plausible and, for iteration, stable vs the prior training window.

- For numerics: min, max, mean, p50, p99, null rate.
- For categoricals: cardinality and top-k value share.
- Flag any feature where the distribution shifted materially vs the prior training run (e.g., PSI > 0.2, or a rule-of-thumb 10pp shift in top category share).
- Record the computation location — notebook cell, `data_quality_report.json`, etc.

**Observed format:** `47/47 features within tolerance | 2 flagged: user_session_count (mean 12.3 → 18.7), device_class (new value "tablet_v2" at 3%) | report: results/feature_stats.json`

### ML-03 — Split Integrity

Train / validation / test splits honor the structure of the problem.

- **Temporal problems:** test period is strictly after training period. No future-peeking features.
- **User/entity-level problems:** no user appears in both train and test. Same for group-level splits.
- **Stratification:** class balance and key segment coverage preserved across splits.
- Record the splitting logic and verification query/check.

**Observed format:** `split: temporal, train=[2025-01..2025-09], val=[2025-10], test=[2025-11..2025-12] | user overlap train∩test: 0 | class balance test: 82/18 (train: 83/17) ✓`

### ML-04 — Target Leakage Check

No feature encodes the target in a way that would be unavailable at inference time.

- Run a leakage scan: correlation of each feature with the target; flag anything suspiciously high (|r| > 0.95 for regression, MI > 0.9 for classification unless the feature is a direct proxy by design).
- For each top-importance feature post-training, ask: "Could this value have been produced after the event I'm trying to predict?"
- Temporal leakage: features computed with data from *after* the prediction timestamp.
- Group leakage: features derived from the same entity's label (e.g., target-encoded user_id).

**Observed format:** `leakage scan: 47 features checked, 0 flagged above threshold | top-5 importances reviewed manually, none post-event | report: results/leakage_scan.json`

## Model Quality

### ML-05 — Baseline Comparison

The trained model beats a dumb baseline by a margin that makes the model worth shipping.

- **Classification:** majority class, random, or logistic regression on raw features.
- **Regression:** mean, median, last-known-value, or linear regression.
- **Ranking:** popularity / recency / last-interaction baseline.
- Margin requirement comes from the spec — if unspecified, propose one and confirm with the user.

**Observed format:** `baseline (logistic on top-10 features): AUC=0.67 | model (xgboost): AUC=0.81 | lift: +0.14 (meets spec threshold of +0.05) ✓`

### ML-06 — Headline Metrics on Held-Out Test

Primary and secondary metrics measured on the test split (never training, never validation after tuning).

- Primary metric matches the problem framing (don't report accuracy on a 95/5 class split — use PR-AUC or F1).
- Secondary metrics provide a second angle (precision+recall alongside F1, RMSE alongside MAE).
- Include confidence intervals or bootstrap estimates where sample size permits.
- For iteration: diff against prior version's metrics on the same test set.

**Observed format:** `test PR-AUC: 0.74 (95% CI 0.71-0.77) | test F1@0.5: 0.62 | prior version PR-AUC: 0.68, delta +0.06 ✓ | full metrics: results/eval_metrics.json`

### ML-07 — Slice Performance

Model performs acceptably across slices that matter to the business — not just in aggregate.

- Slices come from the spec: product segments, geography, user tenure buckets, device class, protected attributes where applicable.
- Report headline metric per slice. Flag any slice where performance is materially worse than the aggregate (e.g., >15% relative degradation).
- Catastrophic slice failures (esp. on protected groups) are escalation triggers, not checklist items — see "When to Escalate."

**Observed format:** `slices: 8 reported | worst: new_users PR-AUC=0.61 (-0.13 vs aggregate, within spec tolerance of -0.15) | protected-group parity: within 3pp on all metrics ✓ | breakdown: results/slice_metrics.json`

### ML-08 — Calibration

For probabilistic outputs, predicted probabilities reflect actual frequencies.

- Report Expected Calibration Error (ECE) or reliability diagram bins.
- If outputs are used for thresholding (a decision boundary at 0.5) and are miscalibrated, either recalibrate (Platt / isotonic) or document the mitigation.
- Skip (`n/a`) for models whose outputs are not consumed as probabilities — pure ranking scores, regression point estimates.

**Observed format:** `ECE=0.03 (10 bins, equal-weight) | reliability diagram: results/reliability.png | threshold at 0.5 maps to observed positive rate 0.49 ✓`

## Operational

### ML-09 — Inference Parity

Features computed at inference time match features computed at training time for the same input.

- Spot-check: take N examples from the test set, route them through the production feature pipeline, compare to the training-time feature vectors.
- Tolerable difference = 0 for deterministic features, small rounding for floats.
- Any material disagreement is an offline/online skew bug — escalate to MLOps before shipping.

**Observed format:** `parity check: 1000 samples | disagreement rate: 0.2% (2 samples), all due to float rounding within 1e-6 ✓` or `n/a (inference path == training path, same pipeline module)`

### ML-10 — Performance Budget

Latency, memory, and throughput fit the deployment budget.

- Budget comes from the spec — if unspecified, pin one with the user during Phase 1.
- Measure on representative hardware (not your laptop if it's deploying to a smaller instance).
- Include cold-start and warm-path numbers separately if they differ.

**Observed format:** `latency p50=12ms p99=48ms (budget <100ms) ✓ | memory peak=340MB (budget <512MB) ✓ | throughput: 2,100 req/s single-core`

### ML-11 — Reproducibility

A fresh run from the same code, data, and seed produces the same model artifact and the same test metrics.

- Record the seed(s) used — data split, model init, training loop.
- Verify by re-running training end-to-end (or loading the saved artifact and re-evaluating).
- For non-deterministic training (e.g., stochastic optimizers on GPU), document the tolerance and demonstrate that test metrics agree to that tolerance.

**Observed format:** `seed=42 (split, model, trainer) | re-run test PR-AUC: 0.7401 → 0.7403 (within 1e-3 tolerance for non-deterministic CUDA ops) ✓ | artifact hash: sha256=...`

### ML-12 — Component Tests

Transforms, feature engineering, and the inference path have unit tests that exercise them on known inputs.

- Minimum coverage: every transform function, the inference wrapper's happy path, and at least one edge case (missing feature, unseen category, null input).
- Tests live on disk (`tests/test_<component>.py`) and exit zero on the runner.
- "The notebook ran without error" is not a test.

**Observed format:** `tests/: 14 tests, 14 passed | coverage on src/model/: 87% (transforms 100%, inference 92%, training 68%) | key edge cases: unseen_category, null_feature_vector, empty_batch`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`. Declare both on the `## Validation` section; Mode selects the row within the Track.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `greenfield` | ML-01, ML-03, ML-04, ML-05, ML-06, ML-07, ML-09, ML-11, ML-12 | ML-02, ML-08, ML-10 | — |
| **deep** | `iteration` | ML-01, ML-02, ML-06, ML-07, ML-09, ML-12 | ML-03, ML-05, ML-08, ML-10, ML-11 | ML-04 (if feature set unchanged) |
| **quick** | `experiment` (kept `[X]` iteration) | ML-06 + diff vs prior run | ML-07 | most |
| **fixer** | (none; Mode omitted) | ML-12 + "what changed, what didn't break" + ML-06 diff if the fix touches model outputs | — | rest |

Any skipped check must still appear in the evidence table with `Pass/Fail: n/a` and a Notes cell explaining why (e.g., `skipped for track=quick, mode=experiment — see shared protocol`). The audit trail must show *what was chosen to skip*, not an implicit gap.

For checks that are genuinely not applicable to the model type (e.g., ML-08 calibration on a regression model, ML-09 inference parity when the pipeline module is literally shared between training and serving), use `Pass/Fail: n/a` with the reason in Notes — no "skipped" phrasing needed.

## Artifacts Expected

For deep-track validation, the `### Artifacts` section should name at least:

- `tests/` directory or specific test file(s) — ML-12
- `results/eval_metrics.json` (or equivalent) — ML-06
- Model artifact path + hash — ML-11
- Training run config or command — reproducibility context
- Optional but valued: `results/feature_stats.json` (ML-02), `results/slice_metrics.json` (ML-07), `results/reliability.png` (ML-08), `results/leakage_scan.json` (ML-04)

For iteration, include a diff artifact: `results/diff_vs_<prior_version>.md` summarizing metric deltas and feature changes.

## Downstream Impact — What to Cover

- **Model consumers:** named service(s), ranking pipeline(s), or product surface(s) that call this model. For each: did the prediction contract change? If yes, coordinate a release.
- **Feature store:** if feature schema changed, confirm feature store ingestion still works and that any other models reading these features are unaffected or notified.
- **Downstream ML:** models that consume this model's predictions as input features — rarer but real.
- **Monitoring / alerting:** does the current drift/quality monitoring still apply, or does a new distribution require updated thresholds?

## When to Escalate

Stop validation and escalate rather than proceeding if:

- **ML-04 fails** — target leakage detected. Do not ship. Re-examine feature engineering with the Applied ML Scientist or Data Scientist.
- **ML-05 fails** — model does not beat baseline by the required margin. The work is not ready; return to feature engineering or modeling approach.
- **ML-07 fails catastrophically on a protected or high-stakes slice** — escalate to Academic for ethical review before proceeding. This is a stop condition even if aggregate metrics look good.
- **ML-09 fails** — offline/online feature skew. Escalate to MLOps before shipping; this model will misbehave in production.
- **ML-11 cannot be achieved** — non-reproducible training runs with large metric variance. Investigate before shipping; seed discipline, data ordering, or a genuinely unstable training setup.
- **Any check produces a result the agent cannot explain** — do not mark ✓. Record as `?` in Notes and surface in Open Issues (the evidence row's Pass/Fail must be ✗ per the protocol; `?` is not accepted there).
