> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

---

## Phase 2 — Infrastructure Assessment

Goal: Understand existing infrastructure and constraints before designing anything.

Ask about:
- **Existing ML infrastructure:** model registry, feature store, serving layer,
  training orchestrator, experiment tracker — what exists, what doesn't
- **Cloud services available:** Which managed services can we use? Any
  organizational restrictions?
- **Compliance / security constraints:** Data residency requirements, VPC
  isolation, IAM constraints, PII handling, audit logging requirements
- **Team capabilities:** What tooling does the team already know and operate?
  (Important — the right tool for a team that knows Kubernetes is different from
  the right tool for a team that doesn't)
- **Data pipeline integration:** How do features arrive at training time?
  At serving time? What's the existing data infrastructure?
- **Existing monitoring:** Any existing observability stack (Prometheus,
  Datadog, CloudWatch, etc.) that ML monitoring should integrate with?

**Consult the ML Engineer** for model architecture constraints that affect serving:

Tell the user: "Getting the ML Engineer in here — I need to know what the model actually requires before I design serving infrastructure around assumptions."

```
Task(
  subagent_type="ml-engineer",
  description="Review model architecture constraints for MLOps serving design",
  prompt="I am the MLOps Engineer shard scoping an MLOps project for: [project description].
  I need to understand the model architecture constraints that affect my serving and
  infrastructure design. Please tell me:
  1. What is the model framework and format (scikit-learn, XGBoost, PyTorch, TensorFlow, etc.)?
  2. What are the model size and memory requirements (serialized size, memory at inference)?
  3. What are the serving-time feature requirements (features needed at inference, latency sensitivity)?
  4. Does the model support batch inference, online inference, or both?
  5. Are there GPU requirements for inference?
  6. Any known serving constraints or failure modes for this model type?
  7. What's the expected retraining cadence and artifact size?
  Keep the response focused on serving constraints — I'll handle the operational design."
)
```

### Document Phase 2

```markdown
---

## Phase 2: Infrastructure Assessment (MLOps Engineer)
- **Existing ML infrastructure:**
  - Model registry: <exists — describe | needs setup | N/A>
  - Feature store: <exists — describe | needs setup | N/A>
  - Serving layer: <exists — describe | needs design>
  - Training orchestrator: <Airflow | Kubeflow | SageMaker Pipelines | Vertex AI Pipelines | none>
  - Experiment tracker: <MLflow | W&B | SageMaker Experiments | none>
- **Cloud services available:** <list of relevant managed services>
- **Compliance / security:**
  - Data residency: <constraints or "none">
  - VPC / network: <constraints or "none">
  - IAM: <constraints or "none">
  - Audit logging: <required | not required>
- **Team capabilities:** <what tooling they know and operate>
- **Data pipeline integration:**
  - Training-time features: <how they arrive>
  - Serving-time features: <how they arrive>
  - Feature freshness: <SLA>
- **Existing observability stack:** <tools or "none">
- **ML Engineer consultation:**
  - Model framework: <framework and format>
  - Model size: ~<X>MB serialized, ~<X>MB at inference
  - GPU required for inference: Yes | No
  - Serving constraints: <summary of findings>
```

::GATE:: id=mlops-engineer-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/mlops_engineer/phases/phase-3.md` in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
