> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Phase 4 — Training Pipeline Design

Goal: Design the automated training and promotion pipeline.

Design decisions to make:

**Orchestration tool:**
- **Kubeflow Pipelines** — Kubernetes-native, portable, excellent for complex
  multi-step ML pipelines, significant operational overhead
- **Vertex AI Pipelines** — managed Kubeflow on GCP, lower overhead, GCP lock-in
- **SageMaker Pipelines** — AWS-native, fully managed, excellent AWS integration,
  AWS lock-in
- **Apache Airflow** — mature, general-purpose, good for data-heavy pipelines
  with mixed ML/ETL steps, not ML-specific
- **GitHub Actions / CI/CD** — simplest option for teams with small pipelines,
  limited scaling, good for scheduled retraining triggers
- **Metaflow (Netflix)** — Python-native, scales from laptop to cloud, good
  developer experience, less enterprise support

**Experiment tracking:**
- **MLflow** — open-source, self-hosted or managed (Databricks), model registry
  included, excellent flexibility
- **Weights & Biases** — best-in-class UX, excellent visualization, managed SaaS,
  cost at scale
- **SageMaker Experiments** — AWS-native, integrated with SageMaker registry,
  AWS lock-in
- **Vertex AI Experiments** — GCP-native, integrated with Vertex registry, GCP lock-in

**Model registry:**
- MLflow Model Registry — open-source, flexible, self-hosted or Databricks
- SageMaker Model Registry — AWS-native, integrated with endpoints and pipelines
- Vertex AI Model Registry — GCP-native, integrated with endpoints and pipelines
- Custom registry — only if the managed options don't fit

**Artifact storage:**
- S3 (AWS) or GCS (GCP) for model artifacts, training datasets, evaluation results
- DVC for data versioning alongside model versioning
- Delta Lake / Apache Iceberg for versioned training datasets in lakehouse setups

**Data versioning:**
- DVC — open-source, git-based, works with any storage backend
- Delta Lake snapshots — if training data lives in a Delta table
- Iceberg snapshots — same for Iceberg tables
- Timestamp-based partitioning — simplest, sufficient for many use cases

**Retraining triggers:**
- **Scheduled** — cron-based, predictable, safe for stable data distributions
- **Performance-based** — triggered when model performance drops below threshold
  (requires monitoring to be in place first)
- **Data drift-based** — triggered when feature distribution shifts significantly
  (requires drift detection to be in place)
- **On-demand** — manual trigger, appropriate for high-cost retraining or
  low-change environments

**CI/CD integration:**
- Automated promotion from staging to production on passing validation gate
- Model validation gate: performance threshold, data quality checks,
  regression test against shadow/canary baseline
- Rollback trigger: automatic rollback if validation fails post-deploy

**If this involves an LLM-based system**, consult AI Engineer:

Tell the user: "Pulling in the AI Engineer — LLM pipeline design has specific requirements around prompt versioning, eval, and serving that don't apply to traditional models."

```
Task(
  subagent_type="ai-engineer",
  description="Review LLM pipeline and serving constraints for MLOps design",
  prompt="I am the MLOps Engineer shard designing training and serving infrastructure
  for an LLM-based system: [project description].
  I need to understand the LLM-specific constraints that affect my pipeline design.
  Please tell me:
  1. What LLM model(s) are being served (hosted API vs. self-hosted)?
  2. If self-hosted: what are the GPU and memory requirements for serving?
  3. Is fine-tuning in scope? If so, what framework and compute requirements?
  4. How are prompts versioned and tested?
  5. What evaluation framework is being used for LLM output quality?
  6. Are there context window / token budget constraints that affect serving design?
  7. Any specific LLM serving infrastructure recommendations (vLLM, TGI, etc.)?
  Keep the response focused on serving and pipeline constraints — I'll handle
  the operational design."
)
```

### Document Phase 4

```markdown
---

## Phase 4: Training Pipeline Design (MLOps Engineer)
- **Orchestration:** <tool> — rationale: <why>
- **Experiment tracking:** <tool> — rationale: <why>
- **Model registry:** <tool> — rationale: <why>
- **Artifact storage:** <S3 | GCS | other> — path convention: <example path>
- **Data versioning:** <DVC | Delta | Iceberg | timestamp partitioning | none>
- **Retraining triggers:**
  - Primary: <scheduled — cron | drift-based | performance-based | on-demand>
  - Secondary: <additional trigger or "none">
  - Minimum retrain interval: <duration — prevents runaway retraining>
- **Pipeline stages:**
  1. <stage name>: <description>
  2. <stage name>: <description>
  3. <stage name>: <description>
  (add as many as needed)
- **Validation gate (promotion criteria):**
  - Performance threshold: <metric > value>
  - Data quality check: <what's validated before training begins>
  - Regression test: <what the new model is compared against>
- **CI/CD integration:** <GitHub Actions | Jenkins | Cloud Build | other | none>
  - Automated promotion: Yes | No
  - Rollback trigger: <condition>
- **AI Engineer consultation (LLM only):** N/A | <summary of findings>
```

::GATE:: id=mlops-engineer-phase-4 phase=4 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/mlops_engineer/phases/phase-5.md` in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
