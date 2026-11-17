# Workflow: Deep Study to Production Model

When an analytical question evolves into a deployed ML service. The work moves Data Scientist, then ML Engineer, then MLOps Engineer, with reviewer consults along the way.

## Flow

```
/shards:syn  (or /shards:data-scientist)
  └─ Data Scientist (studies/<p>/)
     ├─ Phases 1-5: question, data, methodology, modelling, output format (gated)
     ├─ Phase 6: execute analysis (validated gate; Researcher consult for methodology)
     └─ Phase 7: findings, Syn sign-off, handoff brief -> ML Engineer
          │
          └─ ML Engineer (models/<p>/)
             ├─ Phases 1-5: problem, boundaries, data, approach, pipeline design
             ├─ Phase 6: build (validated gate, delegated build, per-component checkpoints)
             ├─ Phase 6.5: winner selection (optional)
             └─ Phase 7: Backend + MLOps review, Syn sign-off, model card, handoff
                  │
                  └─ MLOps Engineer (services/<p>/)
                     ├─ Phases 1-5: infrastructure, deployment, training pipeline, monitoring
                     ├─ Phase 6: build deployment and pipeline artifacts (validated gate)
                     └─ Phase 7: review and handoff, ops runbook
```

Output directories come from each agent's `agent.yaml`: `studies/{project}/`, `models/{project}/`, `services/{project}/`. See [Directory map](../06-outputs/directory-map.md).

## How the handoffs happen

Each specialist is its own agent. Between them you switch agents in the same session: `/shards:ml-engineer` after the study is signed off, then `/shards:mlops-engineer`. Syn can also orchestrate the whole chain in PM mode (see [Syn](../02-agents/syn.md)). Each new specialist starts from the previous one's committed outputs and brief, not from chat history, so `/shards:resume` and fresh sessions work equally well.

### Data Scientist to ML Engineer

The Data Scientist's `ml_engineer_handoff` mode produces a structured brief:

- final feature set and sources
- modelling methodology and metric definitions
- known limitations, assumptions and data quality caveats
- suggested production infrastructure constraints

### ML Engineer to MLOps Engineer

After the ML Engineer ships a trained model with evaluation and a model card, the MLOps Engineer picks up:

- serving target (batch, real-time, streaming)
- latency budget
- model registry and versioning strategy
- retraining cadence and triggers
- monitoring alerts

## Gates and evidence

Every phase ends with a `gate_request` tool call after the agent writes `project-specs.md` and reads the section back. Build phases (Data Scientist 6, ML Engineer 6, MLOps 6) are validated: the gate carries `validates=<agent>` and expects executed evidence of correctness. During builds, the [incremental-testing protocol](../03-protocols/incremental-testing.md) adds `checkpoint` gates between components; under the default `phase` policy they are recorded automatically when the agent passes `evidence: { status: "pass" }`. Each confirmed advancing gate commits that agent's output directory. See [Gate pattern](../03-protocols/gate-pattern.md).

## Delegated build

Build phases can split into a task manifest (`<output_dir>/tasks.yaml`) that worker subagents execute in parallel while the main agent verifies results. See [Delegated build](../03-protocols/delegated-build.md).

## Reviewer layers

Consults run as subagents (activation mode `consult`) and return findings:

- Researcher: statistical methodology at the modelling phase
- Data Modeller: feature source grain before pipeline build
- Data Analyst: feature interpretability if high explainability is required
- Applied ML Scientist: methodology review if non-standard
- Deep Learning Engineer: architecture review if deep learning
- Syn: final review at each specialist's last phase

## Knowledge and reference material

There is no built-in ledger. Check and record reference material through the `knowledge` job, which defaults to `docs/` and the git log. See [Knowledge](../03-protocols/knowledge.md).

## See also

- [Data Scientist](../02-agents/data-scientist.md)
- [ML Engineer](../02-agents/ml-engineer.md)
- [MLOps Engineer](../02-agents/mlops-engineer.md)
- [Activation modes](../03-protocols/activation-modes.md)
