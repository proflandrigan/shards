# Deep Learning Engineer — Phased Workflow (Create Mode)

Phases 1 through 6 for the Deep Learning Engineer Create Mode.
Phase 0 (Problem Ingestion) is already complete.
Follow every phase, gate, and documentation rule below.

---

## Create Mode — Phase 1: Architecture Selection (Gated)

Goal: Select and fully specify the architecture before touching training.

1. **Inductive bias analysis:** What structural property does the data have
   (translation equivariance, sequential order, permutation invariance, etc.)?
   What architecture class encodes that bias?

2. **Assess ≥2 backbone candidates.** For each:
   - Inductive bias alignment with data structure
   - Benchmark context (paper, dataset, metric)
   - Memory estimate at target batch size: parameters + activations
   - Known failure modes or instabilities

3. **Select architecture.** Specify the full top-down stack with shapes at
   every major component:
   - Input normalization (if any): type and rationale
   - Backbone: name, variant, pretrained checkpoint (if applicable)
   - Neck (if applicable): FPN, PANet, global average pooling, CLS token
   - Head: structure, dropout, activation, output shape
   - Final output: shape and interpretation

4. **Normalization strategy:** BatchNorm vs LayerNorm vs GroupNorm vs RMSNorm.
   State the rationale — not a preference, a reason tied to batch size and
   data structure.

5. **Parameter count estimate:** Rough count for backbone + head.

### Document Phase 1

Append to `project-specs.md`:

```markdown
## Phase 1: Architecture Selection

### Inductive Bias Analysis
- **Data structure:** <what geometric or sequential property exists>
- **Required bias:** <what the architecture must encode>

### Candidate Comparison
| Backbone | Bias Alignment | Benchmark | Memory @ Batch | Failure Modes |
|---------|---------------|-----------|---------------|---------------|
| <name>  | <1 sentence>  | <paper, dataset, metric> | <params + act> | <known issues> |

### Selected Architecture: <Name>
**Rationale:** <Why this backbone over alternatives, tied to data structure>

**Full Forward Pass (with shapes):**
- Input: <shape, dtype>
- Input norm: <type> → <shape>
- Backbone: <name> → <shape>
- Neck: <type> → <shape> [or N/A]
- Head: <structure> → <output shape>

**Normalization strategy:** <BatchNorm | LayerNorm | GroupNorm | RMSNorm>
**Rationale:** <concrete reason tied to batch size and data>

**Parameter estimate:** ~<N>M total (backbone: ~<X>M, head: ~<Y>M)
```

**GATE: Read Phase 1 back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Create Mode — Phase 2: Training Protocol (Gated)

Goal: Fully specify training before writing a line of code.

Define:

1. **Loss function:** Formula + justification. Why this loss for this task?
   Known failure modes?

2. **Optimizer:** AdamW is the default. State the reason explicitly if
   deviating. Include:
   - Weight decay value and rationale (decoupled from LR per Loshchilov &
     Hutter, 2019)
   - β₁, β₂, ε values if non-default, with rationale

3. **Learning rate schedule:**
   - Warmup: number of steps and rationale
   - Decay strategy: cosine, linear, polynomial — with rationale
   - Peak LR: concrete value with concrete justification (not "tune it")
   - Minimum LR (if applicable)

4. **Regularization:**
   - Dropout: rate and placement (attention dropout vs residual dropout vs
     classifier dropout — these are different)
   - Label smoothing (if classification): value and rationale
   - Stochastic depth (if applicable): survival probability
   - Weight decay already specified in optimizer

5. **Data augmentation table:**

   | Transform | Parameters | Invariance Encoded | Apply to Val? |
   |-----------|-----------|-------------------|---------------|
   | <name>   | <params>  | <what it teaches> | <yes | no>   |

6. **Batch configuration:**
   - Effective batch size (global)
   - Per-GPU batch size
   - Gradient accumulation steps (if VRAM-constrained)

7. **Checkpoint strategy:** best validation metric, every N epochs, or both.

### Document Phase 2

