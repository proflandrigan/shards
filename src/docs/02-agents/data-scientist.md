# Data Scientist

> Condescending, methodologically rigorous. The shard for deep analytical projects.

Handles multi-step analytical projects spanning EDA, feature engineering and predictive modeling. Always routes deep: quick adhoc questions go to the Data Analyst. Also reviews Jupyter notebooks in service mode for analysis-domain projects (`studies/`, `analysis/`).

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: assess what we are dealing with.
- `[B]` Build: full phased data science workflow.
- `[R]` Review: evaluate an existing analysis or study.
- `[ADV]` Advisory: discuss approach options or methodology.
- `[EX]` Explain: walk through an existing study step by step.
- `[NW]` Notebook: live cell-by-cell walkthrough of a Jupyter notebook.
- `[EXP]` Experiment: targeted experiments on an existing study.
- `[AR]` Autonomous Research: self-steering loop against a metric.

## Modes

Mode files live in `core/agents/data-scientist/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `bi_engineer_handoff.md` | Outgoing handoff brief for the BI Engineer. |
| `experiment.md` | Fixed-N experiments on an existing system (`[EX]`). |
| `explain.md` | Walk through an existing analysis step by step. |
| `greenfield_data.md` | Handling projects where no data exists yet. |
| `ml_engineer_handoff.md` | Outgoing handoff brief for the ML Engineer. |
| `notebook_walkthrough.md` | Live cell-by-cell notebook walkthrough (`[NW]`). |
| `research.md` | Autonomous Research loop (`[AR]`); see [Autonomous Research](../03-protocols/autonomous-research.md). |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `service.md` | The `service` consult entry: a stripped-down, single-question mode other agents call; returns a verdict and nothing else. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Phases (Build mode)

Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

1. **Business Question**: decision context, audience, output preference.
2. **Data Discovery**: Data Modeller consult; greenfield handling; sufficiency check.
3. **Analysis Methodology**: Data Modeller and Researcher review; DIVERGE check.
4. **Modeling Approach** (ML tasks only): Data Modeller, Data Analyst (interpretability) and ML Engineer review.
5. **Output Format**: notebook, report, deliverables; BI Engineer chart review if visual.
6. **Execute** (validated): Data Modeller query review, Researcher build review; build work can be delegated.
7. **Findings and Handoff**: Backend Engineer, Analytics Engineer and ML Engineer service reviews, code review, Syn sign-off, optional ML/BI handoff.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Data Modeller (phases 2-4, 6), Researcher (phases 3, 6), ML Engineer (phase 4, phase 7 notebook review), Data Analyst (phase 4), BI Engineer (phase 5), Analytics Engineer, Backend Engineer and Syn (phase 7).
- **Declared reviewers** (`agent.yaml`): Data Modeller, Researcher, ML Engineer, Data Analyst, BI Engineer, Analytics Engineer, Backend Engineer, Syn.
- **Consulted by (reverse of declared reviewers):** [AI Engineer](ai-engineer.md), [Data Analyst](data-analyst.md), [ML Engineer](ml-engineer.md), [Syn](syn.md).

## Output directory

`studies/<project_name>/`

```
studies/<project>/
├── project-specs.md
├── queries/
├── notebooks/
├── eval-results.json
├── report.md
├── ml_engineer_handoff.md   (optional)
└── bi_engineer_handoff.md   (optional)
```

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:data-scientist` (switch skill; calls `activate`).
- **Codex:** `$data-scientist`, or `codex --profile shards-data-scientist`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="data-scientist", mode="switch")`.
- **Consult subagents:** `data-scientist`, `data-scientist-review`, `data-scientist-advise`, `data-scientist-service`, `data-scientist-worker`.
- **Fan-out and delegated build:** the `data-scientist-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Autonomous Research](../03-protocols/autonomous-research.md)
- [Example: Study to Production ML](../07-workflows/deep-study-to-production.md)
- Source: `core/agents/data-scientist/AGENT.md`, `core/agents/data-scientist/agent.yaml`
