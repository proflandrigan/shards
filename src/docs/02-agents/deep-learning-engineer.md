# Deep Learning Engineer

> Robot-precise. Understands inductive biases, optimization dynamics and hardware constraints.

Specializes in neural architecture design, training protocol engineering and custom model implementation. Modes: advisory (menu-driven consultant), review (as a consult entry for the ML Engineer and Applied ML Scientist), and create (phased specialist for building custom DL models).

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[A]` Architecture: backbone selection, component design, tensor flow analysis.
- `[TR]` Training: optimizers, schedulers, loss functions, stability diagnostics.
- `[RS]` Research/SOTA: literature review, benchmark context, cutting-edge methods.
- `[F]` Fine-tuning: transfer learning, LoRA, adapter methods, domain adaptation.
- `[D]` Diagnostics: loss curves, gradient norms, dead neurons, training pathology.
- `[B]` Create: design and build a custom deep learning model from scratch.
- `[R]` Review: evaluate an existing DL model or training setup.
- `[ADV]` Advisory: discuss architecture or training options.
- `[AR]` Autonomous Research: self-steering loop against a metric.

## Modes

Mode files live in `core/agents/deep-learning-engineer/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `research.md` | Autonomous Research loop (`[AR]`); see [Autonomous Research](../03-protocols/autonomous-research.md). |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Phases (Create mode)

Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

1. **Select architecture**: inductive bias fit, capacity, constraints.
2. **Design training protocol**: losses, optimizers, schedules.
3. **Implementation specification**: data pipeline, evaluation, ablations.
4. **Execute** (validated): build the model and produce results; build work can be delegated.
5. **Review and handoff**: Applied ML Scientist, ML Engineer, MLOps Engineer and Backend Engineer reviews, system card, Syn sign-off.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Applied ML Scientist (phase 5, and advise), ML Engineer, MLOps Engineer and Backend Engineer (phase 5), Syn (phase 5).
- **Declared reviewers** (`agent.yaml`): Applied ML Scientist, ML Engineer, MLOps Engineer, Backend Engineer, Syn.
- **Consulted by (reverse of declared reviewers):** [Applied ML Scientist](applied-ml-scientist.md), [ML Engineer](ml-engineer.md).

## Output directory

`models/<project_name>/`

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:deep-learning-engineer` (switch skill; calls `activate`).
- **Codex:** `$shards:deep-learning-engineer`, or `codex -p shards-deep-learning-engineer`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="deep-learning-engineer", mode="switch")`.
- **Consult subagents:** `deep-learning-engineer`, `deep-learning-engineer-review`, `deep-learning-engineer-advise`, `deep-learning-engineer-worker`.
- **Fan-out and delegated build:** the `deep-learning-engineer-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [ML Engineer](ml-engineer.md)
- [Applied ML Scientist](applied-ml-scientist.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- Source: `core/agents/deep-learning-engineer/AGENT.md`, `core/agents/deep-learning-engineer/agent.yaml`
