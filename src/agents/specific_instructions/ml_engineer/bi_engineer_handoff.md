# ML Engineer — BI Dashboard Handoff

This file governs the BI Engineer handoff at the end of an ML Engineer project.
A handoff is offered when the user wants a production monitoring dashboard built on top of the model.

---

## Phase 7: BI Monitoring Dashboard Handoff

**BI monitoring dashboard handoff:**

Ask the user: "Every production model benefits from a monitoring dashboard.
Do you want a `bi_engineer_handoff.md` so the BI Engineer shard can build
performance monitoring on top of this model?"

**GATE: Wait for an explicit yes or no. Do not generate the file unless the user confirms.**

If yes, write `models/<project_name>/bi_engineer_handoff.md`:

```
# BI Engineer Handoff: <project_name>

## Source Project
- Originating agent: ML Engineer
- Project directory: models/<project_name>/
- Project specs: models/<project_name>/project-specs.md
- Project report: models/<project_name>/report.md

## What Was Built
- Model type: <final model type from Phase 4>
- Task: <ML task description from Phase 4>
- Key metric: <metric name> = <value> (<business interpretation>)
- Source study (if applicable): <study dir or N/A>

## Dashboarding Objective
- Purpose: Model performance monitoring dashboard
- Intended audience: <ML team or stakeholders from Phase 1>
- Dashboard type: Model monitoring / performance tracking

## Key Metrics to Display
- Model performance: <offline metrics from Phase 5> — prediction distribution drift
- Data quality: <feature drift indicators> — missing features, schema changes, data staleness
- System health: <latency metric> p99 target: <latency target> | error rate | throughput
- Business metrics: <online metrics from Phase 4 evaluation strategy>
- Alerting thresholds set: <yes or no> — <summary of thresholds>

## Data Sources
- Prediction logs: <prediction log table or location>
- Ground truth: <ground truth source or delay notes>
- Feature pipeline: <feature pipeline from Phase 5>
- System metrics: <infra metrics source e.g. CloudWatch, Datadog>

## Tool Recommendation
- <Grafana for infra metrics / Streamlit / Dash> — <one-sentence rationale>
- No preference? Let the BI Engineer recommend during Phase 0.

## Constraints
- Monitoring scope: <real-time or batch refresh>
- Data freshness: <freshness requirement from Phase 5 pipeline>
- Infrastructure: <serving platform from Phase 5>

## Next Step
Run `/bi-engineer` or `/shards`. In Phase 0, reference this file:
models/<project_name>/bi_engineer_handoff.md
```

Tell the user: "Handoff file written. Run `/bi-engineer` or `/shards` and
reference `models/<project_name>/bi_engineer_handoff.md` in Phase 0."
Do NOT attempt to morph into or invoke the BI Engineer.
