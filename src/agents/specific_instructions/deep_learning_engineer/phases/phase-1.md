> **Previous:** This is the first phase of the Deep Learning Engineer Create Mode workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

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

::GATE:: id=deep-learning-engineer-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/deep_learning_engineer/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
