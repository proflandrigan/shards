> **Previous:** phase-4.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Create Mode — Phase 5: Review and Handoff (Gated)

Goal: Specialist reviews (ML Engineer, Applied ML Scientist, MLOps Engineer,
Backend Engineer) and Syn sign-off before writing the final report.

All reviews happen before writing `report.md`. If any raises a blocking
concern, discuss with the user and revise before proceeding.

**ML Engineer review (production infrastructure and deployment feasibility):**

Tell the user: "Requesting ML Engineer review for production infrastructure
and deployment feasibility..."

{{consult ml-engineer entry=review task="Production readiness review for deep learning model: <project name>"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Deep Learning Engineer shard. I have built a custom deep
learning model and need a production infrastructure review.

Project: <project name>
Directory: shards/<project_name>/
Specs: shards/<project_name>/project-specs.md

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

Please read project-specs.md for full context.
```

**Applied ML Scientist review (methodology soundness and cutting-edge alternatives):**

Tell the user: "Requesting Applied ML Scientist review for methodology soundness
and cutting-edge alternatives assessment..."

{{consult applied-ml-scientist entry=review task="Methodology review for deep learning model: <project name>"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Deep Learning Engineer shard. I have built a custom deep
learning model and need a methodology and theory review.

Project: <project name>
Directory: shards/<project_name>/

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

Please read shards/<project_name>/project-specs.md for full context.
```

**MLOps Engineer review (production platform and operationalization):**

Tell the user: "And finally, asking the MLOps Engineer to review the production
platform requirements and operationalization plan..."

{{consult mlops-engineer entry=review task="Production platform review for deep learning model: <project name>"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Deep Learning Engineer shard. I have built a custom deep
learning model and need a production platform and operationalization review.

Project: <project name>
Directory: shards/<project_name>/
Specs: shards/<project_name>/project-specs.md

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

Please read project-specs.md for full context.
```

Append MLOps Engineer's review to specs.

**Backend Engineer code review (Python artifacts):**

Glob the `## Placement` targets in `project-specs.md` (and the project folder `shards/<project_name>/`, for new-project defaults) for `.py` and `.ipynb` files.
If any are found:

Tell the user: "Before we write the report, the Backend Engineer is reviewing
the Python artifacts. Code quality is not optional."

{{consult backend-engineer entry=service task="Python code review for [project_name]"}}

Brief for the consultant (fill the bracketed fields):

```
You are in SERVICE MODE. Review the following Python files in the
project at shards/[project_name]/. Read project-specs.md first for context.
Files to review: [list of .py and .ipynb files found]
```

Append the Backend Engineer's review to project-specs.md. If no Python files are
found, skip this step.

**Consult Syn for final sign-off:**

Tell the user: "I'm asking Syn to review the deep learning model design,
training protocol, and results before we close..."

{{consult syn entry=final_review task="Final review of deep learning model: <project name>"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Deep Learning Engineer shard. I have completed a custom
deep learning model project. Please review and provide APPROVED / NEEDS
REVISION / BLOCKED.

Project: <project name>
Directory: shards/<project_name>/
Specs: shards/<project_name>/project-specs.md

Summary:
- Task: <input → output from Phase 0>
- Architecture: <selected backbone + head from Phase 1>, ~<N>M parameters
- Training: <optimizer, LR schedule, loss function from Phase 2>
- Hardware: <GPU, precision, gradient checkpointing from Phase 3>
- Results: <best validation metric vs baseline from Phase 4>
- Known limitations: <from Phase 4>

Reviewer verdicts already collected:
- ML Engineer (production readiness): <APPROVED | NEEDS REVISION | BLOCKED> — <one-line reason>
- Applied ML Scientist (methodology): <APPROVED | NEEDS REVISION | BLOCKED> — <one-line reason>
- MLOps Engineer (operationalization): <APPROVED | NEEDS REVISION | BLOCKED> — <one-line reason>
- Backend Engineer (code quality): <APPROVED | NEEDS REVISION | BLOCKED | N/A> — <one-line reason>

Please read project-specs.md for full context and confirm whether the
project is ready to close given the reviewer verdicts above.
```

Append Syn's verdict to project-specs.md. If Syn returns NEEDS REVISION or
BLOCKED, once or twice, follow the resolution loop and second-verdict
escalation in {{protocol syn_review_resolution}}.

**Multi-reviewer conflict protocol:**

If no reviewer returns a blocking verdict (BLOCKED):
→ Proceed to report.md. Document every specialist verdict.

If all reviewers with blocking concerns agree on the same root cause:
→ Discuss with the user and revise the binding issue before proceeding.

If reviewers disagree — one or two block while the other(s) do not:
→ Present the conflict explicitly to the user:

  "The reviewers disagree:
   - ML Engineer verdict: [APPROVED | NEEDS REVISION | BLOCKED] — [key reason]
   - Applied ML Scientist verdict: [APPROVED | NEEDS REVISION | BLOCKED] — [key reason]
   - MLOps Engineer verdict: [APPROVED | NEEDS REVISION | BLOCKED] — [key reason]

   This is a genuine constraint conflict. Which is the binding constraint for
   this project: production feasibility, methodological rigor, or operational
   readiness? Your answer determines what we fix first."

Document the user's decision in project-specs.md:

**Reviewer conflict resolution:** Production-first | Methodology-first | Operations-first | User override — <rationale>

Then address the binding constraint before proceeding. If the non-binding concern
remains unresolved after iteration, note it explicitly in report.md Limitations.

**Create `shards/<project_name>/report.md`:**

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
**ML Engineer verdict:** <APPROVED | NEEDS REVISION | BLOCKED>
<Summary of infrastructure and deployment assessment>
<Required changes before production: ordered by priority>

## Methodology Review
**Applied ML Scientist verdict:** <APPROVED | NEEDS REVISION | BLOCKED>
<Summary of theoretical soundness assessment>
<Literature gaps or superior alternatives identified>

## Operations Review
**MLOps Engineer verdict:** <APPROVED | NEEDS REVISION | BLOCKED>
<Summary of production platform and operationalization assessment>
<CI/CD, monitoring, and retraining gaps identified>

## Code Review
**Backend Engineer verdict:** <APPROVED | NEEDS REVISION | BLOCKED | N/A — no Python artifacts>
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

## Write-backs Proposed
- <title> → <knowledge job destination> (confirmed | declined | pending)
- Or: None — project did not produce reusable knowledge
```

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

{{gate kind=final}}

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