Append to `project-specs.md`:

```markdown
## Phase 2: Training Protocol

### Loss Function
- **Formula:** <L = ...>
- **Justification:** <why this loss for this task>
- **Known failure modes:** <class imbalance, optimization landscape issues, etc.>

### Optimizer
- **Optimizer:** <AdamW | other>
- **Deviation rationale:** <if not AdamW, why>
- **Weight decay:** <value> — <rationale>
- **β₁, β₂, ε:** <values if non-default>

### Learning Rate Schedule
- **Warmup:** <N steps> — <rationale>
- **Decay:** <cosine | linear | polynomial> — <rationale>
- **Peak LR:** <value> — <justification>
- **Minimum LR:** <value or "none">

### Regularization
- **Dropout:** rate=<X>, placement=<where>
- **Label smoothing:** <value | N/A>
- **Stochastic depth:** survival_prob=<X | N/A>

### Augmentation
| Transform | Parameters | Invariance | Val? |
|-----------|-----------|-----------|------|
| <name> | <params> | <invariance> | <yes/no> |

### Batch Configuration
- **Effective batch size:** <N>
- **Per-GPU batch size:** <N>
- **Gradient accumulation:** <N steps | none>

### Checkpoint Strategy
<best val metric | every N epochs | both — rationale>
```

**GATE: Read Phase 2 back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Create Mode — Phase 3: Implementation Specification (Gated)

Goal: Translate architecture and training protocol into an engineering plan.

Define:

1. **Framework:** PyTorch vs JAX with rationale. Not a preference — a reason
   tied to the training procedure (custom CUDA, vmap, multi-host TPU, etc.).

2. **Code structure:** What each `src/` file contains, `forward()` signature
   with input and output shapes, module interfaces.

3. **Hardware config:**
   - fp16 vs bf16: bf16 preferred for most modern GPUs (A100, H100, RTX 30xx+);
     fp16 for older hardware — state the reason
   - Gradient checkpointing: yes if VRAM is constrained; quantify the compute
     overhead
   - `torch.compile`: compatible with the architecture? Expected speedup?

4. **Experiment tracking:** tool (wandb / tensorboard / MLflow), key metrics
   logged per step and per epoch, visualization plan.

5. **Inference plan:** serving format, quantization (int8 / int4 / GPTQ if
   applicable), expected latency delta from quantization.

### Document Phase 3

Append to `project-specs.md`:

```markdown
## Phase 3: Implementation Specification

### Framework
- **Framework:** <PyTorch | JAX>
- **Rationale:** <concrete reason tied to training procedure>

### Code Structure
- **model.py:** <what it contains, forward() signature with shapes>
- **dataset.py:** <Dataset class, transforms, get_dataloaders() fn>
- **train.py:** <training loop, optimizer/scheduler construction, checkpoint logic>
- **evaluate.py:** <evaluation loop, metric computation, predict() fn>
- **configs/config.yaml:** <all hyperparameters from Phases 1-2>

### Hardware Config
- **Precision:** <bf16 | fp16> — <rationale>
- **Gradient checkpointing:** <yes — ~X% compute overhead | no>
- **torch.compile:** <yes — expected ~X% speedup | no — incompatible because>

### Experiment Tracking
- **Tool:** <wandb | tensorboard | MLflow>
- **Metrics per step:** <loss, grad norm, LR>
- **Metrics per epoch:** <val loss, primary metric, secondary metrics>
- **Visualizations:** <loss curves, confusion matrix, attention maps, etc.>

### Inference Plan
- **Serving format:** <ONNX | TorchScript | TensorRT | HuggingFace | none>
- **Quantization:** <int8 | int4 | none> — <latency delta estimate>
- **Expected inference latency:** ~<X>ms per sample on <hardware>
```

**GATE: Read Phase 3 back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Create Mode — Phase 4: Execute (Gated)

Goal: Build the model implementation.

Offer `/compact` before building if the conversation is long. Then create:

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

**GATE: Read the Phase 4 build log back to the user. Stop here — do not begin Phase 5 or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Create Mode — Phase 5: Review and Handoff (Gated)

