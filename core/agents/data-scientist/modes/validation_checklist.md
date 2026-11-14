# Data Scientist Validation Checklist

Applied at the end of any phase that produces an analytical artifact (notebook, report, predictive model, feature table) that stakeholders will act on. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (DS-01 through DS-12) are stable. Data Science validation blends data integrity, statistical methodology, and claims traceability — all three must be exercised.

## Data & EDA

### DS-01 — Data Provenance & Contract

The source query or dataset is documented, reproducible, and stable between runs.

- The SQL or loading code lives on disk (in a `sql/` file, notebook cell, or pipeline module) — not just in memory.
- Row count is stable on re-run, or the variance is characterized (e.g., "live data, +1-3% per day").
- Schema matches what the analysis assumes. Unexpected columns or missing columns are a bug.

**Observed format:** `source: sql/revenue_pull.sql | rows: 184,302 | rerun_delta: +12 rows (< 0.01%) ✓ | schema_diff: none`

### DS-02 — Missingness Map

Null rates per column are characterized and the treatment decision is documented.

- Per-column null count and rate reported.
- Pattern classification: MCAR (missing completely at random), MAR (missing at random given covariates), or MNAR (missing not at random) — heuristic is fine; not every analysis needs a formal test.
- For each column with material missingness: treatment choice (drop, impute, model-as-category, ignore) with rationale.

**Observed format:** `47 cols | 3 cols >5% null: shipped_at (12.4%, MNAR-assumed, dropped rows), coupon_code (34%, MCAR, treated as "none"), zip_region (8%, MAR-by-country, imputed with mode within country) | full map: results/missingness_report.json`

### DS-03 — Outlier Assessment

Extreme values in key numeric fields are identified and the decision to treat, exclude, or keep them is documented.

- Method used: IQR, z-score, domain-rule, or visual.
- Count of outliers per variable.
- Decision per variable (keep / winsorize / exclude / log-transform), with justification.

**Observed format:** `revenue: 47 outliers (>3σ), 12 retained (legitimate enterprise deals), 35 winsorized at p99 | session_duration: 89 outliers via IQR rule, all kept (bimodal distribution expected) | details: notebook §2.3`

### DS-04 — Segment Coverage

Key business segments are represented in the data with sufficient sample size for the conclusions drawn.

- Segments come from the analysis spec (e.g., country, product tier, customer cohort).
- Any segment with N below the power threshold for the statistical tests being run is flagged.
- Conclusions for flagged segments are either removed or explicitly labeled as underpowered.

**Observed format:** `6 segments analyzed | all N > 400 (power for detecting Cohen's d=0.2 at α=0.05) ✓` or `segment "enterprise-APAC" N=38 — conclusions for this segment removed, flagged in report §4`

## Statistical & Analytical Rigor

### DS-05 — Assumption Checks

Statistical methods used have their assumptions verified (or violations acknowledged).

- For each test/model used, list assumptions checked: normality, independence, homoscedasticity, stationarity, linearity, multicollinearity as applicable.
- Use diagnostic plots or tests (Shapiro-Wilk, Breusch-Pagan, Durbin-Watson, VIF) appropriate to sample size.
- If an assumption is violated, either switch to a robust/non-parametric method or explicitly note the caveat in the report.

**Observed format:** `linear regression on log-revenue: residual normality (Shapiro p=0.18) ✓, homoscedasticity (BP p=0.34) ✓, VIF max=2.8 (no collinearity) ✓ | diagnostic plots: notebook §3.2`

Consult the Researcher via Task if assumption checks surface a methodology choice that seems wrong.

### DS-06 — Multiple Comparisons

When multiple hypotheses are tested, family-wise error or false-discovery correction is applied — or the decision not to correct is explicitly justified.

- Count of hypotheses tested.
- Correction method (Bonferroni / Holm-Bonferroni / Benjamini-Hochberg FDR) and adjusted threshold.
- If exploratory (no correction), the report must label findings as hypothesis-generating, not confirmatory.

**Observed format:** `12 hypotheses tested | Benjamini-Hochberg FDR at q=0.10 | 3 discoveries survive correction (listed in report §5)` or `n/a — single pre-registered hypothesis`

### DS-07 — Effect Size & Practical Significance

Quantitative findings include effect sizes, not only p-values.

- For comparisons: Cohen's d, odds ratio, lift, or absolute difference with units.
- For regressions: coefficient with CI, standardized coefficient, R² or pseudo-R².
- Conclusions distinguish statistical significance from practical significance ("significant but negligible" is acceptable phrasing when true).

**Observed format:** `treatment effect: +2.3% revenue (95% CI 1.1-3.5%, Cohen's d=0.08, p<0.01) — statistically significant, practically small; recommend holdout for next quarter before scaling`

### DS-08 — Causal vs Correlational Framing

Causal claims require a causal framework; otherwise claims are labeled correlational.

- If the report claims X *causes* Y: a DAG, RCT, quasi-experimental design (diff-in-diff, IV, RDD), or explicit identifying assumptions must be present.
- Without one of the above, rewrite claims as associations ("is associated with", "correlates with"), not "drives" or "causes".
- Spurious-correlation candidates (common confounders) are named and addressed.

