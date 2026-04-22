# Workflow: Deep Study → Production Model

When an analytical question evolves into a deployed ML service. Touches Data Scientist → ML Engineer → MLOps Engineer, with reviewer consults along the way.

## Flow

```
/shards
  └─ Data Scientist (studies/<p>/)
     ├─ EDA
     ├─ Feature engineering
     ├─ Modeling (Researcher consult for methodology)
     ├─ Report
     └─ Handoff brief → ML Engineer
          │
          └─ ML Engineer (models/<p>/ or services/<p>/)
             ├─ Production data pipeline
             ├─ Training loop + eval
             ├─ Applied ML Scientist consult (if non-standard)
             ├─ Deep Learning Engineer consult (if DL)
             ├─ Model card
             └─ Handoff → MLOps Engineer
                  │
                  └─ MLOps Engineer (services/<p>/)
                     ├─ Serving (BentoML / Triton / SageMaker / Vertex)
                     ├─ Monitoring + drift detection
                     └─ Retraining pipeline
```

## Key handoffs

### DS → MLE

The Data Scientist's `ml_engineer_handoff.md` variant produces a structured brief:

- Final feature set + sources.
- Modeling methodology + metric definitions.
- Known limitations, assumptions, and data quality caveats.
- Suggested production infrastructure constraints.

The ML Engineer's incoming-handoff instructions read this brief at Phase 1.

### MLE → MLOps

After the ML Engineer ships a trained model with eval + model card, the MLOps Engineer picks up:

- Serving target (batch / real-time / streaming).
- Latency budget.
- Model registry + versioning strategy.
- Retraining cadence and trigger conditions.
- Monitoring alerts.

## Reviewer layers

Throughout this chain, reviewers consult via Task:

- **Researcher** — statistical methodology at modeling phase.
- **Data Modeller** — feature source grain before pipeline build.
- **Data Analyst** — feature interpretability if high explainability required.
- **Applied ML Scientist** — methodology review if non-standard.
- **Deep Learning Engineer** — architecture review if DL.
- **Syn** — final review at each specialist's last phase.

## Knowledge ledger contributions

Typical harvest points:

- DS phase → entity quirks discovered during EDA.
- MLE phase → verified ML features land in `features/`.
- MLOps phase → infrastructure notes (serving latency, retraining cost).

## See also

- [Data Scientist](../02-agents/data-scientist.md)
- [ML Engineer](../02-agents/ml-engineer.md)
- [MLOps Engineer](../02-agents/mlops-engineer.md)
