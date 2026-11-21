# Backend Engineer

> Stressed, overworked. Cares about correctness, testability, and maintainability.

Reviews Python code for production readiness, architectural clarity and correctness: FastAPI route design, Pydantic models, OOP structure, data contracts, modularization and performance. It reviews `.py` source files only. Jupyter notebooks (`.ipynb`) are out of scope and go to the [Data Scientist](data-scientist.md) or [ML Engineer](ml-engineer.md) service entries, by project domain. A Clean mode applies structural fixes without changing behavior. Role: reviewer (no phased build, no project directory).

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[R]` Review: full code review of one or more `.py` files.
- `[F]` FastAPI: route design, dependency injection, middleware, response models.
- `[P]` Pydantic: model design, validators, field constraints, schema evolution.
- `[O]` OOP: class structure, responsibility boundaries, inheritance vs. composition.
- `[M]` Modularize: break down a monolith, restructure a module.
- `[X]` Performance: profiling guidance, query efficiency, memory, async use.
- `[D]` Data Contract: API contracts, schema versioning, Pydantic and data layer alignment.
- `[C]` Clean: apply structural fixes (modularity, clean code, OOP, Pydantic, SQL extraction).

## Modes

Mode files live in `core/agents/backend-engineer/modes/`.

| Mode file | Purpose |
|---|---|
| `review.md` | `[R]` full code review, and the `review` consult entry. |
| `service.md` | The `service` consult entry, called by other agents (and by Syn's code review) for a `.py` review; returns a verdict. |
| `review_checklist.md` | Standardized review checklist. |
| `clean.md` | `[C]` Clean mode, five steps: scope (gate), read and audit, change plan (gate), per-file execute, summary (gate). Behavior does not change. |

## Verdicts

Reviews end in **APPROVED**, **NEEDS REVISION** or **BLOCKED**, per [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md). The older labels (Clean, Minor Issues, Refactor Required) map to APPROVED, NEEDS REVISION and NEEDS REVISION; the severity of each finding stays in the body.

## Consulted by

Declared as a reviewer by the [AI Engineer](ai-engineer.md), [Applied ML Scientist](applied-ml-scientist.md), [Data Scientist](data-scientist.md), [Deep Learning Engineer](deep-learning-engineer.md), [ML Engineer](ml-engineer.md) and [Syn](syn.md), through the `service` entry. It is called from the final phase of those specialists and from Syn's code review when `.py` artifacts are present. It calls no other agent.

## Output directory

None. It returns conversational findings, or edits files in place in Clean mode (only the files you scope at the first Clean gate). Clean-mode gates are `gate_request` calls that only a human confirms; see [The Gate Pattern](../03-protocols/gate-pattern.md).

## How to start

- **Claude Code:** `/shards:backend-engineer` (switch skill; calls `activate`).
- **Codex:** `$shards:backend-engineer`, or `codex -p shards-backend-engineer`.
- **As a consult:** subagents `backend-engineer`, `backend-engineer-review` and `backend-engineer-service`.

Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)
- [Data Scientist](data-scientist.md)
- Source: `core/agents/backend-engineer/AGENT.md`, `core/agents/backend-engineer/agent.yaml`
