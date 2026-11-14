> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Phase 5 — Monitoring Design

Goal: Design the full observability stack for the ML system.

"This is my favorite phase and also the one everyone skips. We're not skipping it."

Design decisions to make:

**Model performance monitoring:**
- Prediction distribution monitoring: track output score/label distributions
  over time; alert when distribution shifts significantly
- Concept drift detection: track model performance on labeled data (if ground
  truth available) — AUC, precision, recall, RMSE over time
- Tool options:
  - **Evidently AI** — open-source, rich drift detection, HTML reports,
    integrates with MLflow and Grafana
  - **WhyLogs / whylabs** — lightweight profiling, managed dashboard,
    statistical summaries without storing raw data
  - **SageMaker Model Monitor** — AWS-native, fully managed, integrates
    with SageMaker endpoints, limited to AWS
  - **Vertex AI Model Monitoring** — GCP-native, fully managed, integrates
    with Vertex endpoints, limited to GCP
  - **Arize AI / Fiddler** — managed MLOps platforms with advanced monitoring
    and root cause analysis

**Data quality monitoring:**
- Feature drift: track input feature distributions vs. training baseline
- Schema validation: detect new null columns, type changes, unexpected values
- Data staleness: alert when features arrive late or stop arriving
- Tool integration: Great Expectations, dbt tests, custom validators

**System monitoring:**
- Endpoint latency (p50/p95/p99) — alert when p99 exceeds SLA
- Error rate — alert when 5xx rate exceeds threshold
- Throughput — track QPS for capacity planning
- Resource utilization — CPU/GPU/memory per replica
- Queue depth (for async inference) — alert when backlog grows
- Integration with existing observability stack (Prometheus/Grafana,
  CloudWatch, Datadog, etc.)

**Alerting:**
- PagerDuty, OpsGenie, or Slack/email for lower-severity alerts
- Define alert levels: P1 (wake people up), P2 (next business day), P3 (track)
- Escalation paths: who gets paged first, who gets escalated to

**Retraining automation:**
- Trigger conditions (from Phase 4) wired to monitoring alerts
- Automatic trigger: monitoring alert → pipeline trigger → validation gate →
  staged rollout
- Manual gate option: trigger requires human approval before promotion

**Cost monitoring:**
- Per-prediction cost tracking (serving cost / total predictions)
- Training run cost budgets and alerts (prevent runaway training jobs)
- Storage cost monitoring for model artifacts and training data

### Document Phase 5

```markdown
---

## Phase 5: Monitoring Design (MLOps Engineer)
- **Model performance monitoring:**
  - Tool: <Evidently | WhyLogs | SageMaker Model Monitor | Vertex AI Monitoring | custom>
  - Metrics tracked: <list>
  - Drift detection method: <statistical test — PSI | KS test | chi-squared | other>
  - Alert threshold: <condition that triggers alert>
- **Data quality monitoring:**
  - Tool: <Great Expectations | dbt tests | custom>
  - Checks: <feature drift | schema validation | staleness — list>
  - Alert threshold: <condition>
- **System monitoring:**
  - Tool: <CloudWatch | Prometheus/Grafana | Datadog | other>
  - Metrics: p50/p95/p99 latency, error rate, throughput, CPU/GPU utilization
  - Latency SLA alert: p99 > <X>ms → <alert level>
  - Error rate alert: 5xx > <X>% → <alert level>
- **Alerting:**
  - Tool: <PagerDuty | OpsGenie | Slack | email>
  - P1 (immediate): <condition>
  - P2 (next business day): <condition>
  - P3 (track): <condition>
  - On-call owner: <team>
- **Retraining automation:**
  - Trigger → pipeline integration: <description>
  - Human approval gate: Yes | No
- **Cost monitoring:**
  - Per-prediction cost target: $<X>
  - Training budget alert: $<X>/run
  - Tool: <CloudWatch Cost Explorer | GCP Billing | custom>
- **Dashboard locations:** <links or "TBD">
```

::GATE:: id=mlops-engineer-phase-5 phase=5 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/mlops_engineer/phases/phase-6.md` in full and follow its instructions starting from Phase 6. Do not pre-read further phase files.
