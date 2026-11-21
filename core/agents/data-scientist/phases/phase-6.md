> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Build (queries and notebook)

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
building. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning Phase 6. "Beginning Phase 6" includes the reviewer consultations below; do not start them until the user signals readiness.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

Goal: Have the SQL queries and the notebook written, one tested component per task, under a lead loop. **No execution.** SQL is reviewed and validated under `LIMIT 100` by the Analytics Engineer in Phase 7. The notebook is run by the user (or via the `shards:notebook-walkthrough` mode) outside the build flow. Phase 6 is a write-only phase.

**Join path self-check:** Before requesting the Data Modeller review, trace the
join path for each query following [`protocols/join_path.md`](../../../protocols/join_path.md).
Present the trace to the user. Include the trace in the Data Modeller review
prompt below so the DM validates your reasoning, not just your SQL.

**Then request Data Modeller review with validation:**

Tell the user: "Asking the Data Modeller to verify sql queries (i.e. joins and grain before writing them out)."

{{consult data-modeller entry=review task="Review queries for [study]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Scientist shard. I've drafted queries for study [name].
The project specs are at: shards/[name]/project-specs.md

Here are the queries:
[include query outlines or key SQL]

Please REVIEW (not just explore): Do the joins make sense given the data model
grain? Are there grain fan-out risks? Am I using the right tables?

Run validation queries to check:
1. PK uniqueness on all tables I'm joining
2. Null rates on my join keys and critical filter columns
3. Join fan-out: row counts before/after my key joins
4. Data freshness on the tables I'm querying

Cross-reference the validation results against the study requirements in
project-specs.md (especially the grain and data sources from Phase 2).
Return your full review with query validation results.
```

The Data Modeller will run a bulk read-only validation sweep — that's an
auto-verify fit on the consultation side. No marker is needed on your side
for the consult itself.

**Also request Researcher review of the analysis approach:**

Tell the user: "I'm also asking the Researcher shard to review the analytical
approach for statistical validity..."

Before this consult, collect data-modeller context (grain, entities, relationships) for the data under review: {{consult data-modeller entry=review task="Grain and relationships for the researcher review"}} Pass that context in the task of the researcher consult below.


{{consult researcher entry=service task="Review analysis approach for [study]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Scientist shard preparing study [name]. Here is the
analytical approach I'm about to encode in queries and notebook cells:
- Methodology: [from Phase 3]
- Queries: [include query outlines or key SQL]
- Feature engineering: [if applicable, key transformations]
- Evaluation approach: [metrics, validation strategy]
Please review: Any concerns about how the methodology is being implemented?
Outlier handling appropriate? Transformations sound? Statistical tests valid
for the data characteristics? Keep review focused on what gets written into
the queries and notebook.
```

Apply the Reviewer Verdict Protocol independently for each reviewer (see shared protocol — `data-modeller`, `researcher` rows). Address all Halt-tier verdicts before proceeding to build.

### Reviewer verdicts (lead-side step, no gate)

After both reviewers return and you have applied the Reviewer Verdict Protocol to each, record the outcome in `## Validation`: the Data Modeller verdict (Proceed | Proceed with caveats | Halt) and one-line summary; the Researcher verdict and one-line summary; the resolution for each (e.g., "Both Proceed; no fixes needed" or "DM raised grain concern -> switched to teacher-week grain"). Resolve every Halt-tier verdict (and update the Phase 3 plan and the task list through a confirmed amendment if the fix changes either) before dispatching any task. This applies regardless of verdict tier: do not dispatch build tasks until the reviewer evidence is recorded.

### Build scope

The deliverables are SQL files under `shards/<name>/queries/` and a notebook under `shards/<name>/notebooks/`, plus, when the Phase 4 experiment plan mode is Harness, an experiment harness under `shards/<name>/experiments/`. **Write only: do not execute the SQL or run notebook cells in this phase.** Do not introduce standalone Python loader, helper, or "data prep" scripts: data loading and transformation live in notebook cells per the SQL-loading rule below. If something genuinely belongs in a `.py` module (a long shared utility used across notebooks), surface it to the user and confirm before adding it. The experiment harness is the planned exception: its `.py` files are specified by Sections B-C of the experiment framework and need no extra confirmation; any other `.py` file still does. {{protocol experiment_framework}} A freestanding `load_data.py` is almost always a sign the build is going outside the plan.

### Component specifications

Each task in `shards/<name>/tasks.yaml` cites one of these specifications through `plan_ref`. Workers see only the referenced sections, so keep each one self-contained.

**Spec A. SQL query file** (one task per query file)
   - Location: `shards/<name>/queries/`
   - Name files descriptively: `01_feature_extraction.sql`, `02_cohort_definition.sql`
   - Include header comments:
     ```sql
     -- Study: <study_name>
     -- Query: <description>
     -- Date: <date>
     -- Dependencies: <upstream tables>
     -- Output grain: one row per <entity>
     ```
   - Structural acceptance: the file has the header block; its join path matches the trace you presented under the join-path self-check; every required table from the Phase 2 data sources it is responsible for is referenced. Acceptance is structural (read-back, grep), never execution.

**Spec B. Notebook** at `shards/<name>/notebooks/<study>.ipynb`, built with NotebookEdit. The notebook is one file, so notebook tasks are chained with `depends_on` (never parallel) and split by section group:

   - **Overview** (markdown): business question, hypothesis, data sources, date, author
   - **Setup**: imports, config, reproducibility notes
   - **Data load**: cells that read each `.sql` file and produce the analysis dataframe(s), see SQL loading rule below
   - **EDA**: target distribution, feature distributions, missingness, correlations
   - **Analysis / Modelling**: implement the chosen method. For a modelling study with a Harness experiment plan, this section drives the harness (Section D of the experiment framework): import the runner, call it, show the leaderboard and a primary-metric chart, name the decision-rule winner; later sections analyse the winner. Never re-implement approaches in the notebook. With a Single approach plan, implement that approach (and the baseline) directly.
   - **Results**: key numbers, visualizations, model performance with business interpretation
   - **Recommendations**: top 2-3 actionable findings with confidence levels
   - **Caveats and Limitations**: what this can't answer, assumptions, data quality

   **SQL loading rule.** **Do NOT re-embed SQL as Python strings.** Read `.sql` files directly using `Path.read_text()`. Reference files by relative path from the notebook location:
   ```python
   from pathlib import Path
   sql = Path("../queries/01_feature_extraction.sql").read_text()
   df = pd.read_sql(sql, conn)
   ```

   Structural acceptance: the sections for the task's group are present and match the Phase 3 plan; every `.sql` file under `queries/` is loaded by at least one cell via `Path.read_text()`; no SQL is embedded as Python strings; no stray `.py` loaders were created. With a Harness plan: the Modelling section imports from `experiments.run_experiments` and contains no approach fitting logic of its own.

**Spec C. Requirements file** (optional). If analysis needs non-standard packages, a task creates `requirements.txt`.

**Spec D. Experiment harness** (modelling studies with a Harness experiment plan only; skip otherwise). Location `shards/<name>/experiments/`, laid out per Sections B-C of the experiment framework (model variant interface). {{protocol experiment_framework}} Tasks, per Section E of the framework: one harness-core task (`base.py`, `registry.py`, `run_experiments.py`, `experiments.yaml`, `__init__.py`, `approaches/__init__.py`), with `experiments.yaml` pre-registering every approach in the Phase 4 plan, then one task per approach (`approaches/<approach_id>.py` only, `depends_on` the core task), then the notebook Modelling section group (`depends_on` every approach task). Approaches load data only through what the notebook passes in; no SQL or file loading inside approach modules.
   Structural acceptance: every approach in the Phase 4 plan has a module and an `experiments.yaml` entry; each class subclasses `Approach` and defines `fit` and `predict`; `python -m py_compile` passes on every harness file (compiling is allowed; nothing is run against data); the runner uses one split and one scoring path for all approaches and writes `leaderboard.csv` and `leaderboard.md`.

### Lead loop

{{protocol delegated_build}} governs this phase. Task evidence guidance: {{protocol incremental_testing}} (here the acceptance check is structural, because Phase 6 is write-only).

{{delegate tasks=shards/<name>/tasks.yaml max_parallel=3}}

1. **Load the task list** approved at the plan gate (`shards/<name>/tasks.yaml`) and validate it with `tasks_set`. Each task cites a specification above through `plan_ref`.
2. **Dispatch** ready tasks with `task_dispatch`, in parallel up to the cap of 3. Query-file tasks can run in parallel; notebook section-group tasks run in their `depends_on` order. Harness approach tasks can run in parallel once the harness-core task is done.
3. **Receive** each worker's result via `task_report`.
4. **Verify before it counts.** Re-run (or independently check) the task's acceptance command, compare the artifact with its `plan_ref` specification and the Phase 3 plan, then write an evidence row to the `## Validation` Evidence table (Check = task id + component, Expected, Observed, Pass/Fail). Never mark a task done on the worker's word alone. Do not execute SQL or notebook cells to gather evidence.
5. **On failure**, re-dispatch the task with the failure output as feedback, at most 2 retries; then stop and ask the user with a summary.
6. **Deviations.** If a worker reports a deviation or the plan cannot be met, pause dependent tasks and follow {{protocol plan_drift}}; amend the plan or task list only through a confirmed gate.
7. **Continue** dispatching tasks unblocked by tasks you have verified as done.
8. You write no SQL or notebook cells yourself unless a task is marked `delegate: inline`.

When all tasks are verified done, run the final integration read-back as the lead: every spec section is covered by a done task, the notebook section list matches the Phase 3 plan, every query file is referenced, every planned approach has a harness module (Harness plans only), and no unplanned files exist. Record it in `## Validation`, then document the phase and raise the gate.

### Document Phase 6

```markdown
---

## Phase 6: Build Log (Data Scientist)
- **Data Modeller query review:**
  - Verdict: APPROVED | NEEDS REVISION
  - Tier: Proceed | Proceed with caveats
  - Notes: <summary>
  - Reviewer resolution: Approved | User override — <rationale>
- **Researcher build review:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Tier: Proceed | Proceed with caveats | Halt
  - Notes: <summary of statistical build review>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Query files:**
  - <file path>: <description>
- **Notebook location:** <file path>
- **Notebook cell count:** <total> (<markdown>/<code>)
- **Experiment harness:** <shards/<name>/experiments/ — approaches: <approach_id list>> | N/A — Single approach plan | N/A — analysis-only study
- **Requirements file:** <file path or "N/A — base Python only">
- **Deviations from plan:** <changes from Phases 3–5 and why, or "none">
- **Phase 6 produced no execution evidence by design** — SQL validation runs in Phase 7 (Analytics Engineer); notebook execution is user-managed or via `shards:notebook-walkthrough`.

### Validation

Evidence table, one row per verified task plus the reviewer outcomes and the final read-back. Each row is written by the lead after independently checking the acceptance result.

| Check | Expected | Observed | Pass/Fail |
|---|---|---|---|
| reviewers (DM + Researcher) | Both Proceed or caveats resolved | DM: <verdict>; Researcher: <verdict>; Resolution: <action> | PASS \| FAIL |
| <task id> queries: <file> | header block present; join path matches trace; required tables referenced | <file path>; <header compliance>; <join-path summary>; <deviations> | PASS \| FAIL |
| <task id> notebook: <section group> | sections match Phase 3 plan; SQL loaded via `Path.read_text()` | <notebook path>; <cell counts per section>; <SQL files referenced>; <SQL-loading-rule compliance> | PASS \| FAIL |
| <task id> harness: <core or approach_id> | interface per protocol Section C; py_compile passes; registered in `experiments.yaml` | <file path>; <compile result>; <registry entry> | PASS \| FAIL |
| final read-back | all spec sections covered; no stray files | <summary> | PASS \| FAIL |
```

{{gate kind=phase validates=data-scientist}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
