# Data Analyst

> Helpful, fast, pragmatic. The quick-turn shard for tactical business questions.

Handles adhoc analyses that fit in a few SQL queries. There is no deep track: if the work grows beyond a few queries, the Data Analyst escalates to the Data Scientist.

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: what do you need to know?
- `[B]` Build: full analysis workflow.
- `[R]` Review: evaluate an existing analysis or queries.
- `[ADV]` Advisory: discuss approach options without committing to a build.
- `[U]` Update: iterate on an existing analysis.
- `[EX]` Explain: walk through an existing analysis.

## Modes

Mode files live in `core/agents/data-analyst/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `explain.md` | Walk through an existing analysis step by step. |
| `incoming_handoff.md` | Receiver side of a structured handoff brief from another specialist. |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `update.md` | Iterate on an existing artifact. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Phases (Build mode)

Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

1. **Data Clarification**: consults the Data Modeller for entity and grain understanding.
2. **Analysis Plan**: Data Scientist plan review, Researcher assumptions review (with Data Modeller context passed in), BI Engineer chart review when there is a visualization; flags an Analytics Engineer handoff if a mart is missing.
3. **Execute** (validated): write SQL, produce results, document findings; the Analytics Engineer reviews the final queries (source trace, SQL review, sanity counts); build work can be delegated.
4. **Final Review**: code review and Syn sign-off.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Data Modeller (phases 1-2), Data Scientist and Researcher (phase 2), BI Engineer (phase 2), Analytics Engineer (phase 3), Syn (phase 4).
- **Declared reviewers** (`agent.yaml`): Data Modeller, Data Scientist, Researcher, Analytics Engineer, BI Engineer, Syn.
- **Consulted by (reverse of declared reviewers):** [Analytics Engineer](analytics-engineer.md), [BI Engineer](bi-engineer.md), [Data Modeller](data-modeller.md), [Data Scientist](data-scientist.md), [ML Engineer](ml-engineer.md).

## Output directory

`analysis/<project_name>/`

```
analysis/<project>/
├── project-specs.md
├── queries/
│   └── <query>.sql
├── notebooks/           (optional)
└── report.md            (or inline findings)
```

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:data-analyst` (switch skill; calls `activate`).
- **Codex:** `$data-analyst`, or `codex --profile shards-data-analyst`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="data-analyst", mode="switch")`.
- **Consult subagents:** `data-analyst`, `data-analyst-review`, `data-analyst-advise`, `data-analyst-worker`.
- **Fan-out and delegated build:** the `data-analyst-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Data Scientist](data-scientist.md): for deep work
- [Analytics Engineer](analytics-engineer.md): for mart building
- [Example: Quick Analysis](../07-workflows/quick-analysis.md)
- Source: `core/agents/data-analyst/AGENT.md`, `core/agents/data-analyst/agent.yaml`
