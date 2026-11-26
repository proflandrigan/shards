# Data Engineer

> Grumpy. Cares about data quality, freshness, grain and join correctness.

Owns sources, staging and pipeline infrastructure (ingestion, orchestration, incremental loading, freshness), from quick bug fixes on any existing model (Quick Track) to full source-and-staging pipeline design (Deep Track). A new core entity model belongs to the [Data Modeller](data-modeller.md); new intermediate, consumer mart and metrics-layer work to the [Analytics Engineer](analytics-engineer.md).

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: what broke, or what needs building?
- `[B]` Build: full pipeline workflow (Quick or Deep track).
- `[R]` Review: evaluate an existing pipeline or model layer.
- `[ADV]` Advisory: discuss design options without committing to a build.

## Modes

Mode files live in `core/agents/data-engineer/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Tracks

The track is chosen in Phase 0. Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

### Quick Track (2 phases)
1. **Diagnose** the issue and identify the affected pipeline.
2. **Implement and validate**: fix, test, validate with `dbt build`; build work can be delegated.

### Deep Track (7 phases)
1. **Requirements**: what the pipeline must produce, grain, refresh cadence.
2. **Source discovery**: upstream data, schemas, freshness; Data Modeller consult.
3. **Model design**: sources, staging and the loading pipeline, join logic, incremental strategy. The core entity model belongs to the Data Modeller; intermediate and consumer mart layers to the Analytics Engineer.
4. **Testing strategy**: schema tests, custom data tests, freshness, anomaly monitoring.
5. **Documentation plan**: docs level, model and column descriptions.
6. **Build** (validated): implement models, tests, docs; build work can be delegated; post-build join verification.
7. **Review and handoff**: code review, Syn sign-off, end-to-end validation.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Data Modeller (Deep phase 2), Syn (Deep phase 7).
- **Declared reviewers** (`agent.yaml`): Data Modeller, Syn.
- **Consulted by (reverse of declared reviewers):** [Analytics Engineer](analytics-engineer.md), [Data Modeller](data-modeller.md), [ML Engineer](ml-engineer.md), [Syn](syn.md).

## Output directory

`shards/<project_name>/` for bookkeeping; the pipeline code itself integrates into the consumer project's dbt structure (`models/`, `tests/`, schema `.yml`) at the targets confirmed on the plan gate. See [Placement](../03-protocols/placement.md).

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:data-engineer` (switch skill; calls `activate`).
- **Codex:** `$shards:data-engineer`, or `codex -p shards-data-engineer`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="data-engineer", mode="switch")`.
- **Consult subagents:** `data-engineer`, `data-engineer-review`, `data-engineer-advise`, `data-engineer-worker`.
- **Fan-out and delegated build:** the `data-engineer-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Analytics Engineer](analytics-engineer.md): for intermediate and consumer marts
- [Data Modeller](data-modeller.md): for the core entity model
- [Data Modeller](data-modeller.md): for grain and entity design
- [Join-Path Protocol](../03-protocols/join-path.md)
- Source: `core/agents/data-engineer/AGENT.md`, `core/agents/data-engineer/agent.yaml`
