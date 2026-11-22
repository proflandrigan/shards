> **Previous:** phase-5.md confirmed
> **Next:** phase-6-5.md if Phase 6.5 is applicable per the state inspection; otherwise phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Execute

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before dispatching any task.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

Goal: Build the feature queries, training notebook, and pipeline artifacts as tested components, one task each, under a lead loop.

**Join path self-check (feature queries):** Before requesting the Data Modeller
review, trace the join path for each feature query following
[`protocols/join_path.md`](../../../protocols/join_path.md). Present the
trace to the user. Include it in the DM prompt below.

**Then request Data Modeller query review with validation:**

Tell the user: "Pulling in the Data Modeller to verify the feature extraction queries. Feature pipeline built on bad grain assumptions is a training set problem. I'm not building until this is confirmed."

{{consult data-modeller entry=review task="Review ML feature queries for [project]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the ML Engineer shard. I've written feature extraction queries for
project [name]. The project specs are at: shards/[name]/project-specs.md

Here are the queries:
[include query outlines or key SQL]

Please REVIEW (not just explore): Do the joins make sense given the data model
grain? Are there grain fan-out risks? Am I using the right tables for these
features?

Run validation queries to check:
1. PK uniqueness on all tables referenced in these queries
2. Null rates on join keys and key feature source columns
3. Join fan-out: row counts before/after the joins in my feature queries
4. Data freshness on the tables feeding features

Cross-reference against the project requirements in project-specs.md
(especially Phase 3 feature candidates and Phase 5 data freshness requirements).
This is for ML feature engineering — pay special attention to fan-out that would
silently inflate training examples.
Return your full review with query validation results.
```

The Data Modeller will run a bulk read-only validation sweep — that's an
auto-verify fit on the consultation side (the Data Modeller's `modes/service.md`
already references it). On your side, no marker is needed for the consult
itself; auto-verify only matters when the calling agent is the one running
the bulk queries.

### Component specifications

Each task in `tasks.yaml` cites one of these specifications through `plan_ref`. Workers see only the referenced sections, so keep each self-contained. Output locations: the confirmed `## Placement` targets; paths below under `<output_dir>` are the new-project default only.

**Spec A. Feature SQL queries** (one task per query file)
   - Location: `<output_dir>/queries/`
   - Name files descriptively: `01_label_definition.sql`, `02_user_features.sql`,
     `03_behavioral_features.sql`, `04_training_dataset.sql`
   - Include header comments:
     ```sql
     -- Project: <project_name>
     -- Query: <description>
     -- Date: <date>
     -- Feature group: <label | user | behavioral | contextual | interaction>
     -- Dependencies: <upstream tables>
     -- Output grain: one row per <entity>
     ```
   - Acceptance: each query runs under `LIMIT 100` and returns the expected shape; row counts before/after joins match the Phase 3 prediction.

**Spec B. Training notebook** at `<output_dir>/notebooks/`, built with NotebookEdit. It is one file, so notebook tasks are chained with `depends_on` (never parallel) and split by section group: data (Overview, Setup, Feature Engineering, EDA), baseline, candidate(s), analysis and infrastructure. With a Harness experiment plan (Phase 4), the baseline and candidate(s) groups become one "experiments" group that drives the harness (Spec F); approach code lives in the harness, not the notebook.
   - **SQL loading rule.** **Do NOT re-embed SQL as Python strings.** Read `.sql`
     files directly using `Path.read_text()`. Reference files by relative path from
     the notebook location:
     ```python
     from pathlib import Path
     sql = Path("../queries/02_user_features.sql").read_text()
     df = pd.read_sql(sql, conn)
     ```
   - **Overview** (markdown): business problem, model type, key decisions
   - **Setup**: imports, config, random seeds, data loading
   - **Feature Engineering**: feature computation, transformations, encoding
   - **EDA**: target distribution, feature distributions, correlations, class balance
   - **Baseline Model**: train, evaluate, establish floor (Single approach plan only)
   - **Candidate Model(s)**: train, tune, evaluate, compare to baseline (Single approach plan only)
   - **Experiments** (Harness plan): import the runner from `experiments/`, run every enabled approach on the shared split, display the leaderboard and a primary-metric chart, name the decision-rule winner. Model Analysis and Infrastructure Readiness then run on the winner, loaded from the registry by approach_id.
   - **Model Analysis**: feature importance, SHAP values, error analysis
   - **Infrastructure Readiness**: model size, inference time benchmarks,
     serving requirements check
   - **Results Summary**: final metrics, business interpretation, recommendation
   - Acceptance per group:
     - data: data-load and EDA cells execute and produce the expected shape; target distribution matches prior knowledge.
     - baseline: baseline fits and evaluates on held-out data; metrics recorded.
     - candidate: candidate smoke-fits on <=1% of data first (loss decreasing), then full fit; eval metrics beat the baseline floor.
     - experiments (Harness plan): each approach smoke-fits on <=1% of data (loss decreasing or metric computed) before the full run; the leaderboard has one row per enabled approach; the winner matches the Phase 4 decision rule.
     - infra: model size, inference latency and memory measured against the Phase 2 budget.

**Spec C. Requirements file.** `requirements.txt` with all ML dependencies.

**Spec D. Config file** (if applicable). Model hyperparameters, feature lists, thresholds.

**Spec E. Eval results JSON.** After training and evaluating models, the evaluation tasks record structured
   results in the project's `eval-results.json`:
   - Greenfield: `shards/<project_name>/eval-results.json`
   - Iteration: `shards/<project_name>/eval-results.json` (same; the existing service holds only confirmed Placement targets)

   `eval-results.json` is owned by a single sequential chain of tasks (never parallel tasks). The JSON must follow this schema:
   ```json
   {
     "variant": "ml-engineer",
     "projectName": "<project_name>",
     "status": "running",
     "timestamp": "<ISO-8601>",
     "summary": {
       "totalDimensions": 0,
       "passed": 0,
       "failed": 0,
       "overallVerdict": "PENDING"
     },
     "dimensions": [
       { "dimension": "<metric_name>", "metric": "<metric>", "target": 0.85, "actual": null, "unit": "ratio", "verdict": null }
     ],
     "cost": {
       "perRequest": null,
       "per1kTokens": null,
       "monthlyProjected": null,
       "budget": null,
       "currency": "USD"
     },
     "baseline": {
       "model": "<model_type>",
       "metrics": { "<metric>": null }
     },
     "bestCandidate": {
       "model": "<model_type>",
       "metrics": { "<metric>": null },
       "deltas": { "<metric>": null }
     },
     "infrastructure": [
       { "dimension": "Model size", "actual": null, "budget": "<Y>MB", "verdict": null },
       { "dimension": "Inference time", "actual": null, "budget": "<Y>ms", "verdict": null },
       { "dimension": "Memory usage", "actual": null, "budget": "<Y>MB", "verdict": null }
     ]
   }
   ```

   The file is created initially with `status: "running"` and null values. Update it
   as baseline and candidate models are evaluated. When complete, set
   `status: "complete"`, populate all metrics, compute `summary.overallVerdict`
   (PASS if all dimensions pass, FAIL if any fail, PARTIAL if mixed).

   With a Harness plan, fill `baseline` from the leaderboard's baseline row and `bestCandidate` from the decision-rule winner (with `deltas` against the baseline); the leaderboard remains the full record of every approach. Phase 6.5 may still change the winner.

   The lead emits the eval dashboard (always emit, whether or not a UI exists). Emit
   once; afterwards keep updating `eval-results.json` and the panel updates in place:

   {{artifact.emit type=eval-dashboard path=<path_to>/eval-results.json meta="title=Eval: <project_name> panel_id=eval-<project_name>"}}

**Spec F. Experiment harness** (Harness experiment plan only; skip for a Single approach plan). Location `<output_dir>/experiments/`, laid out per Sections B-C of the experiment framework (model variant interface). {{protocol experiment_framework}} Tasks follow Section E of the framework: one harness-core task (`__init__.py`, `approaches/__init__.py`, `base.py`, `registry.py`, `run_experiments.py`, `experiments.yaml`), with `experiments.yaml` pre-registering every approach in the Phase 4 plan, then one task per approach (`approaches/<approach_id>.py` only, `depends_on` the core task; these can run in parallel), then the notebook experiments group (`depends_on` every approach task). `experiments.yaml` constraints include the Phase 2 infrastructure budgets (model size, inference latency, memory), and the runner measures them for every approach so the leaderboard's `constraints_pass` column is real.
   Acceptance: core: `python -m py_compile` passes and the runner, given a toy dataset, scores a trivial approach end-to-end and writes `leaderboard.csv`; approach: the class subclasses `Approach`, reads hyperparameters from `params`, and smoke-fits on <=1% of data via the runner.

### Lead loop

{{protocol delegated_build}} governs this phase. Task evidence guidance: {{protocol incremental_testing}} (test each component in isolation as its task completes; do not leave run-all until the end).

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

1. **Load the task list** approved at the plan gate (`<output_dir>/tasks.yaml`) and validate it with `tasks_set`. Each task cites a specification above through `plan_ref`.
2. **Dispatch** ready tasks with `task_dispatch`, in parallel up to the cap of 3. Query tasks can run in parallel; notebook, baseline and candidate tasks follow their `depends_on` order. Harness approach tasks run in parallel once the harness-core task is verified done.
3. **Receive** each worker's result via `task_report`.
4. **Verify before it counts.** Re-run (or independently check) the acceptance command, compare with the `plan_ref` specification, then write an evidence row to the `## Validation` Evidence table (Check = task id + component, Expected, Observed, Pass/Fail), with measured facts (for example `df.shape = (48211, 47)`, `null rate on join key = 0.00%`). Never mark a task done on the worker's word alone.
5. **On failure**, re-dispatch the task with the failure output as feedback, at most 2 retries; then stop and ask the user with a summary.
6. **Deviations.** If a worker reports a deviation or the plan cannot be met, pause dependent tasks and follow {{protocol plan_drift}}; amend the plan or task list only through a confirmed gate.
7. **Continue** dispatching tasks unblocked by tasks you have verified as done.
8. You write no build code yourself unless a task is marked `delegate: inline`.

After the baseline and candidate tasks are verified done, run the results review below as the lead. Then finalize `eval-results.json` (status `complete`, summary verdict computed) and record the final integration evidence row before documenting the phase.

**Applied ML Scientist results review (lead-side step, after the baseline and candidate tasks are verified done).** Consult the Applied ML Scientist to review the
   *actual results*, not just the design. AMS reviewed the plan at Phase 4; this
   is where the plan meets empirical reality. Skip if Phase 4's AMS consultation
   was skipped per the standard-tabular criteria.

   Tell the user: "Getting the Applied ML Scientist back in to review the
   training results — loss curves, eval metrics, model behavior. Design review
   is cheap; results review catches what theory missed."

Before this consult, collect the context the reviewer needs, because it cannot consult further: data-modeller context (grain, entities, relationships) via {{consult data-modeller entry=review task="Grain and relationships for the methodology review"}} and researcher input via {{consult researcher entry=service task="Statistical methodology input for the methodology review"}}. Include both in the task of the consult below.

   {{consult applied-ml-scientist entry=review task="Training results review for <project_name>"}}

   Brief for the consultant (fill the bracketed fields):

   ```
   I am the ML Engineer shard. I've trained baseline and candidate
   models for <project_name>. You reviewed the design at Phase 4 — now I need
   you to review the actual results.

   Project specs: <path to project-specs.md>
   Eval results: <path to eval-results.json>
   Notebook: <path to training notebook>

   Baseline results:
   - Model: <type>
   - Key metrics: <metric>: <value>, <metric>: <value>

   Best candidate results:
   - Model: <type>
   - Key metrics: <metric>: <value>, <metric>: <value>
   - Delta vs baseline: <delta>

   Training artifacts available:
   - Loss curves: <notebook cell or plot path>
   - Learning curves (train vs val): <notebook cell or plot path>
   - Error analysis: <notebook cell or plot path if present>
   - Feature importance / SHAP: <notebook cell or plot path if present>

   Please review the actual results and flag:
   1. Training dynamics — do loss/learning curves look healthy, or do you see
      signs of underfitting, overfitting, instability, or premature convergence?
   2. Result plausibility — does the baseline-to-candidate lift match what
      the methodology predicted, or is something suspicious (too-good-to-be-true
      metrics, unexplained gaps between validation and test)?
   3. Error structure — does the error analysis reveal any systematic failure
      modes that suggest a methodology adjustment?
   4. Are there concrete next iterations from the literature that would address
      observable gaps in current performance?

   Return a structured ML Science Review per your service-mode format.
   ```

   Apply the Reviewer Verdict Protocol. Append the review to project-specs.md
   under Phase 6 and record its verdict in `## Validation`.

### Document Phase 6

```markdown
---

## Phase 6: Build Log (ML Engineer)
- **Data Modeller query review:**
  - Verdict: APPROVED | NEEDS REVISION
  - Notes: <summary>
  - Issues addressed: <how resolved or "none raised">
- **Applied ML Scientist results review:** <summary if consulted> | Skipped — Phase 4 AMS review was skipped per standard-tabular criteria
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Tier: Proceed | Proceed with caveats | Halt
  - Training dynamics notes: <healthy | concerns — description>
  - Error structure notes: <systematic failures surfaced or "none">
  - Next-iteration suggestions: <from AMS or "none">
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Query files:**
  - <file path>: <description>
- **Notebook location:** <file path>
- **Experiment harness:** <<output_dir>/experiments/ — approaches: <approach_id list>; leaderboard winner: <approach_id>> | N/A — Single approach plan
- **Requirements file:** <file path>
- **Config file:** <file path or "N/A">
- **Baseline results:**
  - <metric>: <value>
- **Best candidate results:**
  - Model: <type>
  - <metric>: <value> (improvement over baseline: <delta>)
- **Infrastructure readiness:**
  - Model size: <X>MB (budget: <Y>MB) — Pass | Fail
  - Inference time: <X>ms (budget: <Y>ms) — Pass | Fail
  - Memory usage: <X>MB (budget: <Y>MB) — Pass | Fail
- **Deviations from plan:** <changes and why, or "none">
- **Surprising findings:** <anything unexpected>

### Validation

| Check | Expected | Observed | Pass/Fail |
|---|---|---|---|
| <task id> <component> | <acceptance expected> | <measured facts> | PASS \| FAIL |
| <task id> harness: <core or approach_id> | interface per protocol Section C; smoke-fit passes; leaderboard row written | <file path>; <smoke-fit result>; <primary metric> | PASS \| FAIL |
```

{{gate kind=phase validates=ml-engineer}}

---

## When this gate is confirmed

If Phase 6.5 is applicable for this project (based on the state classification in this phase), {{phase 6-5}} in full and follow its instructions. Otherwise, {{phase 7}} in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
