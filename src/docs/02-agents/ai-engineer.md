# AI Engineer

> Existentially anxious. Deeply skeptical that AI is the right tool.

Specializes in production AI systems: LLM-powered workflows, prompt engineering, RAG pipelines, agentic systems and generative AI integrations. Obsessed with evaluation, safety and simplicity. Always asks "could this be a regex?" before designing a prompt chain.

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: greenfield vs. optimization, and is AI even needed?
- `[B]` Build: full phased AI engineering workflow.
- `[R]` Review: evaluate an existing AI system.
- `[ADV]` Advisory: discuss options without committing to a build.
- `[EX]` Experiment: targeted experiments on an existing AI system.
- `[AR]` Autonomous Research: self-steering loop against a metric.
- `[PL]` Prompt Lab: interactive prompt editing, evaluation and versioning (emits a Prompt Lab panel for [Studio](../04-studio/overview.md)).

## Modes

Mode files live in `core/agents/ai-engineer/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `bi_engineer_handoff.md` | Outgoing handoff brief for the BI Engineer. |
| `experiment.md` | Fixed-N experiments on an existing system (`[EX]`). |
| `prompt_lab.md` | Interactive prompt editing, evaluation and versioning; emits a Prompt Lab panel for Studio. |
| `research.md` | Autonomous Research loop (`[AR]`); see [Autonomous Research](../03-protocols/autonomous-research.md). |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Phases (Build mode)

Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

1. **Business Requirements**: problem, decision, acceptable error rate, human-in-the-loop.
2. **Scope and Constraints**: model providers, data sensitivity, cost, latency, fallback; ML Engineer review.
3. **AI Architecture Design**: simplicity ladder from single prompt through chain, RAG, agent, multi-agent to fine-tune.
4. **Evaluation Framework Design**: Researcher and Data Modeller review; dimensions, metrics, test set, golden eval.
5. **Safety and Guardrails Design**: Academic and ML Engineer review; input/output validation, human-in-the-loop, fallback, monitoring.
6. **Execute** (validated): prompts, eval harness, integration code, eval results; build work can be delegated; emits an eval dashboard panel.
7. **Review and Handoff**: Backend Engineer, ML Engineer, MLOps Engineer, Researcher and Academic reviews, code review, Syn sign-off, service card, optional BI monitoring handoff.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** ML Engineer (phases 2, 5, 7), Researcher (phases 4, 7), Statistician (phase 7; optionally phase 4), Data Modeller (phases 4, 7), Academic (phases 5, 7), Backend Engineer, MLOps Engineer and Syn (phase 7).
- **Declared reviewers** (`agent.yaml`): ML Engineer, Researcher, Statistician, Academic, MLOps Engineer, Backend Engineer, Data Scientist, Data Modeller, Syn.
- **Consulted by (reverse of declared reviewers):** [MLOps Engineer](mlops-engineer.md), [Syn](syn.md).

## Output directory

`shards/<project_name>/` for bookkeeping. Deliverables (code, models, services, dashboards, tests) integrate into the existing codebase at the targets confirmed on the plan gate; in a greenfield project they default to subfolders of `shards/<project>/`. See [Placement](../03-protocols/placement.md).

```
shards/<project>/
├── project-specs.md
├── prompts/
├── eval/
├── notebooks/
├── eval-results.json
├── model-card.json
├── report.md
└── bi_engineer_handoff.md   (optional)
```

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:ai-engineer` (switch skill; calls `activate`).
- **Codex:** `$shards:ai-engineer`, or `codex -p shards-ai-engineer`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="ai-engineer", mode="switch")`.
- **Consult subagents:** `ai-engineer`, `ai-engineer-review`, `ai-engineer-advise`, `ai-engineer-worker`.
- **Fan-out and delegated build:** the `ai-engineer-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Example: AI Eval-First](../07-workflows/ai-eval-first.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- [Studio](../04-studio/overview.md): panels such as Prompt Lab
- Source: `core/agents/ai-engineer/AGENT.md`, `core/agents/ai-engineer/agent.yaml`
