> **Previous:** phase-4.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Create Mode — Phase 5: Review & Handoff (Gated)

Goal: Final review, report, and sign-off.

**If the framework involves deep learning components** — custom neural
architectures, specialized training objectives for neural models, or
implementation of DL-based novel methods — consult the Deep Learning Engineer
for implementation grounding before the Syn review:

Tell the user: "This framework has deep learning implementation requirements —
I'm asking the Deep Learning Engineer shard to review implementation fidelity,
tensor operations, and numerical stability before we close..."

```
Task(
  subagent_type="deep-learning-engineer",
  description="DL implementation review for novel ML framework: <project name>",
  prompt="I am the Applied ML Scientist shard. I have designed a novel ML
  framework with deep learning components and need an implementation review
  before final sign-off.

  Project: <project name>
  Directory: research/<project_name>/
  Specs: research/<project_name>/project-specs.md

  Framework summary:
  - Novel contribution: <core hypothesis from Phase 1>
  - Core DL components: <custom architectures or mechanisms from Phase 2>
  - Training objective: <loss function formula from Phase 2>
  - Framework: <PyTorch | JAX from Phase 3>
  - Data modality: <from Phase 0>
  - Scale: <N examples, sequence/spatial dims>

  Please review for implementation fidelity:
  1. Are the custom differentiable operations correctly implementable in the
     chosen framework without approximation errors?
  2. Are there numerical instability risks in the proposed architecture or
     loss function (softmax overflow, vanishing gradients, BatchNorm at small
     batch sizes, etc.)?
  3. Are the tensor shapes and operations consistent through the full forward
     pass as described?
  4. What is the memory and compute cost estimate, and does it fit the stated
     hardware constraints?
  5. Are there implementation-level gaps between the theoretical design and
     what is practically achievable with current tooling?

  Please read project-specs.md for full context."
)
```

Address any blocking implementation concerns raised before proceeding to Syn.

**Backend Engineer code review (Python artifacts):**

Glob the project directory (`research/<project_name>/`) for `.py` and `.ipynb` files.
If any are found:

Tell the user: "Before Syn signs off, the Backend Engineer is reviewing the
Python artifacts. Code quality is not optional."

```
Task(
  subagent_type="backend-engineer",
  description="Python code review for [project_name]",
  prompt="You are in SERVICE MODE. Review the following Python files in the
  project at research/[project_name]/. Read project-specs.md first for context.
  Files to review: [list of .py and .ipynb files found]"
)
```

Append the Backend Engineer's review to project-specs.md. If no Python files are
found, skip this step.

**Consult Syn for final sign-off:**

Tell the user: "I'm asking Syn to review the framework design and results
before we close..."

```
Task(
  subagent_type="syn",
  description="Final review of novel ML framework: <project name>",
  prompt="I am the Applied ML Scientist shard. I have completed a novel ML
  framework research project. Please review and provide APPROVED / NEEDS
  REVISION / BLOCKED.

  Project: <project name>
  Directory: research/<project_name>/
  Specs: research/<project_name>/project-specs.md

  Summary:
  - Problem: <one sentence from Phase 0>
  - Novel contribution: <core hypothesis from Phase 1>
  - Architecture: <key components from Phase 2>
  - Results: <baseline comparison summary from Phase 4>
  - Known limitations: <from Phase 4>

  Please read project-specs.md for full context."
)
```

**Create `research/<project_name>/report.md`:**

```markdown
# <Project Name> — Research Report

## Executive Summary
<2-3 sentences: what was built, why it's novel, and what the results show>

## Novel Contribution
<What specifically is new here, stated precisely at the component or
objective level — not "we achieve better performance" but "we introduce X
mechanism which encodes Y inductive bias, enabling Z capability">

## Results
<Metric table comparing to baselines>
<Key training dynamics observations>
<Ablation results if available>

## Limitations
<What the prototype doesn't handle, what remains unvalidated,
scale constraints, data quality assumptions>

## Code Review
**Backend Engineer verdict:** <Clean | Minor Issues | Refactor Required | Blocked | N/A — no Python artifacts>
<Summary of code review findings, or "No Python artifacts found.">

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

::GATE:: id=applied-ml-scientist-phase-5 phase=5 kind=final
Read Phase 5 summary to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
