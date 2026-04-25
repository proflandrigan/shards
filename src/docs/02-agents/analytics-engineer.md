# Analytics Engineer

> Bridge between raw data and consumers. Obsessed with testability and grain.

Specializes in analytical transformation layers (staging → intermediate → mart) and SQL. Handles everything from iterating on an existing mart to designing a full analytical pipeline from scratch. Works across stacks (dbt, SQLMesh, custom pipelines).

## Activation menu

- `[T]` Triage — What needs building, fixing, or refactoring?
- `[B]` Build — Full transformation workflow.
- `[R]` Review — Evaluate an existing mart or transformation layer.
- `[ADV]` Advisory — Discuss transformation design options.
- `[U]` Update — Iterate on an existing mart or pipeline.

## Modes

| Mode | File | Purpose |
|---|---|---|
| Quick Phases | `specific_instructions/analytics_engineer/phases_quick/` | Quick Track (2 phases) for mart iteration — one file per phase, progressively loaded. |
| Deep Phases | `specific_instructions/analytics_engineer/phases_deep/` | Deep Track (8 phases) for greenfield transformation layers — one file per phase, progressively loaded. |
| Review | `specific_instructions/analytics_engineer/review.md` | Review-only. |
| Advisory | `specific_instructions/analytics_engineer/advise.md` | Advisor mode. |
| Update | `specific_instructions/analytics_engineer/update.md` | Iterate on existing marts. |
| Service Mode | `specific_instructions/analytics_engineer/service_mode.md` | Service consultation mode (invoked by other specialists). |
| UI Mode | `specific_instructions/analytics_engineer/ui_mode.md` | Push structured output to the Shards UI. |
| DA handoff | `specific_instructions/analytics_engineer/data_analyst_handoff.md` | Handoff brief from Data Analyst. |
| BI handoff | `specific_instructions/analytics_engineer/bi_engineer_handoff.md` | Handoff to BI Engineer. |

## Tracks

- **Quick Track**: Diagnosis → Design → Build → Test/Doc. Targets mart iteration or a single new mart.
- **Deep Track**: Requirements → Source Audit → Staging Design → Intermediate Layer → Mart Design → Metrics Layer → Tests/Docs → Review. Targets full transformation-layer design.

## Consultants

- **Data Modeller** — grain/entity design consultations.
- **Data Engineer** — source layer soundness review.
- **Data Analyst** — business-question alignment review.
- **BI Engineer** — handoff target when dashboards are downstream.
- **Syn** — final review.

## Output directory

`data_models/<project_name>/` for design artifacts, plus `<dbt_project>/models/marts/` for the actual mart SQL.

## Entry points

- Slash command: `/analytics-engineer`
- Skill: `analytics-engineer`
- Through Syn triage (`/shards`)
- Via Task from Data Analyst when a mart needs to be built

## See also

- [Data Engineer](data-engineer.md)
- [Data Modeller](data-modeller.md)
- [BI Engineer](bi-engineer.md)
- Source: `src/agents/analytics-engineer.md`
