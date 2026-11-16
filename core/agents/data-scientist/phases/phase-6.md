> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Build (queries and notebook)

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
building. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning Phase 6. "Beginning Phase 6" includes the reviewer Task calls below — do not fire them until the user signals readiness.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

Goal: Write the SQL queries and the notebook. **No execution.** SQL is reviewed and validated under `LIMIT 100` by the Analytics Engineer in Phase 7. The notebook is run by the user (or via the `/notebook-walkthrough` mode) outside the build flow. Phase 6 is a write-only phase.

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
The project specs are at: studies/[name]/project-specs.md

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
for the Task call itself.

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

### Reviewer-verdict checkpoint

After both reviewers return and you have applied the Reviewer Verdict Protocol to each, call `gate_request` as below. **Do not begin writing SQL or notebook cells until the user confirms this gate.** This applies regardless of verdict tier — even when both reviewers return clean "Proceed", the user must explicitly confirm before build begins.

Pass `evidence={status: pass, checks: [...]}` with: the Data Modeller verdict (Proceed | Proceed with caveats | Halt) and one-line summary; the Researcher verdict and one-line summary; the resolution for each (e.g., "Both Proceed; no fixes needed" or "DM raised grain concern → switched to teacher-week grain"). Next: SQL queries (build step 1).

{{gate kind=checkpoint name=reviewers}}

### Build scope

The deliverables are SQL files under `studies/<name>/queries/` and a notebook under `studies/<name>/notebooks/`. **Write only — do not execute the SQL or run notebook cells in this phase.** Do not introduce standalone Python loader, helper, or "data prep" scripts — data loading and transformation live in notebook cells per the SQL-loading rule below. If something genuinely belongs in a `.py` module (a long shared utility used across notebooks), surface it to the user and confirm before writing it. A freestanding `load_data.py` is almost always a sign you're building outside the plan.

### Incremental testing — checkpoint gates between components

{{protocol incremental_testing}} during this build. Each numbered build step below ends with a `kind=checkpoint` gate — after you write the component, call `gate_request` and wait for the user before starting the next component. The "test" in this build-only phase is structural — you read back what you wrote and confirm it matches the Phase 3 plan; you do not execute it.

**Checkpoint evidence.** Each checkpoint is a `kind=checkpoint` gate with a `name=` slug (name is `[a-z0-9-]+`, unique within the file, no `validates=`). Pass `evidence={status: pass|fail, checks: [...]}` naming the component, the verification action (here: "structural read-back against Phase 3 plan"; for build-and-run phases, the exact test command), and measured facts. Under the default `phase` policy a passing checkpoint is recorded automatically and blocks only on fail or anomaly.

Worked example for the notebook component (illustrative values; substitute real measurements):

- Component: Jupyter notebook (full); verification: structural read-back against Phase 3 cell-list plan (no execution).
- Checks: path `studies/teacher_churn/notebooks/teacher_churn.ipynb`; 22 cells written (4 markdown headers, 18 code) across Overview / Setup / Data load / EDA / Analysis / Results / Caveats; SQL files referenced `queries/01_feature_extraction.sql`, `queries/02_cohort_definition.sql` (loaded via `Path.read_text()`); SQL-loading-rule compliance PASS (no embedded SQL strings); Phase 3 plan match 22/22 sections, one deviation noted (split EDA section into 2 sub-blocks).
- Next: Phase 7 documentation and code review fan-out.


**Common deviations to avoid.** Do not:

- Replace the component / verification / evidence structure with free prose or an open question. The user confirms by reading the evidence you pass.
- Invent a checkpoint name outside the per-step names called out in the build steps below (e.g., `sql` instead of `queries`). The names are part of the contract.
- Run the SQL or execute the notebook to gather evidence. Phase 6 is write-only. SQL is run under `LIMIT 100` by the Analytics Engineer in Phase 7; the notebook is run by the user or via `/notebook-walkthrough` outside this flow.
- Checkpoint a script that isn't part of the build plan. If you find yourself wanting to checkpoint a `load_data.py`, stop — that script shouldn't exist (see Build scope above).

