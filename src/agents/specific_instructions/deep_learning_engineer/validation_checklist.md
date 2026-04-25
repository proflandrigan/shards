# Deep Learning Engineer Validation Checklist

Applied at the end of any phase that produces or modifies a deep learning model — architecture implementation, training protocol, fine-tuning recipe, or custom DL framework component. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (DL-01 through DL-10) are stable. DL validation has two characteristic concerns beyond standard ML: **training dynamics** (did the network actually learn what it was supposed to learn?) and **mode discipline** (is inference actually in eval mode?). Both have caused real-world bugs invisible to aggregate metrics.

## DL-01 — Single-Batch Overfit Sanity

The model can memorize a single batch (or a very small dataset) to near-zero training loss.

- Disable regularization (weight decay, dropout), use a small batch (8-64), train many epochs.
- If the model *cannot* overfit a small batch, the architecture or loss function is broken — no amount of data will save it.
- This is the cheapest, fastest bug-catcher in DL and must be the first thing run on any new model.

**Observed format:** `single-batch (n=32) overfit test: train loss 2.31 → 0.003 in 200 steps | model capacity sufficient ✓ | log: results/overfit_sanity.log`

## DL-02 — Gradient Flow

Gradients flow through the network as expected: no vanishing, no exploding, no dead units.

- Log gradient norm per layer or per parameter group during the first 100-1000 training steps.
- Flag: layers with gradient norms orders of magnitude smaller than the rest (vanishing), norms exploding above reasonable thresholds (exploding), or a growing fraction of zero gradients (dead ReLUs).
- Record the fix if any pathology was found (gradient clipping threshold, initialization change, skip connection added).

**Observed format:** `gradient norms tracked first 1000 steps | min layer norm 3.2e-4, max 2.7 (no explosion, no vanishing across 24 layers) | dead units: <0.5% at init, stable at 1.1% after 10k steps ✓ | plot: results/gradient_norms.png`

## DL-03 — Loss Curves Match Expectation

Training and validation loss curves behave the way the architecture and training regime predict.

- Training loss decreases smoothly (or with expected schedule artifacts — warmup, restarts).
- Validation loss tracks training for a reasonable portion, then diverges if overfitting begins (expected with the chosen regularization).
- Flag: training loss not decreasing (broken loss/gradients), val loss immediately diverging (regularization too weak), both curves flat (optimization broken).

**Observed format:** `train loss: 4.2 → 0.38 over 50 epochs, monotone after warmup | val loss: 4.3 → 0.51, plateau at epoch 42 (early stop) | gap curves expected under 0.1 weight-decay + 0.1 dropout ✓ | plots: results/loss_curves.png`

## DL-04 — Train / Val / Test Performance

Primary metrics measured on all three splits, with val-test agreement confirming the val split was not overfit via tuning.

- Report primary metric on train, val, test.
- Val → test generalization gap: if tuning was extensive on val, confirm test performance tracks val (not a huge drop).
- For iteration: diff against prior version's metrics on all three splits.

**Observed format:** `train acc 98.2% / val acc 84.7% / test acc 84.1% | val-test gap 0.6pp (healthy; extensive val tuning didn't overfit it) | prior version: test 82.4%, delta +1.7pp ✓`

## DL-05 — Inference Mode Discipline

Inference is actually in inference mode — batchnorm / dropout / layernorm behaviors are correct for the deployment path.

- `model.eval()` called before inference; confirmed by asserting `model.training == False`.
- Batchnorm uses running statistics, not batch statistics.
- Dropout is disabled.
- If using mixed-precision or quantization in inference, confirm the inference path is tested at the target precision/quantization, not just at training precision.

**Observed format:** `inference path: model.eval() asserted in wrapper, tested at fp32 and fp16 | BN running stats used (spot-check: 8 samples produce same output with batch_size=1 and batch_size=8) | dropout: disabled (output deterministic on same input) ✓`

## DL-06 — Reproducibility

Given pinned seeds, environment, and data splits, training produces the same (or bounded-variance) result.

- Seeds pinned: dataset split, model init, DataLoader shuffling, augmentation, optimizer stochasticity.
- CUDA determinism flags set where reproducibility is required (`torch.use_deterministic_algorithms(True)` + `CUBLAS_WORKSPACE_CONFIG`).
- Multi-seed runs to characterize genuine variance where full determinism is impractical (e.g., multi-GPU training).

**Observed format:** `seeds pinned: dataset, model, dataloader, aug, optimizer | torch.use_deterministic_algorithms(True), warn_only=False | 3-seed re-run: test acc 84.1/84.3/83.9 (σ=0.17pp, within reported CI) ✓ | repro command: make train-seed42`

## DL-07 — Performance Budget

