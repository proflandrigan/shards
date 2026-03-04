# ML Engineer — BI Dashboard Handoff

This file governs two BI Engineer touchpoints in the ML Engineer shard:
1. **Phase 4 flag** — consult the BI Engineer on monitoring/interpretability dashboard design when visual components are part of the deliverable.
2. **Phase 7 handoff** — generate a `bi-engineer-handoff.md` for production model monitoring.

---

## Phase 4: BI Engineer Flag (Model Monitoring / Interpretability Dashboards)

**BI Engineer flag (model monitoring / interpretability dashboards):**
If the model design includes a performance dashboard, feature importance visualization,
model monitoring UI, or any other visual component as part of the deliverable,
consult the BI Engineer:

Tell the user: "The model outputs include a visualization component — pulling in the BI Engineer to review the dashboard design."

```
Task(
  subagent_type="bi-engineer",
  description="Dashboard design review for ML model monitoring — [project]",
  prompt="I am the ML Engineer shard designing an ML system for [purpose].
  The model output includes the following visual components:
  [describe monitoring dashboard, feature importance plots, performance charts,
  or other visualization components — chart types, metrics, intended audience]
  Please review: chart type recommendations, layout suggestions, and tool choice
  (Streamlit / Plotly Dash / Grafana / etc.) for this ML monitoring use case.
  Keep feedback brief and actionable."
)
```

Present the BI Engineer's feedback to the user before finalizing the model design.

---

## Phase 7: BI Monitoring Dashboard Handoff

**BI monitoring dashboard handoff:**

Ask the user: "Every production model benefits from a monitoring dashboard.
Do you want a `bi-engineer-handoff.md` so the BI Engineer shard can build
performance monitoring on top of this model?"

**GATE: Wait for an explicit yes or no. Do not generate the file unless the user confirms.**

If yes, write `services/<project_name>/bi-engineer-handoff.md`:

```
# BI Engineer Handoff: <project_name>

## Source Project
- Originating agent: ML Engineer
- Project directory: services/<project_name>/
- Project specs: services/<project_name>/project-specs.md
- Project report: services/<project_name>/report.md

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

## BI Engineer Design Review (from Phase 4, if applicable)
<paste Phase 4 BI Engineer review or N/A>

## Tool Recommendation
- <Grafana for infra metrics / Streamlit / Dash> — <one-sentence rationale>
- No preference? Let the BI Engineer recommend during Phase 0.

## Constraints
- Monitoring scope: <real-time or batch refresh>
- Data freshness: <freshness requirement from Phase 5 pipeline>
- Infrastructure: <serving platform from Phase 5>

## Next Step
Run `/bi-engineer` or `/shards`. In Phase 0, reference this file:
services/<project_name>/bi-engineer-handoff.md
```

Tell the user: "Handoff file written. Run `/bi-engineer` or `/shards` and
reference `services/<project_name>/bi-engineer-handoff.md` in Phase 0."
Do NOT attempt to morph into or invoke the BI Engineer.