Never confirm your own checkpoint. If a checkpoint fails (e.g., structural review reveals a missing section vs. the Phase 3 plan), fix the artifact and call `gate_request` again with updated evidence before advancing.

### Then build (each step ends with its own checkpoint gate)

**1. SQL queries — write, then checkpoint.**
   - Write to `studies/<name>/queries/`
   - Name files descriptively: `01_feature_extraction.sql`, `02_cohort_definition.sql`
   - Include header comments:
     ```sql
     -- Study: <study_name>
     -- Query: <description>
     -- Date: <date>
     -- Dependencies: <upstream tables>
     -- Output grain: one row per <entity>
     ```
   - Verify structurally: every query has the header block; the join path in each query matches the trace you presented under the join-path self-check; every required table from the Phase 2 data sources is referenced.
   - Checkpoint: `{{gate kind=checkpoint name=queries}}` with structural evidence: file paths and counts, header-comment compliance, one-line join-path summary per query, any deviations from Phase 3 plan.
   - Wait for user confirmation before step 2.

**2. Notebook — write, then checkpoint.** Create the notebook at `studies/<name>/notebooks/<study>.ipynb` using NotebookEdit. Write all sections in this single step:

   - **Overview** (markdown): business question, hypothesis, data sources, date, author
   - **Setup**: imports, config, reproducibility notes
   - **Data load**: cells that read each `.sql` file and produce the analysis dataframe(s) — see SQL loading rule below
   - **EDA**: target distribution, feature distributions, missingness, correlations
   - **Analysis / Modelling**: implement chosen method
   - **Results**: key numbers, visualizations, model performance with business interpretation
   - **Recommendations**: top 2–3 actionable findings with confidence levels
   - **Caveats and Limitations**: what this can't answer, assumptions, data quality

   **SQL loading rule** — **Do NOT re-embed SQL as Python strings.** Read `.sql` files directly using `Path.read_text()`. Reference files by relative path from the notebook location:
   ```python
   from pathlib import Path
   sql = Path("../queries/01_feature_extraction.sql").read_text()
   df = pd.read_sql(sql, conn)
   ```

   Verify structurally: every section listed above is present; the section list matches the Phase 3 plan; every `.sql` file under `queries/` is loaded by at least one cell via `Path.read_text()`; no SQL is embedded as Python strings; no stray `.py` loaders were created.

   Checkpoint: `{{gate kind=checkpoint name=notebook}}` with structural evidence: notebook path, total cell count and per-section breakdown, SQL files referenced, SQL-loading-rule compliance status, deviations from the Phase 3 plan if any.

   Wait for user confirmation before step 3.

**3. Requirements file — no checkpoint.** If analysis needs non-standard packages, create `requirements.txt`. Optional.

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
- **Requirements file:** <file path or "N/A — base Python only">
- **Deviations from plan:** <changes from Phases 3–5 and why, or "none">
- **Phase 6 produced no execution evidence by design** — SQL validation runs in Phase 7 (Analytics Engineer); notebook execution is user-managed or via `/notebook-walkthrough`.

### Validation

Roll up the structural evidence from the three in-phase checkpoint gates. Copy the Status + key Evidence facts directly from each gate body so this section is auditable on its own without rereading every checkpoint.

| Checkpoint | Status | Key evidence |
|---|---|---|
| reviewers | PASS | DM: <verdict>; Researcher: <verdict>; Resolution: <action> |
| queries | PASS \| FAIL | <file count and paths>; <header-comment compliance>; <join-path summary>; <deviations from Phase 3 plan> |
| notebook | PASS \| FAIL | <notebook path>; <cell count and per-section breakdown>; <SQL files referenced>; <SQL-loading-rule compliance>; <Phase 3 plan match> |
```

{{gate kind=phase validates=data-scientist}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