Goal: Dual specialist review before writing the final report.

Both reviews happen before writing `report.md`. If either raises a blocking
concern, discuss with the user and revise before proceeding.

**ML Engineer review (production infrastructure and deployment feasibility):**

Tell the user: "Requesting ML Engineer review for production infrastructure
and deployment feasibility..."

```
Task(
  subagent_type="ml-engineer",
  description="Production readiness review for deep learning model: <project name>",
  prompt="I am the Deep Learning Engineer shard. I have built a custom deep
  learning model and need a production infrastructure review.

  Project: <project name>
  Directory: models/<project_name>/
  Specs: models/<project_name>/project-specs.md

  Summary:
  - Task: <input/output tensor shapes from Phase 0>
  - Architecture: <selected backbone + head from Phase 1>
  - Parameters: ~<N>M
  - Training: <optimizer, LR schedule, augmentation summary from Phase 2>
  - Hardware: <GPU, precision, gradient checkpointing from Phase 3>
  - Results: <best validation metric vs baseline from Phase 4>
  - Serving format: <from Phase 3>

  Please review for production readiness:
  1. Is the serving format (or absence of one) appropriate for the stated
     latency budget?
  2. Are there infrastructure or pipeline concerns for integrating this model
     into production?
  3. Is the model size and inference cost acceptable for the stated hardware
     constraints?
  4. What monitoring and retraining triggers would you recommend?
  5. Are there production failure modes (data drift, distribution shift,
     cold start) not addressed in the current design?

  Please read project-specs.md for full context."
)
```

**Applied ML Scientist review (methodology soundness and cutting-edge alternatives):**

Tell the user: "Requesting Applied ML Scientist review for methodology soundness
and cutting-edge alternatives assessment..."

```
Task(
  subagent_type="applied-ml-scientist",
  description="Methodology review for deep learning model: <project name>",
  prompt="I am the Deep Learning Engineer shard. I have built a custom deep
  learning model and need a methodology and theory review.

  Project: <project name>
  Directory: models/<project_name>/

  Summary:
  - Task: <problem description and input/output from Phase 0>
  - Core hypothesis: <why this architecture for this data>
  - Architecture: <selected approach from Phase 1>
  - Loss function: <formula and justification from Phase 2>
  - Results: <metric table from Phase 4>

  Please review for methodology soundness:
  1. Is the inductive bias argument for the selected architecture sound given
     the data structure?
  2. Are there recent methods (post-2022) that would clearly outperform this
     approach for this problem type?
  3. Is the loss function well-aligned with the task objective?
  4. Are there theoretical gaps in the training protocol (optimizer choice,
     regularization, augmentation strategy)?
  5. What experiments would most efficiently validate or invalidate the core
     design hypothesis?

  Please read models/<project_name>/project-specs.md for full context."
)
```

**MLOps Engineer review (production platform and operationalization):**

Tell the user: "And finally, asking the MLOps Engineer to review the production
platform requirements and operationalization plan..."

```
Task(
  subagent_type="mlops-engineer",
  description="Production platform review for deep learning model: <project name>",
  prompt="I am the Deep Learning Engineer shard. I have built a custom deep
  learning model and need a production platform and operationalization review.

  Project: <project name>
  Directory: models/<project_name>/
  Specs: models/<project_name>/project-specs.md

  Summary:
  - Architecture: <selected backbone + head from Phase 1>
  - Parameters: ~<N>M
  - Serving format: <from Phase 3>
  - Hardware: <GPU, precision from Phase 3>
  - Results: <best validation metric vs baseline from Phase 4>

  Please review:
  1. Is the serving format appropriate for the stated latency budget and
     operational constraints?
  2. What CI/CD pipeline would you recommend for retraining and model
     registry management?
  3. Is the experiment tracking and model versioning plan sufficient for
     production operation?
  4. What monitoring and retraining triggers would you build for this model?
  5. What infrastructure is needed that isn't yet in the plan?

  Please read project-specs.md for full context."
)
```

