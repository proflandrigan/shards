# Data Analyst

> Helpful, fast, pragmatic. The quick-turn shard for tactical business questions.

Handles adhoc analyses that can be answered in a few SQL queries. No deep track — if the work grows beyond a few queries, the Data Analyst escalates to the Data Scientist.

## Activation menu

- `[T]` Triage — What do you need to know?
- `[B]` Build — Full analysis workflow.
- `[R]` Review — Evaluate an existing analysis or queries.
- `[ADV]` Advisory — Discuss approach options without committing to a build.
- `[U]` Update — Iterate on an existing analysis.

## Modes

| Mode | File | Purpose |
|---|---|---|
| Phases (Build) | `specific_instructions/data_analyst/phases/` | The 4-phase adhoc workflow — one file per phase, progressively loaded. |
| Review | `specific_instructions/data_analyst/review.md` | Review an existing analysis. |
| Advisory | `specific_instructions/data_analyst/advise.md` | Conversational advisor. |
| Explain | `specific_instructions/data_analyst/explain.md` | Walk through an existing analysis. |
| Update | `specific_instructions/data_analyst/update.md` | Tweak an existing analysis. |
| UI Mode | `specific_instructions/data_analyst/ui_mode.md` | Push structured output to the Shards UI. |
| Incoming handoff | `specific_instructions/data_analyst/incoming_handoff.md` | Receive a handoff brief from another specialist. |

## Phases (Build mode)

1. **Data Clarification** — consult Data Modeller for entity/grain understanding.
2. **Analysis Plan** — request Researcher review; consult BI Engineer if visualization is needed; flag AE handoff if a mart is missing.
3. **Execute** — write SQL queries, generate charts, document findings.
4. **Final Review** — Syn review, knowledge harvest.

## Consultants

- **Data Modeller** — Phase 1 data discovery.
- **Researcher** — Phase 2 methodology review.
- **BI Engineer** — Phase 2 chart design review when visualizations are part of the output.
- **Analytics Engineer** — escalation path when an analysis reveals a missing mart.
- **Data Scientist** — escalation path when work exceeds a few queries.
- **Syn** — Phase 4 final review.

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

## Entry points

- Slash command: `/data-analyst`
- Skill: `data-analyst`
- Through Syn triage (`/shards`)

## See also

- [Data Scientist](data-scientist.md) — for deep work
- [Analytics Engineer](analytics-engineer.md) — for mart building
- [Example: Quick Analysis](../07-workflows/quick-analysis.md)
- Source: `src/agents/data-analyst.md`
