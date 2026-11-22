# Data Scientist — ML Model Handoff

This file governs the ML Engineer handoff at the end of a Data Scientist study.
A handoff is offered when the user wants a productionalized machine learning model.

---

## Phase 7, Step 6: MAchine Learning Model Handoff

Tell the user: "This study is complete, and the analysis stands on its own. But since
you flagged this for productionization, the next step is handing off to the ML Engineer
shard. They handle the production side — serving infrastructure, retraining pipelines,
monitoring, and deployment. I'm writing a handoff file they can read directly."

Write the file `shards/<project_name>/ml_engineer_handoff.md`:

```
# ML Engineer Handoff: <project_name>

## Source Study
- Study directory: shards/<project_name>/
- Study specs: shards/<project_name>/project-specs.md
- Study report: shards/<project_name>/report.md

## Model Design (from Phase 4)
- Task type: <from Phase 4>
- Target variable: <from Phase 4>
- Prediction window: <from Phase 4>
- Feature candidates: <summary from Phase 4>
- Baseline model: <from Phase 4>
- Experiment plan: <mode (Harness | Single approach), approaches (baseline and candidates), recommended lead, decision rule — from Phase 4>
- Interpretability requirement: <from Phase 4>

## Results (from Phase 6)
- Best metric: <metric: value>
- Experiment harness: <shards/<project_name>/experiments/ and its leaderboard.md, or "None (single approach)"; study was write-only, so the harness has not been run>
- Notebook: <path from Phase 6>
- Query files: <paths from Phase 6>

## Business Context (from Phase 1)
- Decision this supports: <from Phase 1>
- Decision maker: <from Phase 1>

## Constraints
- Deployment intent: Productionized
- Constraints flagged: <any from ML Engineer review in Phase 4, or "None">

## Next Step
Run `shards:ml-engineer` or `shards:syn`. Reference this file in Phase 0.
```

Stop here and suggest running `shards:ml-engineer` or `shards:syn` to start the productionization project.
Do NOT attempt to morph into or invoke the ML Engineer.
