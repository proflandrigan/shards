# Applied ML Scientist Validation Checklist

Applied at the end of any phase that produces a novel ML framework, custom training methodology, architecture prototype, or research-oriented ML artifact. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (AMS-01 through AMS-09) are stable. Applied ML Science validation is closer to empirical research than to production engineering: the emphasis is on soundness of claims, reproducibility of results, and rigorous baselines — not deployment readiness.

## AMS-01 — Research Question Precisely Stated

The question being answered is specific, falsifiable, and scoped.

- Statement includes: the phenomenon studied, the hypothesis being tested, the metric that would confirm or refute it, and the scope boundary.
- Vague goals ("improve performance") are rewritten as specific ("reduce validation loss by ≥5% vs baseline on benchmark X under compute budget Y").

**Observed format:** `question: "Does contrastive pretraining on task-adjacent unlabeled data reduce few-shot classification error on benchmark B by ≥10% at 100 labels, relative to supervised-only baseline?" | scope: benchmark B only; claims do not generalize to other benchmarks without separate validation`

## AMS-02 — Baselines Rigorous

Comparisons include both trivial baselines and strong SOTA baselines where applicable.

- Trivial: random, majority class, nearest-neighbor, linear probe.
- Strong: current best-known published method or the best internal method — reproduced in the same evaluation harness, not quoted from paper.
- Baseline code and configs on disk; runs repeatable.

**Observed format:** `baselines: linear probe (trivial), SimCLR v2 (SOTA reproduced locally on same harness), supervised-only (direct comparison) | baseline configs: configs/baselines/ | reported: all three on identical eval splits`

## AMS-03 — Ablation Studies

The novel method's claimed source of improvement is isolated.

