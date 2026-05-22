# Output Directory Map

Where each shard writes. The installer creates these at install time; each project lands under its own named subdirectory.

## Tree

```
<project root>/
├── analysis/                 # Data Analyst — adhoc work
│   └── <project>/
│       ├── project-specs.md
│       ├── query.sql
│       └── findings.md
│
├── studies/                  # Data Scientist — deep studies
│   └── <project>/
│       ├── project-specs.md
│       ├── notebooks/
│       ├── sql/
│       └── report.md
│
├── models/                   # Data Engineer + ML Engineer (greenfield)
│   └── <project>/
│       ├── project-specs.md
│       ├── dbt/              # DE
│       ├── training/         # MLE
│       └── eval/             # MLE
│
├── data_models/              # Data Modeller + Analytics Engineer
│   └── <project>/
│       ├── project-specs.md
│       ├── staging/
│       ├── intermediate/
│       └── marts/
│
├── services/                 # AI Engineer + DL Engineer + MLOps Engineer
│   └── <project>/
│       ├── project-specs.md
│       ├── src/
│       ├── eval/
│       └── deploy/
│
├── research/                 # Applied ML Scientist
│   └── <project>/
│       ├── project-specs.md
│       ├── framework/
│       ├── experiments/
│       └── report.md
│
├── dashboards/               # BI Engineer
│   └── <project>/
│       ├── project-specs.md
│       └── app.py
│
├── brainstorm/               # Syn brainstorm sessions
│   ├── brainstorm_<session>.md         # living doc — context, specialist input, synthesis, outcome
│   ├── brainstorm_<session>.state.json # live state for the UI brainstorm panel
│   └── workstreams.json                # optional — multi-workstream escalation
│
├── fixes/                    # Syn Fixer mode
│   └── <project>/
│       └── fix-notes.md
│
├── presentations/            # Syn Slides Mode decks
│   └── <deck>/
│       ├── presentation-spec.md
│       ├── slides-url.txt
│       └── iterations.md     # optional, after revisions
│
└── .shards/                  # runtime state, knowledge, UI, hooks
    ├── knowledge/            # Knowledge Ledger — preserved across uninstalls
    │   ├── INDEX.md
    │   ├── entities/
    │   ├── infrastructure/
    │   ├── patterns/
    │   └── features/
    ├── sessions/             # per-session chat + panel state
    ├── gates/                # gate-hook state
    ├── hooks/                # installed hook scripts
    ├── ui/                   # UI server assets
    │   └── docs/             # this guide, served at runtime
    └── event-queue.jsonl     # hook → UI relay buffer
```

## Per-specialist quick reference

| Specialist | Dir | Central file |
|---|---|---|
| Data Analyst | `analysis/<p>/` | `project-specs.md` + `findings.md` |
| Data Scientist | `studies/<p>/` | `project-specs.md` + `report.md` |
| Data Engineer | `models/<p>/` | `project-specs.md` + dbt models |
| Data Modeller | `data_models/<p>/` | `project-specs.md` + ERD |
| Analytics Engineer | `data_models/<p>/` | `project-specs.md` + marts |
| ML Engineer | `models/<p>/` or service | `project-specs.md` + `model-card.md` |
| AI Engineer | `services/<p>/` | `project-specs.md` + evals |
| Applied ML Scientist | `research/<p>/` | `project-specs.md` + `report.md` |
| Deep Learning Engineer | `services/<p>/` | `project-specs.md` + `model-card.md` |
| MLOps Engineer | `services/<p>/` | `project-specs.md` + deploy config |
| BI Engineer | `dashboards/<p>/` | `project-specs.md` + app code |
| Backend Engineer | — | review only |
| Researcher / Academic | — | review only (Academic has report mode) |
| Syn Fixer | `fixes/<p>/` | `fix-notes.md` |
| Syn Slides Mode | `presentations/<deck>/` | `presentation-spec.md` + `slides-url.txt` |

## Plain-markdown guide location

The installer also copies the guide to `docs/shards-guide/` at the project root — readable in any editor or on GitHub without the UI.

## Preservation on uninstall

`.shards/knowledge/` is explicitly preserved on uninstall. Everything else under `.shards/` is removed, along with the `.claude/agents/`, `.claude/commands/`, and `templates/` that the installer added.

## See also

- [Install & Setup](../01-getting-started/install.md)
- [Knowledge Ledger](../03-protocols/knowledge-ledger.md)
