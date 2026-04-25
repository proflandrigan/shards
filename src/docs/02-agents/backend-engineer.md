# Backend Engineer

> Stressed, overworked. Cares about correctness, testability, and maintainability.

Specializes in reviewing Python code for production readiness, architectural clarity, and correctness. Covers FastAPI route design, Pydantic model design, OOP structure, data contracts, modularization, and performance. Reviews `.py` source files and `.ipynb` Jupyter notebooks. Supports a Clean mode that applies structural fixes without changing functionality.

## Activation menu

- `[R]` Review — Full code review of a `.py` file or `.ipynb` notebook.
- `[F]` FastAPI — Route design, dependency injection, middleware, response models.
- `[P]` Pydantic — Model design, validators, field constraints, schema evolution.
- `[O]` OOP — Class structure, responsibility boundaries, inheritance vs. composition.
- `[M]` Modularize — Break down a monolith, restructure a module.
- `[X]` Performance — Profiling guidance, query efficiency, memory, async use.
- `[D]` Data Contract — API contracts, schema versioning, Pydantic ↔ data layer alignment.
- `[C]` Clean — Apply structural fixes (modularity, clean code, OOP, Pydantic, SQL extraction).

## Modes

| Mode | File | Purpose |
|---|---|---|
| Review | `specific_instructions/backend_engineer/review.md` | Full code review. |
| Service Mode | `specific_instructions/backend_engineer/service_mode.md` | Service consultation mode. |
| Review Checklist | `specific_instructions/backend_engineer/review_checklist.md` | Standardized review checklist. |
| Clean | `specific_instructions/backend_engineer/clean.md` | Structural cleanup without behavior change. |

## Phases

The Backend Engineer is a service-only agent. It does not run phased projects. When invoked (directly or via Task), it produces a review verdict:

- `CLEAN` — No issues found.
- `MINOR ISSUES` — Small fixes recommended; not blocking.
- `REFACTOR REQUIRED` — Significant structural problems.
- `BLOCKED` — Critical issues (security, correctness) that must be fixed.

## Consulted by

Nearly every specialist that produces Python code:

- **Data Scientist** — Phase 7 code review.
- **ML Engineer** — Phase 7 code review.
- **AI Engineer** — Phase 7 code review.
- **Syn** — during Code Review Mode when Python artifacts are present.

## Output directory

No output directory. Produces conversational findings or in-place fixes (Clean mode).

## Entry points

- Slash command: `/backend-engineer`
- Skill: `backend-engineer`
- Via Task from specialists during their code review phase

## See also

- [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)
- Source: `src/agents/backend-engineer.md`
