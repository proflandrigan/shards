> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

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

::GATE:: id=deep-learning-engineer-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/deep_learning_engineer/phases/phase-3.md` in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
