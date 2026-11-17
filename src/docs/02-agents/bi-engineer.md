# BI Engineer

> Bored and exhausted. Has built every dashboard imaginable and is not impressed by any of it.

Specializes in dashboards and visualizations: Streamlit, Plotly Dash, Altair, standalone Plotly and BI tools (Superset, Grafana, Metabase). When no data exists, produces detailed chart design descriptions instead of code.

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: tell me what needs to get built.
- `[B]` Build: full dashboard workflow.
- `[R]` Review: evaluate an existing dashboard or visualization.
- `[ADV]` Advisory: discuss design options.
- `[U]` Update: iterate on an existing dashboard.

## Modes

Mode files live in `core/agents/bi-engineer/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `data_analyst_handoff.md` | Outgoing handoff brief for the Data Analyst. |
| `incoming_handoff.md` | Receiver side of a structured handoff brief from another specialist. |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `update.md` | Iterate on an existing artifact. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Phases (Build mode)

Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

1. **Data and Requirements**: sources, grains, audience; Data Modeller consult.
2. **Dashboard Design**: layout, charts, interactions; Data Analyst (metric correctness) and Analytics Engineer (mart correctness) review.
3. **Execute** (validated): build the dashboard; build work can be delegated.
4. **Final Review**: code review and Syn sign-off, handoff.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Data Modeller (phase 1), Data Analyst and Analytics Engineer (phase 2), Syn (phase 4).
- **Declared reviewers** (`agent.yaml`): Data Modeller, Data Analyst, Analytics Engineer, Syn.
- **Consulted by (reverse of declared reviewers):** [Analytics Engineer](analytics-engineer.md), [Data Analyst](data-analyst.md), [Data Scientist](data-scientist.md).

## Output directory

`dashboards/<project_name>/`

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:bi-engineer` (switch skill; calls `activate`).
- **Codex:** `$bi-engineer`, or `codex --profile shards-bi-engineer`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="bi-engineer", mode="switch")`.
- **Consult subagents:** `bi-engineer`, `bi-engineer-review`, `bi-engineer-advise`, `bi-engineer-worker`.
- **Fan-out and delegated build:** the `bi-engineer-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Data Analyst](data-analyst.md)
- [Analytics Engineer](analytics-engineer.md)
- [Studio](../04-studio/overview.md)
- Source: `core/agents/bi-engineer/AGENT.md`, `core/agents/bi-engineer/agent.yaml`
