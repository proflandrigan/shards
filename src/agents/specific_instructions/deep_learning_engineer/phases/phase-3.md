> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

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

**DIVERGE check:** If you identified 2-3 mutually exclusive neural architectures (e.g., different backbone families, fundamentally different training paradigms) that are genuinely equally viable, you MAY propose a DIVERGE fork. Read `.claude/agents/specific_instructions/shared/diverge_protocol.md` and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 4. If declined or not applicable, continue normally.

::GATE:: id=deep-learning-engineer-phase-3 phase=3 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/deep_learning_engineer/phases/phase-4.md` in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
