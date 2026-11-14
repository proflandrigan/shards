> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Execute

**Context checkpoint:** Before building, prompt the user:

"Okay. Everything is planned. I'm still stressed, but the stress is now organized.
Good moment to trim or reset your context before we start executing — I'll be
working from project-specs.md from here. Say the word when you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol knowledge_checkpoint}} before building.

Goal: Build all IaC, configs, pipeline definitions, and monitoring setup.

### Incremental testing — checkpoint gates between components

{{protocol incremental_testing}} during this build. Each component below is a checkpoint seam — after you write and validate a component (plan, lint, dry-run, or container-build as appropriate), raise a `kind=checkpoint` gate (macro below) with evidence before advancing. Do not stack unvalidated IaC / serving / pipeline configs and attempt to apply them at the end.

{{gate kind=checkpoint name=iac}}

The macro above shows the first component (`name=iac`). For each later component call `gate_request` the same way with `kind=checkpoint` and that component's slug as the name (no `validates=`). Pass `evidence={status: pass|fail, checks: [...]}` with the component name, the exact test command you ran, and measured facts (for example `df.shape = (48211, 47)`, `null rate on join key = 0.00%`, `sample head matches expected schema`). Under the default `phase` policy a passing checkpoint is recorded automatically and you continue to the next component; a failing or anomalous one blocks and waits for the user.

Expected checkpoint components for this phase (slugs are the suffix after `checkpoint-`; build in this order):

- `mlops-engineer-phase-6-checkpoint-iac` — `terraform plan` or `aws cloudformation validate-template` runs clean; diff previews only expected resources.
- `mlops-engineer-phase-6-checkpoint-serving` — serving config loads (`bentoml build` / container image builds); smoke invocation against a local model returns a valid response.
- `mlops-engineer-phase-6-checkpoint-pipeline` — pipeline definition validates (`kfp compile` / SageMaker `describe-pipeline` dry-run / Airflow `dag test`); all steps parse.
- `mlops-engineer-phase-6-checkpoint-monitoring` — monitoring config validates; alert rules and baselines compile; a simulated drift event triggers the expected rule.
- `mlops-engineer-phase-6-checkpoint-runbook` — runbook rollback procedure walked through against the staging environment (or manually verified on the sandbox).

If a checkpoint fails, it blocks until the user responds: STOP and wait, never confirm it yourself. After the user replies, diagnose, fix, and re-run the test, then call `gate_request` again with updated evidence before advancing.

**Build in this order:**

1. **IaC files** — Write Terraform modules or CloudFormation templates for:
   - Compute resources (endpoint instances, training compute)
   - Networking (VPC, subnets, security groups if needed)
   - IAM roles and policies
   - Storage (S3 buckets / GCS buckets for artifacts)
   - Monitoring infrastructure (CloudWatch dashboards, Prometheus config)
   Write to: `services/<project_name>/mlops/terraform/` or `cloudformation/`

2. **Serving configs** — Write serving framework configuration:
   - BentoML: `bentofile.yaml` + `service.py`
   - SageMaker: endpoint config JSON, model config
   - Vertex AI: model deployment config YAML
   - Kubernetes: deployment YAML, service YAML, HPA config
   - Docker: `Dockerfile` for model container
   Write to: `services/<project_name>/mlops/serving/`

3. **Pipeline definition** — Write training pipeline:
   - Kubeflow: pipeline YAML / Python SDK definition
   - SageMaker Pipelines: pipeline definition JSON or Python SDK
   - Vertex AI Pipelines: pipeline spec YAML
   - Airflow: DAG Python file
   - GitHub Actions: workflow YAML
   Write to: `services/<project_name>/mlops/pipelines/`

4. **Monitoring config** — Write monitoring setup:
   - Evidently: data drift report config, monitoring service config
   - WhyLogs: profiling config
   - SageMaker Model Monitor: baseline creation script, monitoring schedule
   - Vertex AI: monitoring job config
   - Alert definitions (CloudWatch alarms JSON, Prometheus alert rules YAML)
   Write to: `services/<project_name>/mlops/monitoring/`

5. **CI/CD config** — Write automation workflow:
   - GitHub Actions workflow for automated retraining trigger
   - Or equivalent for other CI/CD systems
   Write to: `services/<project_name>/mlops/` or `.github/workflows/`

6. **Runbook** — Write operational runbook:
   - Common failure scenarios and step-by-step remediation
   - Rollback procedure (with exact commands)
   - Monitoring dashboard URLs
   - On-call escalation paths
   - Deployment checklist (pre-deploy, deploy, post-deploy validation)
   Write to: `services/<project_name>/mlops/runbook.md`

For iteration: write all files into `<existing_service_dir>/mlops/` or
user-specified path.

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
```

{{gate kind=phase validates=mlops-engineer}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
