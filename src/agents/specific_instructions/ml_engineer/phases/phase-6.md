> **Previous:** phase-5.md confirmed
> **Next:** phase-6-5.md if Phase 6.5 is applicable per the state inspection; otherwise phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Execute

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

Goal: Build the feature queries, training notebook, and pipeline artifacts.

**Join path self-check (feature queries):** Before requesting the Data Modeller
review, trace the join path for each feature query following
`.claude/agents/specific_instructions/shared/join_path_protocol.md`. Present the
trace to the user. Include it in the DM prompt below.

**Then request Data Modeller query review with validation:**

Tell the user: "Pulling in the Data Modeller to verify the feature extraction queries. Feature pipeline built on bad grain assumptions is a training set problem. I'm not building until this is confirmed."

```
Task(
  subagent_type="data-modeller",
  description="Review ML feature queries for [project]",
  prompt="I am the ML Engineer shard. I've written feature extraction queries for
  project [name]. The project specs are at: [services|<existing_dir>]/[name]/project-specs.md

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
  Return your full review with query validation results."
)
```

The Data Modeller will run a bulk read-only validation sweep — that's an
auto-verify fit on the consultation side (the Data Modeller's `service_mode.md`
already references it). On your side, no marker is needed for the Task call
itself; auto-verify only matters when the calling agent is the one running
the bulk queries.

**Then build:**

1. **SQL queries** — Write to:
   - Greenfield: `models/<name>/queries/`
   - Iteration: `<existing_service_dir>/queries/`
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

2. **Training notebook** — Write using NotebookEdit to:
   - Greenfield: `models/<name>/notebooks/`
   - Iteration: `<existing_service_dir>/notebooks/`
   Structure:
   - **SQL loading rule** — **Do NOT re-embed SQL as Python strings.** Read `.sql`
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
   - **Baseline Model**: train, evaluate, establish floor
   - **Candidate Model(s)**: train, tune, evaluate, compare to baseline
   - **Model Analysis**: feature importance, SHAP values, error analysis
   - **Infrastructure Readiness**: model size, inference time benchmarks,
     serving requirements check
   - **Results Summary**: final metrics, business interpretation, recommendation

3. **Requirements file** — `requirements.txt` with all ML dependencies

4. **Config file** (if applicable) — model hyperparameters, feature lists, thresholds

5. **Eval results JSON** — After training and evaluating models, write structured
   results to the project's `eval-results.json`:
   - Greenfield: `models/<name>/eval-results.json`
   - Iteration: `<existing_service_dir>/eval-results.json`

   The JSON must follow this schema:
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

   Write the file initially with `status: "running"` and null values. Update it
   as baseline and candidate models are evaluated. When complete, set
   `status: "complete"`, populate all metrics, compute `summary.overallVerdict`
   (PASS if all dimensions pass, FAIL if any fail, PARTIAL if mixed).

   If the Shards UI is active (`.shards/ui.port` file exists), push the eval
   dashboard panel:
   ```bash
   node .shards/ui/ui-push.js eval-dashboard \
     --title "Eval: <project_name>" \
     --agent "ml-engineer" \
     --panel-id "eval-<project_name>" \
     --source "<path_to>/eval-results.json"
   ```

6. **Applied ML Scientist results review** — After baseline and candidate models
   are trained and evaluated, consult the Applied ML Scientist to review the
   *actual results*, not just the design. AMS reviewed the plan at Phase 4; this
   is where the plan meets empirical reality. Skip if Phase 4's AMS consultation
   was skipped per the standard-tabular criteria.

   Tell the user: "Getting the Applied ML Scientist back in to review the
   training results — loss curves, eval metrics, model behavior. Design review
   is cheap; results review catches what theory missed."

   ```
   Task(
     subagent_type="applied-ml-scientist",
     description="Training results review for <project_name>",
     prompt="I am the ML Engineer shard. I've trained baseline and candidate
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

     Return a structured ML Science Review per your service-mode format."
   )
   ```

   Apply the Reviewer Verdict Protocol. Append the review to project-specs.md
   under Phase 6.

### Incremental testing — checkpoint gates between components

Follow `.claude/agents/specific_instructions/shared/incremental_testing.md` during this build. Each component above is a checkpoint seam — after you write and execute a component, emit a `kind=checkpoint` gate fence (template below) and wait for user confirmation before starting the next component. Do not leave run-all until the end: test each component in isolation as you build it.

Checkpoint gate fence — emit exactly this shape. Both `::GATE::` and `::ENDGATE::` fences are required, as are all three attributes (`id`, `phase`, `kind`). No prose outside the fence.

```
::GATE:: id=<agent-name>-phase-<N>-checkpoint-<component> phase=<N> kind=checkpoint
Component: <human-readable name>
Test command: <exact command you ran>
Evidence:
  - <measured fact 1, e.g. "df.shape = (48211, 47)">
  - <measured fact 2, e.g. "null rate on join key = 0.00%">
  - <measured fact 3, e.g. "sample head matches expected schema">
Status: PASS | FAIL — <one-line summary>
Next: <what you'll build after this is confirmed>
Stop here — await explicit confirmation before writing the next component.
::ENDGATE::
```

Expected checkpoint gate IDs for this phase (emit in order as you build):

- `ml-engineer-phase-6-checkpoint-queries` — each feature query returns expected shape under `LIMIT 100`; row counts before/after joins match Phase 3 prediction.
- `ml-engineer-phase-6-checkpoint-data` — notebook data-load + EDA cells produce expected shape; target distribution matches prior knowledge.
- `ml-engineer-phase-6-checkpoint-baseline` — baseline model fits and evaluates on held-out data; metrics recorded.
- `ml-engineer-phase-6-checkpoint-candidate` — candidate model smoke-fits on ≤1% of data first (loss decreasing), then full fit; eval metrics beat baseline floor.
- `ml-engineer-phase-6-checkpoint-infra` — model size, inference latency, memory measured against Phase 5 budget.

The hook blocks all non-read tools while a checkpoint is open. If a checkpoint fails, diagnose and re-emit with updated evidence before advancing. Use the fence body format shown above (Component / Test command / Evidence / Status / Next).

### Document Phase 6

```markdown
---

## Phase 6: Build Log (ML Engineer)
- **Data Modeller query review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary>
  - Issues addressed: <how resolved or "none raised">
- **Applied ML Scientist results review:** <summary if consulted> | Skipped — Phase 4 AMS review was skipped per standard-tabular criteria
  - Verdict: Sound | Consider Alternatives | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Training dynamics notes: <healthy | concerns — description>
  - Error structure notes: <systematic failures surfaced or "none">
  - Next-iteration suggestions: <from AMS or "none">
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Query files:**
  - <file path>: <description>
- **Notebook location:** <file path>
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
```

::GATE:: id=ml-engineer-phase-6 phase=6 kind=phase validates=ml_engineer
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

If Phase 6.5 is applicable for this project (based on the state classification in this phase), read `.claude/agents/specific_instructions/ml_engineer/phases/phase-6-5.md` in full and follow its instructions. Otherwise, read `.claude/agents/specific_instructions/ml_engineer/phases/phase-7.md` in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