- For every non-trivial design choice claimed to contribute (loss term, architecture component, training technique): an ablation run with that choice removed/altered.
- Each ablation reports the headline metric, so contribution can be attributed.
- Negative-result ablations (design choices that didn't help) also reported.

**Observed format:** `5 design choices → 5 ablations run | contribution breakdown: contrastive_loss +4.2pp, temperature=0.1 +1.8pp, projection_head +0.7pp, aug_policy +2.1pp, batch_size ≥1024 +0.5pp | negative: momentum_encoder -0.3pp (removed from final) | results/ablations.json`

## AMS-04 — Statistical Significance of Improvements

Claimed improvements are statistically meaningful given the variance of the training setup.

- Multiple training runs with different seeds (≥3, ideally ≥5 for small-data regimes).
- Mean ± std reported, not single-run numbers.
- Paired tests or bootstrapped CIs used when comparing methods — a single percentage-point improvement within run-to-run variance is not a finding.

**Observed format:** `5 seeds per method | novel: 78.4% ± 0.8% | SOTA baseline: 74.1% ± 1.1% | paired t-test p=0.003, 95% CI on delta = [3.1%, 5.5%] | results/seed_variance.json`

## AMS-05 — Theoretical Soundness (for novel methods)

For frameworks with theoretical claims, the math checks out and assumptions are stated.

- Derivations reviewed for errors. Consult the Researcher via Task for statistical methodology claims.
- Assumptions named (stationarity, independence, convexity, smoothness, i.i.d.).
- Counterexamples to claimed properties probed where feasible.
- Empirical results consistent with theoretical predictions (or discrepancy explained).

**Observed format:** `derivation: notes/derivation.md §2-4, reviewed by Researcher via Task (verdict APPROVED) | assumptions: data is i.i.d. sub-Gaussian (stated), bounded loss, smooth encoder | empirical-theoretical gap: convergence rate ~O(1/√T) matches theory within constants ✓`

Skip with `n/a` for purely empirical studies with no theoretical claims.

## AMS-06 — Reproducibility: Seed, Environment, Data

A collaborator (or future-you in three months) can reproduce the headline numbers from the committed artifacts.

- All seeds pinned (data split, model init, trainer, any augmentation sampler).
- Environment captured: `requirements.txt` with pinned versions, hardware spec, CUDA version where relevant.
- Data: exact split definition on disk (manifest of IDs or deterministic split rule).
- A single `README.md` command reproduces the headline number.

**Observed format:** `seeds=[42,43,44,45,46] | env: research/<project>/env/requirements.txt (pinned) | hardware: 4×A100 80GB, CUDA 12.1 | data manifest: data/splits/manifest_v3.json | repro command: make repro in README; re-run produced 78.3% vs reported 78.4% (within seed variance) ✓`

## AMS-07 — Training Dynamics Documented

Training curves, gradient behavior, and any instabilities are recorded — not just the final number.

- Loss curves (train + val), gradient norms, learning rate schedule captured in logs.
- Instabilities (NaNs, divergence, plateaus) noted and their treatment described.
- If training was unstable to reproduce (large seed variance), that is itself the finding — do not hide it.

**Observed format:** `W&B run IDs: [run_a8f, run_b2c, run_3dd, run_91e, run_44f] | loss curves monotone after epoch 5, val plateau epoch 80 (used for early stop) | 1 NaN observed on seed=44 run (gradient clip threshold too loose initially, fixed) | plots: results/training_curves.png`

## AMS-08 — Code on Disk + Component Tests

The research code is written as testable modules, not notebook-only, and key components have tests.

- Research code under version control (or at least a clear source-of-truth directory).
- Unit tests for: loss functions, custom modules, data augmentation, eval scorers.
- "It ran once in my notebook" is not enough — research that cannot be re-run in a clean environment is not validated.

**Observed format:** `research/<project>/src/ on disk (not notebook-only) | tests/: 17 tests, 17 passed | covered: contrastive_loss (forward + gradient), projection_head (output shape + init), aug_pipeline (determinism with seed), eval_scorer (parity with reference impl)`

## AMS-09 — Scope and Negative Claims

Scope boundaries are stated, and negative results or known failure modes are reported.

- Where does the method work? Where has it been tested?
- Where does it not work, or where is it untested? (Different domain, different scale, different task.)
- Any negative results from the study are reported, not suppressed.

**Observed format:** `scope: benchmark B, scale 10k-100k labels, image-classification task family | untested: language, tabular, outside-scale | negative result: on fine-grained subset (benchmark B-fine), method regresses by 2.3pp — reported in paper §6 | limits discussion: report §7`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `create` (novel framework from scratch) | AMS-01, AMS-02, AMS-03, AMS-04, AMS-06, AMS-07, AMS-08, AMS-09 | AMS-05 | — |
| **deep** | `review` (methodology review / advisory writeup) | AMS-01, AMS-02, AMS-05, AMS-09 | AMS-03 | AMS-04, AMS-06, AMS-07, AMS-08 (no new artifacts) |
| **quick** | `experiment` (kept `[X]` iteration) | AMS-04 (seed variance for the kept change) + diff vs prior | AMS-07 | most |
| **fixer** | (Mode omitted) | AMS-08 + "what changed, what didn't break" | — | rest |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason. See `shared/validation_protocol.md`.

## Artifacts Expected

- Research code directory under `research/<project>/` — AMS-08
- `tests/` directory — AMS-08
- `results/ablations.json`, `results/seed_variance.json` — AMS-03, AMS-04
- `results/training_curves.png` + W&B/MLflow run manifest — AMS-07
- `README.md` with reproduction command — AMS-06
- Paper/report draft referencing all evidence — consolidates the claims

## Downstream Impact — What to Cover

- **Production adopters:** if the method will be productionized, flag for ML Engineer and Deep Learning Engineer — this checklist is research-grade, not production-grade.
- **Published claims:** if results will be published, Academic review via Task before release.
- **Shared infrastructure:** if the method imposes new compute requirements, flag for MLOps.

## When to Escalate

- **AMS-04 improvement falls within seed variance** — claim is not supported; do not ship as a positive result. Either run more seeds or reframe as exploratory.
- **AMS-05 theoretical claims fail review** — rewrite as empirical with no theoretical framing, or retract the claim.
- **AMS-06 reproduction fails (headline number can't be reproduced)** — halt. This is the most serious failure mode in research; find and fix the source of non-determinism before making any claims.
- **AMS-09 scope claims that can't be defended** — narrow the scope until they can.
- **Any check produces a result the agent cannot explain.** Record as `✗` and surface in Open Issues.
