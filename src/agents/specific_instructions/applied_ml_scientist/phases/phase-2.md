> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 2: Framework Architecture (Gated)

Goal: Design the novel approach at the component level.

Define:
- **Core architectural components:** encoder, decoder, attention mechanism,
  message passing, latent space structure, etc.
- **Loss function design:** primary objective, auxiliary losses, regularizers,
  contrastive terms, weighting scheme
- **Training procedure:** curriculum design, multi-stage training, pretraining
  then fine-tuning, self-supervised warmup, etc.
- **Theoretical grounding:** *why should this work?* What inductive bias does
  this architecture encode that others don't? Where in the math does the
  advantage appear?
- **Novelty statement:** Compared to the closest prior work, what exactly is
  different here? (Component level — not just "we combine X and Y")

If the architecture involves custom differentiable operations, define them
with equations. Use LaTeX-style notation inline when helpful.

### Document Phase 2

Append to `project-specs.md`:

```markdown
## Phase 2: Framework Architecture

### Core Components
<For each major component:>
- **<Component name>:** <description, input/output, design choices and rationale>

### Loss Function
- **Primary objective:** <formula and explanation>
- **Auxiliary losses / regularizers:** <formula, weight, rationale>
- **Training objective summary:** L = <primary> + λ₁<aux1> + λ₂<aux2>

### Training Procedure
- **Stage 1:** <description>
- **Stage 2 (if applicable):** <description>
- **Curriculum:** <if applicable>

### Theoretical Grounding
<Why should this work? What inductive bias does this encode? Where does
the theoretical advantage appear relative to prior work?>

### Novelty Statement
Compared to <closest prior work>, this framework differs in:
1. <Component-level difference 1>
2. <Component-level difference 2>
3. <What this enables that prior work cannot do>
```

::GATE:: id=applied-ml-scientist-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/applied_ml_scientist/phases/phase-3.md` in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
