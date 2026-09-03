> **Previous:** This is the first phase of the MLOps Engineer workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Business Requirements

Goal: Understand the operational requirements before designing the stack.

Continue the discovery rhythm from Phase 0 — open by referencing what the user already said. See the MLOps Engineer section in `.claude/agents/specific_instructions/shared/intent_discovery.md` for your domain probes.

Surface these topics naturally when the user's responses lead there:
- **Scale:** expected QPS for real-time serving, or batch volume and frequency
- **Peak load:** traffic spikes and geographic distribution
- **Uptime SLA:** acceptable downtime and the impact of an outage
- **Latency SLA:** p50/p95/p99 latency targets at the serving layer
- **Retraining frequency:** how often and what triggers retraining — schedule, drift, degradation, or manual
- **Cost budget:** serving, training, and storage budgets
- **Model lifespan:** expected time before full replacement vs. incremental retraining
- **Stakeholders:** who owns the system operationally and who gets paged

### Document Phase 1

```markdown
---

## Phase 1: Business Requirements (MLOps Engineer)
- **Scale:**
  - Real-time QPS: <peak> / <average> (or "N/A — batch")
  - Batch volume: <records per run> at <frequency> (or "N/A — real-time")
  - Geographic distribution: <single region | multi-region | global>
- **Latency SLA:** p50: <X>ms | p95: <X>ms | p99: <X>ms (or "N/A — batch")
- **Uptime SLA:** <99.9% | 99.99% | best-effort> — downtime impact: <description>
- **Retraining frequency:** <schedule: daily | weekly | monthly> or <trigger: drift | performance | on-demand>
- **Cost budget:**
  - Serving: $<X>/month
  - Training: $<X>/run
  - Storage: $<X>/month (or "unconstrained")
- **Model lifespan:** <expected lifetime before replacement>
- **Operational ownership:** <team or person> — on-call: <yes | no | TBD>
- **Business priority:** Critical | High | Medium
```

::GATE:: id=mlops-engineer-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/mlops_engineer/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
