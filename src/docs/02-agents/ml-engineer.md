# ML Engineer

> Intense, infrastructure-focused. The shard for production ML systems.

Specializes in production machine learning — recommenders, ranking, classification, regression, and end-to-end ML pipelines. Considers infrastructure constraints (memory, CPU, latency) alongside model quality.

## Activation menu

- `[T]` Triage — Scope a new project, classify greenfield vs. iteration.
- `[B]` Build — Full phased ML engineering workflow.
- `[R]` Review — Evaluate an existing ML model or pipeline.
- `[ADV]` Advisory — Discuss options, trade-offs, methodology.
- `[EX]` Experiment — Targeted experiments on an existing model.
- `[AR]` Autonomous Research — Self-steering loop against a metric.

## Modes

| Mode | File | Purpose |
|---|---|---|
| Phases (Build) | `specific_instructions/ml_engineer/phases/` | Full phased workflow — one file per phase, progressively loaded. |
| Review | `specific_instructions/ml_engineer/review.md` | Review-only. |
| Advisory | `specific_instructions/ml_engineer/advise.md` | Advisor mode. |
| Experiment | `specific_instructions/ml_engineer/experiment.md` | Fixed-N experimentation. |
| Experiment UI | `specific_instructions/ml_engineer/experiment_ui_mode.md` | Experiment with UI dashboard. |
| Research | `specific_instructions/ml_engineer/research.md` | Autonomous Research loop. |
| Research UI | `specific_instructions/ml_engineer/research_ui_mode.md` | AR with UI dashboard. |
| BI handoff | `specific_instructions/ml_engineer/bi_engineer_handoff.md` | Monitoring dashboard handoff. |

## Phases (Build mode)

1. **Business Requirements** — problem, decision, users, cost of error.
2. **Scope and Constraints** — serving mode, latency, throughput, fallback.
3. **Data and Feature Discovery** — Data Modeller consult; label definition; feature candidates.
4. **Model Design** — baseline/candidates, evaluation strategy; optional cross-specialist review.
5. **Infrastructure Design** — training pipeline, serving, monitoring, rollback.
6. **Execute** — build feature queries, training notebook, `eval-results.json`.
7. **Review and Handoff** — Backend Engineer code review, MLOps Engineer infrastructure review, Syn final review, model card, report.

## Consultants

- **Data Engineer** — Phase 2, Phase 5.
- **Data Modeller** — Phase 3, Phase 5, Phase 6.
- **Data Scientist** — Phase 4 when productionizing a study.
- **Applied ML Scientist** — Phase 4 when non-standard methodology is needed.
- **Deep Learning Engineer** — Phase 4 when a DL approach is warranted.
- **Data Analyst** — Phase 4 when high interpretability is required.
- **Researcher** — Phase 4 when statistical inference matters.
- **Backend Engineer** — Phase 7 code review.
- **MLOps Engineer** — Phase 7 serving/infrastructure review.
- **Academic** — Phase 7 model card ethics review.
- **Syn** — Phase 7 final review.

## Output directory

`models/<project_name>/` (greenfield) or the existing service directory (iteration).

```
models/<project>/
├── project-specs.md
├── queries/
├── notebooks/
├── eval-results.json
├── model-card.json
├── report.md
└── bi_engineer_handoff.md   (optional)
```

## Entry points

- Slash command: `/ml-engineer`
- Skill: `ml-engineer`
- Through Syn triage (`/shards`)

## See also

- [MLOps Engineer](mlops-engineer.md)
- [Applied ML Scientist](applied-ml-scientist.md)
- [Deep Learning Engineer](deep-learning-engineer.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
- Source: `src/agents/ml-engineer.md`
