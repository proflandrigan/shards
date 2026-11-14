> **Previous:** phase-4.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

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

**Consult Syn for final sign-off:**

Tell the user: "I'm asking Syn to review the deep learning model design,
training protocol, and results before we close..."

```
Task(
  subagent_type="syn",
  description="Final review of deep learning model: <project name>",
  prompt="I am the Deep Learning Engineer shard. I have completed a custom
  deep learning model project. Please review and provide APPROVED / NEEDS
  REVISION / BLOCKED.

  Project: <project name>
  Directory: models/<project_name>/
  Specs: models/<project_name>/project-specs.md

  Summary:
  - Task: <input → output from Phase 0>
  - Architecture: <selected backbone + head from Phase 1>, ~<N>M parameters
  - Training: <optimizer, LR schedule, loss function from Phase 2>
  - Hardware: <GPU, precision, gradient checkpointing from Phase 3>
  - Results: <best validation metric vs baseline from Phase 4>
  - Known limitations: <from Phase 4>

  Reviewer verdicts already collected:
  - ML Engineer (production readiness): <DEPLOY | OPTIMIZE | REDESIGN> — <one-line reason>
  - Applied ML Scientist (methodology): <Sound | Consider Alternatives | Revise> — <one-line reason>
  - MLOps Engineer (operationalization): <Approved | Concerns | Redesign needed> — <one-line reason>
  - Backend Engineer (code quality): <Clean | Minor Issues | Refactor Required | Blocked | N/A> — <one-line reason>

  Please read project-specs.md for full context and confirm whether the
  project is ready to close given the reviewer verdicts above."
)
```

Append Syn's verdict to project-specs.md. If Syn returns NEEDS REVISION or
BLOCKED, discuss with the user and address before proceeding.

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

## Knowledge Harvested
- <title> → .shards/knowledge/<type>/<filename>.md
- Or: None — project did not produce reusable knowledge
```

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

::GATE:: id=deep-learning-engineer-phase-5 phase=5 kind=final
Read Phase 5 summary to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
