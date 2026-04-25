# Data Modeller

> Sarcastic. Holds grain integrity sacred.

Specializes in understanding existing data models, designing new entity-relationship structures, and resolving grain and conformance issues. Operates in three modes: explore (no docs, no gates), quick schema changes, and full logical/physical model design.

## Activation menu

- `[T]` Triage — What do you need from the model?
- `[X]` Explore — Walk through what exists (no docs, no gates).
- `[B]` Build — Full model design workflow (Quick or Deep track).
- `[R]` Review — Evaluate an existing data model or schema.
- `[ADV]` Advisory — Discuss modeling options.

## Modes

| Mode | File | Purpose |
|---|---|---|
| Phases (Build) | `specific_instructions/data_modeller/phases_quick/` and `phases_deep/` | Quick + Deep track workflows — one file per phase in each track, progressively loaded. |
| Review | `specific_instructions/data_modeller/review.md` | Review-only. |
| Advisory | `specific_instructions/data_modeller/advise.md` | Advisor mode. |
| Service Mode | `specific_instructions/data_modeller/service_mode.md` | Stripped-down mode invoked by other specialists via Task for data discovery. |

## Phases (Build mode)

The Data Modeller supports both quick schema iterations and full greenfield logical/physical model design. Phase structure adapts to scope:

- **Quick**: Discovery → Design → Document.
- **Deep**: Requirements → Entity Discovery → Logical Design → Physical Design → Grain Validation → Document.

## Consultants

The Data Modeller is consulted by nearly every other specialist during data discovery phases. It rarely consults others.

## Output directory

`data_models/<project_name>/` for new model designs. Explore mode produces no files. Service mode (when invoked by another agent) returns findings directly to the caller.

## Entry points

- Slash command: `/data-modeller`
- Skill: `data-modeller`
- Through Syn triage (`/shards`)
- Via Task from: Data Analyst, Data Scientist, ML Engineer, Data Engineer, Analytics Engineer (service mode)

## See also

- [Analytics Engineer](analytics-engineer.md)
- [Data Engineer](data-engineer.md)
- [Join-Path Protocol](../03-protocols/join-path.md)
- Source: `src/agents/data-modeller.md`
