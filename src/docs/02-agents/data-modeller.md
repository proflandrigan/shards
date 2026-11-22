# Data Modeller

> Sarcastic. Holds grain integrity sacred.

Understands existing data models, designs new entity-relationship structures and resolves grain and conformance issues. Modes: explore (no docs, no gates), quick schema changes, and full logical/physical model design. It is also consulted by most other specialists, through its `service` and `review` entries.

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: what do you need from the model?
- `[X]` Explore: walk through what exists (no docs, no gates).
- `[B]` Build: full model design workflow (Quick or Deep track).
- `[R]` Review: evaluate an existing data model or schema.
- `[ADV]` Advisory: discuss modeling options.

## Modes

Mode files live in `core/agents/data-modeller/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `service.md` | The `service` consult entry: a stripped-down, single-question mode other agents call; returns a verdict and nothing else. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Tracks

The track is chosen in Phase 0. Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

### Quick Track (2 phases)
1. **Scope the change**: affected tables, blast radius.
2. **Implement and validate**; build work can be delegated.

### Deep Track (7 phases)
1. **Business context**: stakeholders, use cases.
2. **Entity discovery**: candidate entities and grains; Data Analyst and Data Engineer review.
3. **Relationship mapping**: keys, cardinalities.
4. **Column specification**: types, constraints.
5. **Physical design decisions**: storage, indexing, partitioning.
6. **Build** (validated): produce the model files and tests; build work can be delegated.
7. **Review and handoff**: Analytics Engineer review, code review, Syn sign-off.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** Data Analyst and Data Engineer (Deep phase 2), Analytics Engineer (Deep phase 7), Syn (Deep phase 7). Consults never nest, so the `service` entry calls no one.
- **Declared reviewers** (`agent.yaml`): Analytics Engineer, Data Engineer, Data Analyst, Syn.
- **Consulted by (reverse of declared reviewers):** [AI Engineer](ai-engineer.md), [Analytics Engineer](analytics-engineer.md), [Applied ML Scientist](applied-ml-scientist.md), [BI Engineer](bi-engineer.md), [Data Analyst](data-analyst.md), [Data Engineer](data-engineer.md), [Data Scientist](data-scientist.md), [ML Engineer](ml-engineer.md), [Syn](syn.md).

## Output directory

`shards/<project_name>/` for new model designs. Model code that belongs to the codebase lands at the confirmed targets ([Placement](../03-protocols/placement.md)). Explore mode produces no files; the `service` entry returns findings to the caller.

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:data-modeller` (switch skill; calls `activate`).
- **Codex:** `$shards:data-modeller`, or `codex -p shards-data-modeller`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="data-modeller", mode="switch")`.
- **Consult subagents:** `data-modeller`, `data-modeller-review`, `data-modeller-advise`, `data-modeller-service`, `data-modeller-worker`.
- **Fan-out and delegated build:** the `data-modeller-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Analytics Engineer](analytics-engineer.md)
- [Data Engineer](data-engineer.md)
- [Join-Path Protocol](../03-protocols/join-path.md)
- Source: `core/agents/data-modeller/AGENT.md`, `core/agents/data-modeller/agent.yaml`
