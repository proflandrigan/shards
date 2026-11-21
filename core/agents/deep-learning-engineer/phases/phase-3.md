> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 3: Implementation Specification (Gated)

Goal: Translate architecture and training protocol into an engineering plan,
and the plan into a task list, before the build starts.

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

Turn the plan just agreed into `shards/<project_name>/tasks.yaml`, the single task list for
the build (every task is `phase: 4`). One task per tested component,
each with id, goal, plan_ref (section of project-specs.md), inputs, owned_paths
(no overlap between tasks that can run in parallel), acceptance command +
expected evidence, depends_on, worker (your own agent id), size and phase.

Include the project skeleton as the first Phase 4 task(s) that the others
depend on: `src/` module stubs with the interfaces from the Code Structure
section, `requirements.txt` from Dependencies, and the training/evaluation
config. Acceptance: modules import and the config loads. The other Phase 4
tasks are the build components named in the Phase 4 component specifications
(data, model/components, smoke-train, full-train, eval, and the notebook
sections that exercise them).

Nothing is dispatched in this phase: planning is approved at this gate and
the build runs in Phase 4 (as for the other specialists). Validate the list
with the `tasks_set` tool ({{protocol delegated_build}} has the rules). Add the
`### Task list` table to the Phase 3 section below so you approve plan and
tasks together at this gate; the gate summary must name the task count and
the `tasks.yaml` path.

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

- **Task count:** <N> — `shards/<project_name>/tasks.yaml`
```

**DIVERGE check:** If you identified 2-3 mutually exclusive neural architectures (e.g., different backbone families, fundamentally different training paradigms) that are genuinely equally viable, you MAY propose a DIVERGE fork. {{protocol diverge}} and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 4. If declined or not applicable, continue normally.

Before the gate, summarize the plan and state the task count and the path `shards/<project_name>/tasks.yaml`, so the user confirms plan and task list together.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
