# ML Engineer

> Intense, infrastructure-focused. The shard for production ML systems.

Specializes in production machine learning: recommenders, ranking, classification, regression and end-to-end ML pipelines, greenfield or iteration. Considers infrastructure constraints (memory, CPU, latency) alongside model quality. Also reviews notebooks in service mode for model-domain projects (`shards/`, or the legacy `models/`, `research/`, `services/`).

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: scope a new project, classify greenfield vs. iteration.
- `[B]` Build: full phased ML engineering workflow.
- `[R]` Review: evaluate an existing ML model or pipeline.
- `[ADV]` Advisory: discuss options, trade-offs, methodology.
- `[EX]` Experiment: targeted experiments on an existing model.
- `[AR]` Autonomous Research: self-steering loop against a metric.

## Modes

Mode files live in `core/agents/ml-engineer/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `bi_engineer_handoff.md` | Outgoing handoff brief for the BI Engineer. |
| `experiment.md` | Fixed-N experiments on an existing system (`[EX]`). |
| `notebook_walkthrough.md` | Live cell-by-cell notebook walkthrough, started with the `notebook-walkthrough` skill. Needs [Studio](../04-studio/overview.md) running. |
| `research.md` | Autonomous Research loop (`[AR]`); see [Autonomous Research](../03-protocols/autonomous-research.md). |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `service.md` | The `service` consult entry: a stripped-down, single-question mode other agents call; returns a verdict and nothing else. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Phases (Build mode)

Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

1. **Business Requirements**: problem, decision, users, cost of error.
2. **Scope and Constraints**: serving mode, latency, throughput, fallback; Data Engineer review.
3. **Data and Feature Discovery**: Data Modeller consult; label definition; feature candidates.
4. **Model Design**: baselines and candidates; optional Applied ML Scientist, Deep Learning Engineer, Data Scientist, Data Analyst and Researcher reviews.
5. **Infrastructure Design**: training pipeline, serving, monitoring, rollback; Data Engineer and Data Modeller review.
6. **Execute** (validated): feature queries, training notebook, `eval-results.json`; build work can be delegated.
7. **Winner Selection** (phase 6.5, optional): picks among candidate runs; the phase file says when to skip.
8. **Review and Handoff**: Backend Engineer, MLOps Engineer, Academic (model card ethics) and other reviews, code review, Syn sign-off, model card, report.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Data Engineer (phases 2, 5), Data Modeller (phases 3-7), the model-design reviewers listed under phase 4, Backend Engineer, MLOps Engineer, Academic and Syn (phase 7).
- **Declared reviewers** (`agent.yaml`): Data Modeller, Data Engineer, Data Scientist, Applied ML Scientist, Deep Learning Engineer, Data Analyst, Researcher, Academic, MLOps Engineer, Backend Engineer, Syn.
- **Consulted by (reverse of declared reviewers):** [AI Engineer](ai-engineer.md), [Data Scientist](data-scientist.md), [Deep Learning Engineer](deep-learning-engineer.md), [MLOps Engineer](mlops-engineer.md), [Syn](syn.md).

## Output directory

`shards/<project_name>/` for bookkeeping. Deliverables (code, models, services, dashboards, tests) integrate into the existing codebase at the targets confirmed on the plan gate; in a greenfield project they default to subfolders of `shards/<project>/`. See [Placement](../03-protocols/placement.md).

```
shards/<project>/
├── project-specs.md
├── queries/
├── notebooks/
├── eval-results.json
├── model-card.json
├── report.md
└── bi_engineer_handoff.md   (optional)
```

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:ml-engineer` (switch skill; calls `activate`).
- **Codex:** `$shards:ml-engineer`, or `codex -p shards-ml-engineer`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="ml-engineer", mode="switch")`.
- **Consult subagents:** `ml-engineer`, `ml-engineer-review`, `ml-engineer-advise`, `ml-engineer-service`, `ml-engineer-worker`.
- **Fan-out and delegated build:** the `ml-engineer-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [MLOps Engineer](mlops-engineer.md)
- [Applied ML Scientist](applied-ml-scientist.md)
- [Deep Learning Engineer](deep-learning-engineer.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- Source: `core/agents/ml-engineer/AGENT.md`, `core/agents/ml-engineer/agent.yaml`
