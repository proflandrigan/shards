> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 3: Implementation Specification (Gated)

Goal: Translate architecture and training protocol into an engineering plan,
then scaffold it as delegated tasks.

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

### Decompose the plan into tasks

Turn the plan just agreed into `models/<project_name>/tasks.yaml`, the single task list for
Phases 3 and 4 (tasks are grouped by `phase:`). One task per tested component,
each with id, goal, plan_ref (section of project-specs.md), inputs, owned_paths
(no overlap between tasks that can run in parallel), acceptance command +
expected evidence, depends_on, worker (your own agent id), size and phase.

- `phase: 3` tasks: scaffold the project skeleton: `src/` stubs (`model.py`, `dataset.py`, `train.py`, `evaluate.py`) with the signatures from the Code Structure section, `configs/config.yaml` with all Phase 1-3 hyperparameters, and `requirements.txt`. Acceptance: modules import and the config loads.
- `phase: 4` tasks: the build components named in the Phase 4 component
  specifications (data, model/components, smoke-train, full-train, eval, and
  the notebook sections that exercise them). Phase 4 dispatches these after
  this gate is confirmed.

Validate with the `tasks_set` tool ({{protocol delegated_build}} has the
rules). Add the `### Task list` table to the Phase 3 section below so you
approve plan and tasks together at this gate; the gate summary must name the
task count and the `tasks.yaml` path.

### Lead loop

{{delegate tasks=models/<project_name>/tasks.yaml max_parallel=3}}

{{protocol delegated_build}} Dispatch only tasks with `phase: 3` here (Phase
4 tasks wait for the next phase).

1. **Load** the task list (call `tasks_set`; fix and re-validate if rejected).
2. **Dispatch** ready `phase: 3` tasks (`task_dispatch`) in parallel up to
   `max_parallel=3`.
3. **Collect** each worker's result via `task_report`.
4. **Verify before counting.** Re-run (or independently check) each acceptance
   command and compare with the `plan_ref` spec, then write a per-task evidence
   row to the `## Validation` Evidence table (Check = task id + component,
   Expected, Observed, Pass/Fail). Never mark a task done on the worker's word
   alone.
5. **On failure** re-dispatch with the failure output as feedback, at most 2
   retries; then stop and ask the user with a summary.
6. **Deviations**: pause dependents and follow {{protocol plan_drift}}; amend
   the plan only via a confirmed gate.
7. **Dispatch** unblocked tasks until all `phase: 3` tasks are done.
8. You write no build code yourself except for `delegate: inline` tasks.

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

### Task list

| id | goal | owned paths | acceptance | depends_on |
|----|------|-------------|------------|------------|
| <task id> | <goal> | <owned paths> | <acceptance command and expected evidence> | <ids or none> |

- **Task count:** <N> — `services/<project_name>/tasks.yaml`
```

**DIVERGE check:** If you identified 2-3 mutually exclusive neural architectures (e.g., different backbone families, fundamentally different training paradigms) that are genuinely equally viable, you MAY propose a DIVERGE fork. {{protocol diverge}} and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 4. If declined or not applicable, continue normally.

Before the gate, summarize the plan and state the task count and the path `services/<project_name>/tasks.yaml`, so the user confirms plan and task list together.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
