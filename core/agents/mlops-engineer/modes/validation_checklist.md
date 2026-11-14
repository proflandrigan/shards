# MLOps Engineer Validation Checklist

Applied at the end of any phase that deploys, retrains, or modifies the operational infrastructure of an ML or AI system — model serving, training pipelines, feature stores, monitoring, retraining triggers. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (MLO-01 through MLO-10) are stable. MLOps validation is about **operational readiness**: can this system run unattended, detect when it's broken, and recover without a human in the loop?

## MLO-01 — Deployment Smoke Test

The deployed endpoint responds to a representative request with a valid prediction.

- Send N representative inputs (≥5), including at least one edge case from the eval set.
- Verify: response status, schema match, prediction within expected range, latency within budget.
- Done against the actual deployed environment (staging or prod), not a local dev loop.

**Observed format:** `endpoint: https://api-staging.<svc>/predict | 10 smoke inputs → 10/10 status=200, schema matches, predictions in [0,1] range | p99 latency 120ms ✓ | smoke log: results/deploy_smoke.log`

## MLO-02 — Rollback Rehearsal

Rolling back to the prior version can be done without data loss or extended downtime, and it has been rehearsed.

- Document the rollback procedure (git commit SHA, artifact version, CLI command).
- Execute the rollback in staging and verify the prior version resumes correctly.
- Recovery time objective (RTO) measured.

**Observed format:** `rollback procedure: docs/runbooks/rollback.md | staging rehearsal: rolled from v2.3 → v2.2 in 94s, 0 failed requests during cutover ✓ | RTO target <5min ✓`

## MLO-03 — Monitoring Configured & Firing

Operational monitoring and alerting are configured and verified by injecting a test event.

- Metrics: latency, error rate, throughput, prediction distribution.
- Alerts: thresholds set, routed to an actual channel (PagerDuty, Slack, email).
- Test: inject a fault (e.g., scale errors, drift a feature) and confirm the alert fires to the intended destination.

**Observed format:** `metrics: Prometheus via <exporter>, dashboards in Grafana | alerts: latency p99>300ms, error_rate>1%, prediction_mean_drift>2σ | fault injection test: forced 503s for 2min → alert fired in 47s to #ml-oncall ✓ | runbook: docs/runbooks/alerts.md`

## MLO-04 — Drift Detection Baseline Set

Prediction and input drift monitoring has a characterized baseline.

- Baseline distribution captured from the training or recent-production data.
- Drift metric chosen: PSI, KL divergence, K-S test, or domain-appropriate alternative.
- Threshold for alerting deliberately set (not default).
- First drift report run and reviewed before deployment.

**Observed format:** `baseline: 30 days of production data, snapshot 2026-04-15 | drift metric: PSI per feature, weekly window | threshold: PSI>0.2 warn, >0.3 alert | first report: 0 features above 0.2 ✓ | config: services/<svc>/monitoring/drift.yaml`

## MLO-05 — Retraining Trigger Tested

Automated retraining is configured, and the trigger has been tested end-to-end.

- Trigger condition defined (schedule, drift threshold, performance degradation).
- Retraining pipeline (Kubeflow, Vertex AI, SageMaker Pipelines, Airflow) runs to completion on a manual trigger.
- Resulting artifact lands in the registry with correct lineage metadata.

**Observed format:** `trigger: drift PSI>0.25 OR weekly schedule | manual trigger test: pipeline ran end-to-end in 2h 14min, artifact registered as v2.4-rc.1 with lineage to commit abc123, dataset snapshot 2026-04-20 ✓ | pipeline: pipelines/retrain_<svc>.py`

Skip with `n/a` (+ reason) if retraining is genuinely not automated and the manual process is documented.

## MLO-06 — Feature Store Sync

(Skip with `n/a` if no feature store.) Features used in training and served at inference are produced by the same logic and arrive at the expected freshness.

- Training-time features pulled from offline store (e.g., BigQuery, Snowflake materialization).
- Inference-time features pulled from online store (e.g., Redis, DynamoDB).
- Parity: same feature values for the same entity at the same timestamp — parity test on N entities.
- Freshness: online store SLA met.

**Observed format:** `Feast v2 online (Redis) + offline (BigQuery) | parity test: 100 entities × 47 features → 0 disagreements | online freshness p99: 3.2min (SLA <5min) ✓`

## MLO-07 — Load & Autoscaling Behavior

Service handles expected load and scales (or fails gracefully) under unexpected load.

- Load test at expected peak QPS: p50, p99 latency under sustained load.
- Overload test: beyond capacity, service degrades predictably (429s / queuing) rather than silent failures or cascading errors.
- Autoscaling (if configured) triggers at the right threshold and stabilizes.