**Observed format:** `3 causal claims in draft | 2 supported by RCT (Q2 pricing experiment) — retained | 1 unsupported (feature X → retention) — rewritten as correlational, confounders noted (user tenure, product tier)`

## Modeling (When Applicable)

### DS-09 — Baseline Comparison + Held-Out Metric

Predictive models beat a dumb baseline, measured on a genuinely held-out test set.

- Baseline: mean / median / majority class / logistic-on-top-features, per problem type.
- Metric measured on test split, not train, not val-after-tuning.
- Margin is meaningful relative to business threshold (not just statistically).

**Observed format:** `baseline (logistic on 10 features): AUC=0.64 | model (gbm): AUC=0.79 test (holdout), 0.81 val | lift +0.15 clears spec threshold ✓`

Skip with `n/a` if the analysis is purely descriptive (no predictive model).

### DS-10 — Feature Engineering Correctness

Transformation functions produce what they claim on known inputs.

- Unit tests for every non-trivial transform (date math, rolling windows, categorical encoding, ratio computations).
- Tests live on disk (`tests/test_features.py` or equivalent) and exit zero.
- "The notebook ran" is not a test — the transform's *output* must be asserted against fixtures.

**Observed format:** `tests/test_features.py — 11 tests, 11 passed | covers: days_since_signup, user_ltv_trailing_90d, region_mapping, churn_label | notebook cells reference these functions, not re-implement`

Skip with `n/a` if the analysis uses no engineered features.

## Reproducibility & Claims Integrity

### DS-11 — Notebook Executes End-to-End

The notebook runs top-to-bottom from a clean kernel and produces the same outputs.

- Seeds set where randomness exists (numpy, sklearn, torch).
- "Restart Kernel & Run All" completes without error. Produce this mechanically: in Notebook Walkthrough mode, `python .shards/ui/notebook-kernel.py run-all <session_id>` (restarts the kernel and runs every cell top-to-bottom, stopping at the first failure); standalone, `jupyter nbconvert --execute --to notebook --inplace <notebook>`.
- Key output cells (metrics, headline plots) produce byte-identical or deterministic-within-tolerance output on re-run.

**Observed format:** `Restart & Run All: 47 cells, 4m32s, no errors | seed=42 | headline metrics reproduced to 1e-6 | log: results/notebook_rerun.log`

### DS-12 — Claims-Data Alignment

Every quantitative claim in the report or summary is traceable to a specific query, notebook cell, or figure.

- For each headline number in the final deliverable: which cell / query / table produced it.
- Re-compute at least the top-N headline numbers (N=5 or all, whichever is smaller) directly from the source to confirm.
- Flag any claim that can't be traced — either find the source or remove the claim.

**Observed format:** `14 quantitative claims in report | 14 traced to cells/queries (map: results/claims_map.md) | 5 headline numbers recomputed from source, all match ✓`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `greenfield` (full study) | DS-01, DS-02, DS-03, DS-04, DS-05, DS-06, DS-07, DS-08, DS-11, DS-12 + DS-09 / DS-10 if modeling | — | — |
| **deep** | `handoff` (greenfield-data / ML-engineer handoff) | DS-01, DS-02, DS-03, DS-04, DS-11 | DS-05, DS-12 | DS-06, DS-07, DS-08, DS-09, DS-10 |
| **quick** | `adhoc` (escalated from Data Analyst) | DS-01, DS-02, DS-11, DS-12 | DS-03, DS-07 | rest |
| **quick** | `experiment` (kept `[X]` iteration) | DS-11 + headline metric diff vs prior | DS-12 | rest |
| **fixer** | (Mode omitted) | DS-11, DS-12 + "what changed, what didn't break" | — | rest |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason. See `shared/validation_protocol.md` for the n/a convention.

## Artifacts Expected

For deep-track validation, the `### Artifacts` section should name at least:

- The notebook file itself (`notebooks/<name>.ipynb`) — DS-11
- `tests/` directory or `test_features.py` — DS-10 (when modeling)
- `results/missingness_report.json` — DS-02
- `results/claims_map.md` — DS-12
- Source query file (`sql/<name>.sql`) — DS-01

For studies with modeling, add the ML Engineer's expected artifacts via DS-09.

## Downstream Impact — What to Cover

- **Stakeholders and decisions:** who will act on these findings and what decision is riding on them. A descriptive study informing a roadmap has different impact than a model informing a revenue forecast.
- **Derived artifacts:** if the study produces features later consumed by ML, note the feature definitions and any data contracts created.
- **Reports read by leadership:** flag if executive summary numbers depend on the analysis being reproduced on a different data snapshot later.

## When to Escalate

Stop validation and escalate rather than proceeding if:

- **DS-05 assumptions violated with no robust alternative.** Escalate to Researcher for methodology consultation before continuing.
- **DS-08 causal claims can't be supported.** Rewrite as correlational or remove — do not ship a report with unsupported causal framing.
- **DS-12 surfaces claims that can't be traced.** Find the source or remove the claim; a report with unverifiable numbers is a liability.
- **DS-09 model does not beat baseline meaningfully.** If modeling was the deliverable, return to feature engineering. If the analysis is descriptive and modeling was exploratory, remove model-based conclusions.
- **Any check produces a result the agent cannot explain.** Record as `✗` and surface in Open Issues.