Compute and memory fit the deployment or research budget.

- Inference: latency p50 and p99 on target hardware with representative batch size.
- Memory: peak inference memory and training memory.
- Training: wall-clock per epoch, total training cost (GPU-hours).

**Observed format:** `inference: p50=8ms, p99=22ms on A10G, batch=1; peak mem 1.2GB | training: 14min/epoch × 50 epochs = 11.7 GPU-hours on 1×A100 80GB | budget: inference <50ms ✓, training <20 GPU-hours ✓`

## DL-08 — Model Card

A model card describing the trained artifact exists and is complete.

- Card references `src/templates/model-card.md` structure.
- Includes: intended use, training data, evaluation results (linking to this validation section), known limitations, ethical considerations (escalate to Academic for review if deployment is user-facing).
- For iteration: card updated, not appended to stale prior-version card.

**Observed format:** `model card: services/<project>/MODEL_CARD.md (v2.0 for this version) | sections: intended use ✓, training data ✓, eval (refs §Validation here) ✓, limitations ✓, Academic-reviewed on 2026-04-20 ✓`

## DL-09 — Component Tests

Non-training code components have unit tests.

- Minimum: forward pass on dummy input (shape & dtype), data loader + collate function, loss function on known inputs, metric computation parity with reference implementation.
- For custom CUDA / autograd / scheduler components: additional tests for gradient correctness (e.g., `torch.autograd.gradcheck`).
- Tests live on disk and exit zero.

**Observed format:** `tests/: 18 tests, 18 passed | forward_pass (shape+dtype), dataloader (batching+collate), loss (reference parity on 5 fixtures), metric (sklearn parity), scheduler (warmup + cosine schedule), gradcheck (custom attention module) ✓`

## DL-10 — Artifact Integrity

The saved model artifact loads cleanly on a fresh kernel and produces the expected predictions on a fixture input.

- `torch.load()` / `safetensors.load()` / framework-equivalent succeeds without warnings.
- Loaded model produces byte-identical (fp32) or tolerance-bounded (fp16) output on a fixture input vs the in-memory model at save time.
- Artifact metadata (config, tokenizer, preprocessor) saved alongside weights and reloaded together.

**Observed format:** `artifact: services/<project>/checkpoints/v2.0/ — weights.safetensors + config.json + preprocessor/ | load test: fresh kernel, loaded OK, 10 fixture inputs produce bit-identical fp32 outputs vs save-time model ✓ | size 430MB`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `greenfield` (new architecture / training setup) | DL-01, DL-02, DL-04, DL-05, DL-06, DL-08, DL-09, DL-10 | DL-03, DL-07 | — |
| **deep** | `iteration` (modify existing model) | DL-04, DL-05, DL-06, DL-08, DL-09, DL-10 | DL-01 (if architecture changed), DL-02, DL-03, DL-07 | — |
| **deep** | `create` (novel DL framework) | DL-01, DL-02, DL-03, DL-04, DL-06, DL-08, DL-09 | DL-05, DL-07, DL-10 | — |
| **quick** | `experiment` (kept `[X]` iteration) | DL-04 + diff vs prior | DL-03 | most |
| **fixer** | (Mode omitted) | DL-09 + DL-04 diff if the fix touches model outputs | DL-10 | rest |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason. See `shared/validation_protocol.md`.

## Artifacts Expected

- Model checkpoint directory — DL-10
- `tests/` directory — DL-09
- `MODEL_CARD.md` — DL-08
- `results/loss_curves.png`, `results/gradient_norms.png`, `results/overfit_sanity.log` — DL-01, DL-02, DL-03
- Training run config + W&B/MLflow run ID — reproducibility context
- `README.md` with reproduction command — DL-06

## Downstream Impact — What to Cover

- **Serving consumers:** who calls this model's inference endpoint. For iteration: did the output contract change?
- **Training infrastructure:** if compute budget changed, coordinate with MLOps.
- **Model registry / versioning:** if there's a registry, confirm the new artifact is registered and tagged.
- **Academic review:** user-facing models merit ethical review before shipping — escalate for any deployment affecting user decisions.

## When to Escalate

- **DL-01 fails** — architecture or loss is broken. Do not proceed to full training; the model cannot learn.
- **DL-02 gradient pathology that can't be fixed** — consult Applied ML Scientist on architecture choices.
- **DL-05 mode discipline violations in production path** — do not ship; the model will silently misbehave under deployment conditions.
- **DL-06 reproducibility failures with large variance** — investigate root cause before shipping; characterize variance at minimum.
- **DL-10 artifact loading fails or produces different predictions** — do not ship; deployment will produce predictions that differ from what was validated.
- **Any check produces a result the agent cannot explain.** Record as `✗` and surface in Open Issues.
