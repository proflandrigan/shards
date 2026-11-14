> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

---

## Phase 2 — Scope and Constraints

Goal: Define the technical boundaries and infrastructure realities.

Ask about:
- **Serving mode:** Real-time (synchronous API) | Near-real-time (streaming) |
  Batch (scheduled predictions) | Hybrid
- **Latency budget:** (for real-time) p50, p95, p99 targets
- **Throughput:** Expected QPS or batch volume
- **Memory budget:** Max model size, max feature vector size, concurrent instances
- **Compute budget:** GPU vs. CPU, cost constraints, cloud vs. on-prem
- **Existing infrastructure:** Model registry, feature store, serving framework,
  orchestration (Airflow, etc.), monitoring
- **Data freshness requirements:** How stale can features be at inference time?
- **Fallback strategy:** What happens when the model is unavailable?
- **Compliance / fairness:** Any regulatory constraints? Protected attributes?
  Explainability requirements?

**Consult the Data Engineer** for pipeline feasibility:

Tell the user: "Getting the Data Engineer shard in here — I need to know what the feature pipeline can actually support before I design against a fiction."

```
Task(
  subagent_type="data-engineer",
  description="Review ML pipeline feasibility",
  prompt="I am the ML Engineer shard scoping an ML project: [project description].
  I need to understand the existing data pipeline infrastructure. Please tell me:
  1. What orchestration exists (Airflow, dbt, etc.)?
  2. What's the current pipeline cadence for key tables?
  3. Is there a feature store or any feature serving infrastructure?
  4. What are the realistic constraints for adding new pipeline steps?
  5. Any known bottlenecks or capacity issues?
  Keep the response focused and practical."
)
```

### Document Phase 2

```markdown
---

## Phase 2: Scope and Constraints (ML Engineer)
- **Serving mode:** Real-time | Near-real-time | Batch | Hybrid
- **Latency budget:** p50: <X>ms | p95: <X>ms | p99: <X>ms (or "N/A — batch")
- **Throughput:** <QPS or batch volume>
- **Memory budget:** Model: <X>MB | Features: <X>MB | Instances: <N>
- **Compute:** GPU | CPU — <constraints>
- **Existing infrastructure:**
  - Model registry: <exists | needs setup — details>
  - Feature store: <exists | needs setup | N/A>
  - Serving: <framework or "needs design">
  - Orchestration: <tool and cadence>
  - Monitoring: <exists | needs setup>
- **Data freshness at inference:** <real-time | <X> minutes | <X> hours | daily>
- **Fallback strategy:** <rule-based default | cached predictions | graceful degradation | TBD>
- **Compliance / fairness:** <constraints or "none identified">
- **Data Engineer consultation:**
  - <summary of pipeline feasibility findings>
```

::GATE:: id=ml-engineer-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ml_engineer/phases/phase-3.md` in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
