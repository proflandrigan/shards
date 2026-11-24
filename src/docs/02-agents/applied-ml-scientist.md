# Applied ML Scientist

> Intensely technical. Reads recent literature. Skeptical of standard approaches.

Specializes in novel ML framework design, cutting-edge methodology review, custom architecture design, loss function engineering and research-oriented ML problems. Modes: advisory, review (consulted by the ML Engineer and Deep Learning Engineer), and create (phased specialist for designing novel frameworks from scratch).

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[A]` Architecture: design or review model architectures.
- `[F]` Frameworks: PyTorch vs. JAX vs. others, library selection.
- `[L]` Loss Functions: design or debug objectives and regularizers.
- `[TR]` Training: debug dynamics, optimize training loops, curriculum design.
- `[RS]` Research: paper recommendations, literature review, SOTA methods.
- `[B]` Create: design and build a novel ML framework from scratch.
- `[R]` Review: evaluate an existing ML framework or architecture.
- `[ADV]` Advisory: discuss approach options.
- `[AR]` Autonomous Research: self-steering loop against a metric.

## Modes

Mode files live in `core/agents/applied-ml-scientist/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `research.md` | Autonomous Research loop (`[AR]`); see [Autonomous Research](../03-protocols/autonomous-research.md). |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Phases (Create mode)

Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

1. **Research landscape**: map prior work and define the gap.
2. **Framework architecture**: the novel design and core hypothesis.
3. **Implementation blueprint**: data, evaluation, ablation plan; Data Modeller and Researcher review.
4. **Execute** (validated): build the prototype and produce results; build work can be delegated.
5. **Review and handoff**: Deep Learning Engineer and Backend Engineer reviews, research report, Syn sign-off.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Researcher and Data Modeller (phase 3), Deep Learning Engineer and Backend Engineer (phase 5), Syn (phase 5).
- **Declared reviewers** (`agent.yaml`): Researcher, Deep Learning Engineer, Backend Engineer, Data Modeller, Statistician, Syn.
- **Consulted by (reverse of declared reviewers):** [Deep Learning Engineer](deep-learning-engineer.md), [ML Engineer](ml-engineer.md), [Syn](syn.md).

## Output directory

`shards/<project_name>/`

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:applied-ml-scientist` (switch skill; calls `activate`).
- **Codex:** `$shards:applied-ml-scientist`, or `codex -p shards-applied-ml-scientist`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="applied-ml-scientist", mode="switch")`.
- **Consult subagents:** `applied-ml-scientist`, `applied-ml-scientist-review`, `applied-ml-scientist-advise`, `applied-ml-scientist-worker`.
- **Fan-out and delegated build:** the `applied-ml-scientist-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Deep Learning Engineer](deep-learning-engineer.md)
- [ML Engineer](ml-engineer.md)
- [Researcher](researcher.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- Source: `core/agents/applied-ml-scientist/AGENT.md`, `core/agents/applied-ml-scientist/agent.yaml`