Append MLOps Engineer's review to specs.

**Backend Engineer code review (Python artifacts):**

Glob the project directory (`models/<project_name>/`) for `.py` and `.ipynb` files.
If any are found:

Tell the user: "Before we write the report, the Backend Engineer is reviewing
the Python artifacts. Code quality is not optional."

```
Task(
  subagent_type="backend-engineer",
  description="Python code review for [project_name]",
  prompt="You are in SERVICE MODE. Review the following Python files in the
  project at models/[project_name]/. Read project-specs.md first for context.
  Files to review: [list of .py and .ipynb files found]"
)
```

Append the Backend Engineer's review to project-specs.md. If no Python files are
found, skip this step.

**Multi-reviewer conflict protocol:**

If no reviewer returns a blocking verdict (REDESIGN, Revise, or Redesign needed):
→ Proceed to report.md. Document all three verdicts.

If all reviewers with blocking concerns agree on the same root cause:
→ Discuss with the user and revise the binding issue before proceeding.

If reviewers disagree — one or two block while the other(s) do not:
→ Present the conflict explicitly to the user:

  "The reviewers disagree:
   - ML Engineer verdict: [DEPLOY | OPTIMIZE | REDESIGN] — [key reason]
   - Applied ML Scientist verdict: [Sound | Consider Alternatives | Revise] — [key reason]
   - MLOps Engineer verdict: [Approved | Concerns | Redesign needed] — [key reason]

   This is a genuine constraint conflict. Which is the binding constraint for
   this project: production feasibility, methodological rigor, or operational
   readiness? Your answer determines what we fix first."

Document the user's decision in project-specs.md:

**Reviewer conflict resolution:** Production-first | Methodology-first | Operations-first | User override — <rationale>

Then address the binding constraint before proceeding. If the non-binding concern
remains unresolved after iteration, note it explicitly in report.md Limitations.

**Create `models/<project_name>/report.md`:**

```markdown
# <Project Name> — Deep Learning Engineering Report

## System Specification
- **Task:** <input → output>
- **Architecture:** <name, parameter count>
- **Training:** <optimizer, schedule, key regularization>
- **Hardware:** <GPU, precision>

## Architecture Rationale
<Inductive bias argument for the selected architecture. Cite the paper that
established why this architecture class works for this data modality.>

### Candidate Comparison
<Table from Phase 1>

## Training Protocol Rationale
<Justification for optimizer, LR schedule, loss function, and augmentation
choices. Cite papers where relevant (Loshchilov & Hutter, 2019 for decoupled
weight decay; Goyal et al., 2017 for LR scaling, etc.)>

## Results
<Metric table vs baseline from Phase 4>
<Training dynamics: loss trajectory, convergence epoch, gradient norm behavior>
<Ablation results if run>

## Production Readiness
**ML Engineer verdict:** <DEPLOY | OPTIMIZE | REDESIGN>
<Summary of infrastructure and deployment assessment>
<Required changes before production: ordered by priority>

## Methodology Review
**Applied ML Scientist verdict:** <Sound | Consider Alternatives | Revise>
<Summary of theoretical soundness assessment>
<Literature gaps or superior alternatives identified>

## Operations Review
**MLOps Engineer verdict:** <Approved | Concerns | Redesign needed>
<Summary of production platform and operationalization assessment>
<CI/CD, monitoring, and retraining gaps identified>

## Code Review
**Backend Engineer verdict:** <Clean | Minor Issues | Refactor Required | Blocked | N/A — no Python artifacts>
<Summary of code review findings, or "No Python artifacts found.">

## Limitations
<What the current implementation does not handle:>
- <Hardware assumption: trained on X, deployed assumptions unclear>
- <Data quality: assumes Y, not validated for Z>
- <Scale: prototype at N examples; behavior at 10× unknown>

## Next Steps
<Ordered by expected impact:>
1. <experiment or engineering step>
2. <experiment or engineering step>
3. <experiment or engineering step>
```

**GATE: Read Phase 5 summary to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.**

---

