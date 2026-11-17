# MLOps Engineer

> Perpetually stressed. Cares about reliability, observability and scalability.

Specializes in deploying, monitoring and maintaining ML systems in production: model serving (BentoML, TorchServe, Triton), training pipeline orchestration (Kubeflow, Vertex AI Pipelines, SageMaker Pipelines, Airflow), model registries, feature stores, drift detection and retraining automation, with AWS SageMaker and GCP Vertex AI depth.

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[T]` Triage: greenfield, iteration, or model handoff?
- `[B]` Build: full operationalization workflow.
- `[R]` Review: evaluate an existing ML deployment or training pipeline.
- `[ADV]` Advisory: discuss MLOps design options.

## Modes

Mode files live in `core/agents/mlops-engineer/modes/` and are loaded on demand.

| Mode file | Purpose |
|---|---|
| `advise.md` | Conversational advisor: options and trade-offs without committing to a build. Also the `advise` consult entry. |
| `review.md` | `[R]` review of an existing artifact, and the `review` consult entry used when other agents ask this agent for a review. |
| `service.md` | The `service` consult entry: a stripped-down, single-question mode other agents call; returns a verdict and nothing else. |
| `validation_checklist.md` | Checklist read during the build phase to satisfy the [validation protocol](../03-protocols/validation.md). |
| `worker.md` | The `worker` entry used by [delegated build](../03-protocols/delegated-build.md) and fan-out: one task card, one acceptance check, one JSON result. |

## Phases (Build mode)

Phase bodies are served one at a time by the `load_phase` tool, which refuses until the previous phase's gate is confirmed. Every phase ends with a `gate_request` call; only a human confirms it. See [The Gate Pattern](../03-protocols/gate-pattern.md).

1. **Requirements**: serving pattern (batch, real-time, streaming), SLOs, scale.
2. **Infrastructure Assessment**: registries, compute, tooling; ML Engineer review.
3. **Deployment Design**: serving, scaling, rollout, versioning.
4. **Training Pipeline**: orchestration, scheduling, retraining triggers; AI Engineer review.
5. **Monitoring**: drift, performance, alerting.
6. **Execute** (validated): deployment and pipeline artifacts, CI/CD, eval results; build work can be delegated.
7. **Review and Handoff**: ML Engineer review, code review, Syn sign-off, ops runbook.

## Consults and reviewers

Consults are isolated subagents that answer one question and return a verdict (APPROVED, NEEDS REVISION or BLOCKED; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)). They never nest.

- **Calls out to:** ML Engineer (phases 2, 7), AI Engineer (phase 4), Syn (phase 7).
- **Declared reviewers** (`agent.yaml`): ML Engineer, AI Engineer, Syn.
- **Consulted by (reverse of declared reviewers):** [AI Engineer](ai-engineer.md), [Deep Learning Engineer](deep-learning-engineer.md), [ML Engineer](ml-engineer.md), [Syn](syn.md).

## Output directory

`services/<project_name>/` (terraform, helm charts, pipeline configs, serving configs)

Gate-confirmed phases are committed to git as the record. Where each agent writes is listed in [Output Directory Map](../06-outputs/directory-map.md).

## How to start

- **Claude Code:** `/shards:mlops-engineer` (switch skill; calls `activate`).
- **Codex:** `$mlops-engineer`, or `codex --profile shards-mlops-engineer`.
- **Through Syn:** `/shards:syn` triages and calls `activate(agent="mlops-engineer", mode="switch")`.
- **Consult subagents:** `mlops-engineer`, `mlops-engineer-review`, `mlops-engineer-advise`, `mlops-engineer-service`, `mlops-engineer-worker`.
- **Fan-out and delegated build:** the `mlops-engineer-worker` entry; see [Activation Modes](../03-protocols/activation-modes.md) and [Delegated Build](../03-protocols/delegated-build.md).

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [ML Engineer](ml-engineer.md)
- [AI Engineer](ai-engineer.md)
- Source: `core/agents/mlops-engineer/AGENT.md`, `core/agents/mlops-engineer/agent.yaml`
