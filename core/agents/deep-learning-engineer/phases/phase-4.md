> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 4: Execute (Gated)

Goal: Build the model implementation.

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

{{protocol delegated_build}}

You are the lead of this build. The model is built as delegated tasks, one
tested component each; you dispatch, verify and record.

### Component specifications

Task cards cite these sections via `plan_ref`; workers only see the sections a
card references. Components, in build order (each is one task, or a short chain
of tasks):

- `data` — dataset load + sample batch visualization; shape assertions hold; class distribution (if classification) matches prior.
- `forward` — model forward pass on a dummy batch; shapes at each component match expectation; no NaNs.
- `smoke-train` — smoke-fit on ≤1% of data for a handful of epochs; loss decreases, gradient norms finite; tiny-batch overfitting sanity check passes.
- `full-train` — full training completes on target hardware; peak memory within budget; best validation metric logged.
- `eval` — evaluation + diagnostics (gradient history, activation stats, dead-neuron check) produced and reviewed.

**`models/<project_name>/notebooks/model_development.ipynb`** — sections (one
task per section group, chained by `depends_on` since they share the notebook
file):
1. **Setup** — imports, config load, device setup, seed setting
2. **Dataset Sanity Check** — data loading, shape assertions, sample batch
   visualization, class distribution (if classification)
3. **Model Trace** — instantiate model, run forward pass with dummy input,
   print shape at each major component via hooks or explicit prints
4. **Training Loop** — training with logging: loss, eval metric, gradient
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

**Task evidence guidance:** {{protocol incremental_testing}} Per-task evidence
should carry the exact test command and measured facts (for example
`df.shape = (48211, 47)`, `null rate on join key = 0.00%`, sample head matches
expected schema). Test each component in isolation when its task completes.

### Lead loop

{{delegate tasks=models/<project_name>/tasks.yaml max_parallel=3}}

Dispatch only tasks with `phase: 4` from the single `tasks.yaml` written
by the plan phase (the other phase's tasks are not dispatched here).

1. **Load** the task list approved at the plan gate (call `tasks_set`; fix and
   re-validate if it is rejected).
2. **Dispatch** ready `phase: 4` tasks (`task_dispatch`) in parallel up to
   `max_parallel=3`. Tasks that write to the same file (for example the
   notebook) must be ordered by `depends_on`.
3. **Collect** each worker's result via `task_report`.
4. **Verify before counting.** For every report, re-run (or independently
   check) the acceptance command and compare the output with the `plan_ref`
   spec. Then write a per-task evidence row to the `## Validation` Evidence
   table (Check = task id + component, Expected, Observed, Pass/Fail), with the
   exact command and measured facts (for example `df.shape = (48211, 47)`,
   output shapes, loss values). Never mark a task done on the worker's word
   alone.
5. **On failure** re-dispatch with the failure output as feedback, at most 2
   retries; then stop and ask the user with a summary.
6. **Deviations** or a plan that cannot be met: pause dependent tasks and follow
   {{protocol plan_drift}}; amend the plan only via a confirmed gate.
7. **Dispatch** tasks unblocked by done tasks until all `phase: 4` tasks
   are done.
8. You write no build code yourself except for `delegate: inline` tasks.

**Final integration check (lead, after all tasks are done):** restart the kernel and run `model_development.ipynb` top to bottom, confirm `src/` modules import and `configs/config.yaml` drives every hyperparameter, and that results match the training run summary you will document. Record
the result as an evidence row before the gate.

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

{{gate kind=phase validates=deep-learning-engineer}}

---

## When this gate is confirmed

{{phase 5}} in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
