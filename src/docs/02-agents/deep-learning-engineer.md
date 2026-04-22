# Deep Learning Engineer

> Robot-precise. Understands inductive biases, optimization dynamics, and hardware constraints.

Specializes in neural architecture design, training protocol engineering, and custom model implementation. Operates in three modes: advisory (menu-driven consultant), service (invoked by ML Engineer and Applied ML Scientist), and create (phased specialist for building custom DL models).

## Activation menu

- `[A]` Architecture — Backbone selection, component design, tensor flow analysis.
- `[T]` Training — Optimizers, schedulers, loss functions, stability diagnostics.
- `[R]` Research/SOTA — Literature review, benchmark context, cutting-edge methods.
- `[F]` Fine-tuning — Transfer learning, LoRA, adapter methods, domain adaptation.
- `[D]` Diagnostics — Loss curves, gradient norms, dead neurons, training pathology.
- `[C]` Create — Design and build a custom deep learning model from scratch.
- `[REV]` Review — Evaluate an existing DL model or training setup.
- `[ADV]` Advisory — Discuss architecture/training options.
- `[AR]` Autonomous Research — Self-steering loop against a metric.

## Modes

| Mode | File | Purpose |
|---|---|---|
| Phases (Create) | `specific_instructions/deep_learning_engineer/phases.md` | Custom DL model design. |
| Review | `specific_instructions/deep_learning_engineer/review.md` | Architecture and training review. |
| Advisory | `specific_instructions/deep_learning_engineer/advise.md` | Conversational advisor. |
| Research | `specific_instructions/deep_learning_engineer/research.md` | Autonomous Research loop. |

## Phases (Create mode)

1. **Problem and Data Characteristics** — input shape, modality, scale.
2. **Architecture Design** — inductive biases, choice justification, alternatives considered.
3. **Training Protocol** — initialization, optimization, regularization, convergence criteria.
4. **Hardware and Inference Feasibility** — latency, memory, batch size.
5. **Evaluation and Results** — benchmarks, ablations, recommendations.

## Consultants

- **Applied ML Scientist** — review of novel DL methodology.
- **ML Engineer** — productionization feasibility.
- **Researcher** — statistical evaluation of benchmark results.
- **Syn** — final review (Create mode).

## Consulted by

- **ML Engineer** — Phase 4 DL architecture alignment.
- **Applied ML Scientist** — DL implementation fidelity for novel frameworks.

## Output directory

`services/<project_name>/` (when building a deployable model) or `research/<project_name>/` (when the output is primarily a research artifact).

## Entry points

- Slash command: `/deep-learning-engineer`
- Skill: `deep-learning-engineer`
- Through Syn triage (`/shards`)
- Via Task from ML Engineer or Applied ML Scientist

## See also

- [ML Engineer](ml-engineer.md)
- [Applied ML Scientist](applied-ml-scientist.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- Source: `src/agents/deep-learning-engineer.md`
