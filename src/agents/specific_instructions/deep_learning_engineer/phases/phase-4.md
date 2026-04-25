> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 4: Execute (Gated)

Goal: Build the model implementation.

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

### Incremental testing — checkpoint gates between components

Follow `.claude/agents/specific_instructions/shared/incremental_testing.md` during this build. Each component below is a checkpoint seam — after you write and execute a component, emit a `kind=checkpoint` gate fence (template below) and wait for user confirmation before starting the next component. Do not leave run-all until the end: test each component in isolation as you build it.

Checkpoint gate fence — emit exactly this shape. Both `::GATE::` and `::ENDGATE::` fences are required, as are all three attributes (`id`, `phase`, `kind`). No prose outside the fence.

```
::GATE:: id=<agent-name>-phase-<N>-checkpoint-<component> phase=<N> kind=checkpoint
Component: <human-readable name>
Test command: <exact command you ran>
Evidence:
  - <measured fact 1, e.g. "df.shape = (48211, 47)">
  - <measured fact 2, e.g. "null rate on join key = 0.00%">
  - <measured fact 3, e.g. "sample head matches expected schema">
Status: PASS | FAIL — <one-line summary>
Next: <what you'll build after this is confirmed>
Stop here — await explicit confirmation before writing the next component.
::ENDGATE::
```

Expected checkpoint gate IDs for this phase (emit in order as you build):

- `deep-learning-engineer-phase-4-checkpoint-data` — dataset load + sample batch visualization; shape assertions hold; class distribution (if classification) matches prior.
- `deep-learning-engineer-phase-4-checkpoint-forward` — model forward pass on a dummy batch; shapes at each component match expectation; no NaNs.
- `deep-learning-engineer-phase-4-checkpoint-smoke-train` — smoke-fit on ≤1% of data for a handful of epochs; loss decreases, gradient norms finite; tiny-batch overfitting sanity check passes.
- `deep-learning-engineer-phase-4-checkpoint-full-train` — full training completes on target hardware; peak memory within budget; best validation metric logged.
- `deep-learning-engineer-phase-4-checkpoint-eval` — evaluation + diagnostics (gradient history, activation stats, dead-neuron check) produced and reviewed.

The hook blocks all non-read tools while a checkpoint is open. If a checkpoint fails, diagnose and re-emit with updated evidence before advancing. Use the fence body format shown above (Component / Test command / Evidence / Status / Next).

Then create:

**`models/<project_name>/notebooks/model_development.ipynb`**

Structure:
1. **Setup** — imports, config load, device setup, seed setting
2. **Dataset Sanity Check** — data loading, shape assertions, sample batch
   visualization, class distribution (if classification)
3. **Model Trace** — instantiate model, run forward pass with dummy input,
   print shape at each major component via hooks or explicit prints
4. **Training Loop** — full training with logging: loss, eval metric, gradient
   norm, LR per epoch; inline loss curves after training
5. **Evaluation** — metric table vs baseline, confusion matrix or equivalent,
   per-class breakdown if applicable
6. **Diagnostics** — gradient norm history plot, activation statistics,
   loss curve analysis, dead neuron check (if ReLU backbone)

**`models/<project_name>/src/model.py`**
- Every `forward()` method has a shape comment on the return tensor
- No magic numbers — all sizes come from config
- Normalization and dropout layers instantiated in `__init__`, applied in `forward()`

**`models/<project_name>/src/dataset.py`**
- `Dataset` class with `__len__` and `__getitem__`
- Transform pipeline built from Phase 2 augmentation table
- `get_dataloaders(config)` convenience function

**`models/<project_name>/src/train.py`**
- `train_epoch(model, loader, optimizer, scheduler, device)` function
- Optimizer and scheduler construction
- Checkpoint logic: save best validation metric, load from checkpoint

**`models/<project_name>/src/evaluate.py`**
- `evaluate(model, loader, device)` evaluation loop
- Primary and secondary metric computation
- `predict(model, sample, device)` single-sample inference function

**`models/<project_name>/configs/config.yaml`**
- All hyperparameters from Phases 1, 2, and 3
- No hardcoded values in src/ — everything references config

**`models/<project_name>/requirements.txt`**
- Pinned major dependencies (torch==X.Y, torchvision==X.Y, etc.)

### Document Phase 4

Append to `project-specs.md`:

```markdown
## Phase 4: Build Log

- **Notebook:** `notebooks/model_development.ipynb`
- **Source modules:** model.py, dataset.py, train.py, evaluate.py
- **Training run summary:**
  - Hardware: <GPU model, VRAM>
  - Precision: <bf16 | fp16 | fp32>
  - Effective batch size: <N>
  - Steps / epochs: <N>
  - Peak GPU memory: ~<X>GB
  - Loss trajectory: <converged at epoch N | diverged | oscillating — describe>
  - Best validation metric: <metric name>=<value> at epoch <N>
- **Baseline comparison:**
  | Model | <Metric> | Notes |
  |-------|---------|-------|
  | Baseline (<type>) | <value> | — |
  | **Ours** | <value> | — |
- **Gradient diagnostics:** <healthy convergence | anomalies observed — describe>
- **Known implementation limitations:** <what prototype doesn't handle>
```

::GATE:: id=deep-learning-engineer-phase-4 phase=4 kind=phase validates=deep_learning_engineer
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/deep_learning_engineer/phases/phase-5.md` in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
