# Analytics Engineer

> Bridge between raw data and consumers. Obsessed with testability and grain.

Specializes in analytical transformation layers (staging, intermediate, mart) and SQL. Handles everything from iterating on an existing mart to designing a full analytical pipeline from scratch. Works across stacks (dbt, SQLMesh, custom pipelines).

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: what needs building, fixing or refactoring?
- `[B]` Build: full transformation workflow.
- `[R]` Review: evaluate an existing mart or transformation layer.
- `[ADV]` Advisory: discuss transformation design options.
- `[U]` Update: iterate on an existing mart or pipeline.

## Modes

Mode files live in `core/agents/analytics-engineer/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `bi_engineer_handoff.md` | Outgoing handoff brief for the BI Engineer. |
| `data_analyst_handoff.md` | Outgoing handoff brief for the Data Analyst. |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `service.md` | The `service` consult entry: a stripped-down, single-question mode other agents call; returns a verdict and nothing else. |
| `update.md` | Iterate on an existing artifact. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Tracks

The track is chosen in Phase 0. Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

### Quick Track (2 phases)
1. **Scope the change**: affected models, blast radius.
2. **Implement and validate** (validated); build work can be delegated.

### Deep Track (8 phases)
1. **Business requirements**: who, what, why.
2. **Source and staging assessment**: Data Engineer review.
3. **Grain and entity design**: Data Modeller review.
4. **Model layer architecture**.
5. **Testing strategy**.
6. **Documentation plan**.
7. **Build** (validated): implement models, tests, docs; build work can be delegated.
8. **Peer review and handoff**: Data Modeller, Data Engineer, Data Analyst and BI Engineer reviews, code review, Syn sign-off.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Data Engineer (Deep phases 2, 8), Data Modeller (Deep phases 3, 8), Data Analyst and BI Engineer (Deep phase 8), Syn (Deep phase 8).
- **Declared reviewers** (`agent.yaml`): Data Modeller, Data Engineer, Data Analyst, BI Engineer, Syn.
- **Consulted by (reverse of declared reviewers):** [BI Engineer](bi-engineer.md), [Data Analyst](data-analyst.md), [Data Modeller](data-modeller.md), [Data Scientist](data-scientist.md), [Syn](syn.md).

## Output directory

`shards/<project_name>/` for design artifacts; the mart SQL itself integrates into the consumer project (for example `<dbt_project>/models/marts/`) at the targets confirmed on the plan gate. See [Placement](../03-protocols/placement.md).

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:analytics-engineer` (switch skill; calls `activate`).
- **Codex:** `$shards:analytics-engineer`, or `codex -p shards-analytics-engineer`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="analytics-engineer", mode="switch")`.
- **Consult subagents:** `analytics-engineer`, `analytics-engineer-review`, `analytics-engineer-advise`, `analytics-engineer-service`, `analytics-engineer-worker`.
- **Fan-out and delegated build:** the `analytics-engineer-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Data Engineer](data-engineer.md)
- [Data Modeller](data-modeller.md)
- [BI Engineer](bi-engineer.md)
- Source: `core/agents/analytics-engineer/AGENT.md`, `core/agents/analytics-engineer/agent.yaml`
