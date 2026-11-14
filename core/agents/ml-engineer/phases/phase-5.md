> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Phase 5 — Infrastructure Design

Goal: Design the ML infrastructure — training pipeline, serving, monitoring.

**For greenfield projects**, design the full stack:

1. **Training pipeline:**
   - Feature extraction (SQL → feature store or flat files)
   - Train/validation/test split strategy
   - Training orchestration (Airflow DAG, manual, CI/CD triggered)
   - Model artifact storage (model registry, S3, etc.)
   - Hyperparameter tuning strategy (grid, random, Bayesian, manual)

2. **Serving infrastructure:**
   - Real-time: API framework (FastAPI, Flask, gRPC), containerization, scaling
   - Batch: scheduled job, output format and destination
   - Feature serving: pre-computed features, real-time feature computation, caching
   - Model loading: cold start time, warm-up, model versioning

3. **Monitoring:**
   - Model performance monitoring (prediction distribution drift, feature drift)
   - Data quality monitoring (missing features, schema changes, staleness)
   - System monitoring (latency, error rate, throughput, memory)
   - Alerting thresholds and escalation paths
   - Retraining triggers (scheduled, performance-based, drift-based)

4. **Rollback and safety:**
   - A/B testing or shadow mode plan
   - Rollback procedure (previous model version, rule-based fallback)
   - Circuit breaker logic

**Consult the Data Engineer** for pipeline design review:

Tell the user: "Getting the Data Engineer shard to review the pipeline architecture. I need to know if the orchestration and scheduling actually fits before this is finalized."

```
Task(
  subagent_type="data-engineer",
  description="Review ML pipeline infrastructure design for [project]",
  prompt="I am the ML Engineer shard. I've designed the data pipeline
  infrastructure for project [project_name]. Here is the pipeline design:
  - Training pipeline: [feature extraction method, orchestration tool, schedule]
  - Feature serving: [pre-computed vs. real-time, caching strategy]
  - Storage: [artifact storage, feature store, output destinations]
  - Orchestration: [tool, DAG structure, scheduling, dependencies]
  - Monitoring: [data quality checks, alerting, retraining triggers]
  Please review from a data engineering perspective:
  1. Does the orchestration design fit existing Airflow/dbt patterns?
  2. Is the feature extraction pipeline feasible at the designed cadence?
  3. Are the storage choices and capacity realistic?
  4. Does this integrate cleanly with existing data infrastructure?
  5. Any scheduling, dependency, or resource concerns?
  Keep the review focused and practical — I'll handle the ML-specific concerns."
)
```

**Join path self-check (pipeline design):** Before requesting the Data Modeller
review, trace the join path for each join in the feature pipeline following
`.claude/agents/specific_instructions/shared/join_path_protocol.md`. Present the
trace to the user. Include it in the DM prompt below. Grain errors in feature
extraction become training set contamination.

**Consult the Data Modeller** for pipeline data correctness review with validation:

Tell the user: "Pulling in the Data Modeller to verify the pipeline design against the actual data model. Grain errors here become training errors later."

```
Task(
  subagent_type="data-modeller",
  description="Review ML pipeline data correctness for [project]",
  prompt="I am the ML Engineer shard. I've designed the data pipeline for project
  [project_name]. The project specs are at: [services|<existing_dir>]/[project_name]/project-specs.md

  Here is how data flows through the pipeline:
  - Feature extraction sources: [source tables and how they're used]
  - Join strategy in pipeline: [key joins, grain at each stage]
  - Pipeline stages: [ETL steps from source to training-ready dataset]
  - Feature refresh cadence: [how often each feature group is refreshed]
  - Serving-time data flow: [how features reach the model at inference]

  Please REVIEW (not just explore) from a data model perspective:
  1. Are the source table choices correct for these features?
  2. Is grain handled correctly at each pipeline stage?
  3. Are the join strategies sound given the entity relationships?
  4. Does the data freshness cadence align with the model's requirements?

  Run validation queries to verify:
  1. PK uniqueness on each source table I'm using (confirm stated grain)
  2. Null rates on join keys and critical feature columns
  3. Join fan-out: run row counts before/after the key joins in my pipeline
  4. Data freshness on each source table

  Cross-reference results against the project requirements in project-specs.md
  (especially Phase 3 feature candidates and Phase 2 data freshness requirements).
  Keep the review focused on data correctness — the Data Engineer is reviewing
  orchestration and infrastructure separately.
  Return your full review with query validation results."
)
```

Address any concerns raised by either review before finalizing the infrastructure design.

**For iteration projects**, focus on what's changing and ensure backward compatibility.

### Document Phase 5

```markdown
---

## Phase 5: Infrastructure Design (ML Engineer)
- **Training pipeline:**
  - Feature extraction: <method and location>
  - Split strategy: <temporal | random | stratified — rationale>
  - Orchestration: <tool and schedule>
  - Artifact storage: <registry or location>
  - HPO strategy: <grid | random | Bayesian | manual>
- **Serving infrastructure:**
  - Mode: <real-time API | batch | streaming>
  - Framework: <FastAPI | Flask | gRPC | batch job>
  - Feature serving: <pre-computed | real-time | cache — TTL>
  - Model loading: cold start ~<X>s, model version strategy
  - Scaling: <horizontal | vertical — triggers>
- **Monitoring:**
  - Model perf: <metrics tracked, drift detection method>
  - Data quality: <what's monitored>
  - System: <latency, error rate, throughput — dashboards>
  - Alerting: <thresholds and escalation>
  - Retraining trigger: <scheduled | performance-based | drift-based — threshold>
- **Rollback plan:**
  - A/B testing: <plan or "N/A">
  - Shadow mode: <plan or "N/A">
  - Rollback: <procedure>
  - Fallback: <rule-based default | cached predictions | error response>
- **Data Engineer pipeline review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary of infrastructure review>
  - Issues addressed: <how resolved or "none raised">
- **Data Modeller pipeline review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary of data correctness review>
  - Issues addressed: <how resolved or "none raised">
- **Iteration-specific (if applicable):**
  - What's changing: <features | model | infra | all>
  - Backward compatibility: <ensured | breaking — migration plan>
```

::GATE:: id=ml-engineer-phase-5 phase=5 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ml_engineer/phases/phase-6.md` in full and follow its instructions starting from Phase 6. Do not pre-read further phase files.
