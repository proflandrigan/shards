> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Execute

**Context checkpoint:** Before building, prompt the user:

"Okay. Everything is planned. I'm still stressed, but the stress is now organized.
Good moment to trim or reset your context before we start executing — I'll be
working from project-specs.md from here. Say the word when you're ready."

Wait for any signal from the user before dispatching any task.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

Goal: Build all IaC, configs, pipeline definitions, and monitoring setup as validated components, one task each, under a lead loop.

### Component specifications

Each task in `shards/<project_name>/mlops/tasks.yaml` cites one of these specifications through `plan_ref`. Workers see only the referenced sections, so keep each self-contained. Deliverables go to the confirmed `## Placement` targets ({{protocol placement}}), for iteration usually the existing service's deploy/infra location; the `shards/<project_name>/mlops/...` locations below are the greenfield default only. Validate each component as appropriate (plan, lint, dry-run, or container-build); never stack unvalidated IaC, serving or pipeline configs to apply at the end.

**Spec A. IaC files.** Terraform modules or CloudFormation templates for:
   - Compute resources (endpoint instances, training compute)
   - Networking (VPC, subnets, security groups if needed)
   - IAM roles and policies
   - Storage (S3 buckets / GCS buckets for artifacts)
   - Monitoring infrastructure (CloudWatch dashboards, Prometheus config)

   Location: `shards/<project_name>/mlops/terraform/` or `cloudformation/`.
   Acceptance: `terraform plan` or `aws cloudformation validate-template` runs clean; the diff previews only expected resources.

**Spec B. Serving configs.** Serving framework configuration:
   - BentoML: `bentofile.yaml` + `service.py`
   - SageMaker: endpoint config JSON, model config
   - Vertex AI: model deployment config YAML
   - Kubernetes: deployment YAML, service YAML, HPA config
   - Docker: `Dockerfile` for model container

   Location: `shards/<project_name>/mlops/serving/`.
   Acceptance: the serving config loads (`bentoml build` / container image builds); a smoke invocation against a local model returns a valid response.

**Spec C. Pipeline definition.** Training pipeline:
   - Kubeflow: pipeline YAML / Python SDK definition
   - SageMaker Pipelines: pipeline definition JSON or Python SDK
   - Vertex AI Pipelines: pipeline spec YAML
   - Airflow: DAG Python file
   - GitHub Actions: workflow YAML

   Location: `shards/<project_name>/mlops/pipelines/`.
   Acceptance: the definition validates (`kfp compile` / SageMaker `describe-pipeline` dry-run / Airflow `dag test`); all steps parse.

**Spec D. Monitoring config.** Monitoring setup:
   - Evidently: data drift report config, monitoring service config
   - WhyLogs: profiling config
   - SageMaker Model Monitor: baseline creation script, monitoring schedule
   - Vertex AI: monitoring job config
   - Alert definitions (CloudWatch alarms JSON, Prometheus alert rules YAML)

   Location: `shards/<project_name>/mlops/monitoring/`.
   Acceptance: monitoring config validates; alert rules and baselines compile; a simulated drift event triggers the expected rule.

**Spec E. CI/CD config.** Automation workflow: a GitHub Actions workflow for the automated retraining trigger, or the equivalent for another CI/CD system. Location: `shards/<project_name>/mlops/` or `.github/workflows/`.

**Spec F. Runbook.** Operational runbook:
   - Common failure scenarios and step-by-step remediation
   - Rollback procedure (with exact commands)
   - Monitoring dashboard URLs
   - On-call escalation paths
   - Deployment checklist (pre-deploy, deploy, post-deploy validation)

   Location: `shards/<project_name>/mlops/runbook.md`.
   Acceptance: the rollback procedure is walked through against the staging environment (or manually verified on the sandbox).

### Lead loop

{{protocol delegated_build}} governs this phase. Task evidence guidance: {{protocol incremental_testing}} (validate each component as its task completes).

{{delegate tasks=shards/<project_name>/mlops/tasks.yaml max_parallel=3}}

1. **Load the task list** approved at the plan gate (`shards/<project_name>/mlops/tasks.yaml`) and validate it with `tasks_set`. Each task cites a specification above through `plan_ref`.
2. **Dispatch** ready tasks with `task_dispatch`, in parallel up to the cap of 3, in `depends_on` order (typically IaC, then serving, pipeline, monitoring, CI/CD, runbook).
3. **Receive** each worker's result via `task_report`.
4. **Verify before it counts.** Re-run (or independently check) the acceptance command, compare with the `plan_ref` specification, then write an evidence row to the `## Validation` Evidence table (Check = task id + component, Expected, Observed, Pass/Fail), with the exact command run and measured facts. Never mark a task done on the worker's word alone.
5. **On failure**, re-dispatch the task with the failure output as feedback, at most 2 retries; then stop and ask the user with a summary.
6. **Deviations.** If a worker reports a deviation or the plan cannot be met, pause dependent tasks and follow {{protocol plan_drift}}; amend the plan or task list only through a confirmed gate.
7. **Continue** dispatching tasks unblocked by tasks you have verified as done.
8. You write no IaC, config or pipeline code yourself unless a task is marked `delegate: inline`.

When all tasks are verified done, record the final integration evidence row in `## Validation`, then document the phase and raise the gate.

### Document Phase 6

```markdown
---

## Phase 6: Build Log (MLOps Engineer)
- **IaC files:**
  - <file path>: <description>
- **Serving configs:**
  - <file path>: <description>
- **Pipeline definition:**
  - <file path>: <description>
- **Monitoring config:**
  - <file path>: <description>
- **CI/CD config:** <file path or "N/A">
- **Runbook:** <file path>
- **Deviations from plan:** <changes and why, or "none">
- **Known gaps:** <anything that requires manual setup or future work>

### Validation

| Check | Expected | Observed | Pass/Fail |
|---|---|---|---|
| <task id> <component> | <acceptance expected> | <command and measured facts> | PASS \| FAIL |
```

{{gate kind=phase validates=mlops-engineer}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