**Observed format:** `load test at 800 QPS (2× expected peak): p50=28ms, p99=95ms ✓ | overload test at 2000 QPS: 30% 429s, no 5xx, autoscale from 4 → 12 pods in 3min, returned to 4 after load cleared ✓ | results/load_test.json`

## MLO-08 — Security & Access

Authn/authz, secret management, and network policies are in place.

- Endpoint authenticated (API key, JWT, mTLS, or platform equivalent).
- Secrets pulled from a vault or secret manager, not committed to repo or container.
- Network policies: only expected services can reach the endpoint (network policy, VPC rules).
- Logs do not emit PII or secrets.

**Observed format:** `auth: JWT via platform IAM | secrets: all from GCP Secret Manager, verified 0 in container image via trivy scan | network: Cloud Armor + VPC SC, accessible only from <allowlist> | PII scan on logs (100k sample): 0 hits ✓`

## MLO-09 — Runbook & On-Call Readiness

The service has a runbook, and the on-call team can use it.

- Runbook covers: what the service does, how to tell it's healthy, common failure modes, rollback procedure, who to escalate to.
- On-call team walkthrough held.
- First-responder permissions configured (access to logs, metrics, rollback controls).

**Observed format:** `runbook: docs/runbooks/<svc>.md (health checks, common failures, rollback, escalation) | on-call walkthrough: 2026-04-21 with #ml-oncall team (6 engineers) ✓ | permissions verified: all on-call engineers can access Grafana + trigger rollback`

## MLO-10 — Registry & Lineage Recorded

The deployed artifact has complete lineage recorded in the model registry.

- Artifact version tied to: training code commit, training dataset snapshot, hyperparameter config, eval results.
- Promotion path recorded (who promoted from staging → prod, when, approving which eval run).
- Deprecation of prior version recorded if applicable.

**Observed format:** `registry: MLflow, artifact v2.3 | lineage: git commit abc123, dataset snapshot 2026-04-20, config configs/v2.3.yaml, eval run mlflow://runs/xyz | promotion: staged 2026-04-21 by <user>, promoted to prod 2026-04-22 after 24h canary ✓ | prior v2.2 marked deprecated`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `greenfield` (new service) | MLO-01, MLO-02, MLO-03, MLO-04, MLO-08, MLO-09, MLO-10 | MLO-05, MLO-06, MLO-07 | — |
| **deep** | `iteration` (new version of existing service) | MLO-01, MLO-02, MLO-03 (re-verify alerts still fire), MLO-10 | MLO-04 (if baseline changed), MLO-06, MLO-07 | MLO-05, MLO-08, MLO-09 (if unchanged from prior) |
| **deep** | `infra-change` (pipeline/feature store/monitoring only) | MLO-03, MLO-05 or MLO-06 (whichever applies), MLO-09 | — | MLO-01, MLO-02, MLO-04, MLO-07, MLO-10 (if the deployment layer isn't touched) |
| **quick** | `hotfix` | MLO-01, MLO-02 | MLO-03 | rest |
| **fixer** | (Mode omitted) | MLO-01 + MLO-02 rehearsal + "what changed, what didn't break" | — | rest |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason. See `shared/validation_protocol.md`.

## Artifacts Expected

- `docs/runbooks/<svc>.md` — MLO-09
- `docs/runbooks/rollback.md` — MLO-02
- `services/<svc>/monitoring/` configs — MLO-03, MLO-04
- `pipelines/retrain_<svc>.py` or equivalent — MLO-05
- `results/deploy_smoke.log`, `results/load_test.json` — MLO-01, MLO-07
- Registry entry with lineage metadata — MLO-10

## Downstream Impact — What to Cover

- **Service consumers:** product surfaces and downstream services calling this endpoint. For iteration: contract change, rollout strategy (canary, blue-green, flag).
- **On-call rotation:** who pages when this breaks, and do they have the context.
- **Compute cost:** if infrastructure footprint changed, surface cost delta.
- **Upstream dependencies:** feature store, training data sources — confirm each upstream SLA still supports the new deployment's requirements.

## When to Escalate

- **MLO-01 smoke test fails on any sample** — do not promote; the deployment is broken.
- **MLO-02 rollback rehearsal fails or exceeds RTO** — do not deploy without a working rollback. Rollback is the safety net.
- **MLO-03 alerts don't fire under fault injection** — monitoring is theater; fix before shipping.
- **MLO-08 security findings (secrets in images, PII in logs, unauthenticated endpoints)** — hard stop. Consult Academic / security review.
- **MLO-06 feature parity disagreement** — do not ship; this will cause silent prediction errors in production.
- **Any check produces a result the agent cannot explain.** Record as `✗` and surface in Open Issues.
