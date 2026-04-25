> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Execute Analysis

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

Goal: Build the notebook, queries, and report.

**Join path self-check:** Before requesting the Data Modeller review, trace the
join path for each query following `.claude/agents/specific_instructions/shared/join_path_protocol.md`.
Present the trace to the user. Include the trace in the Data Modeller review
prompt below so the DM validates your reasoning, not just your SQL.

**Then request Data Modeller review with validation:**

Tell the user: "Asking the Data Modeller to verify sql queries (i.e. joins and grain before execution)."

```
Task(
  subagent_type="data-modeller",
  description="Review queries for [study]",
  prompt="I am the Data Scientist shard. I've written queries for study [name].
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
  Return your full review with query validation results."
)
```

**Also request Researcher review of the analysis approach:**

Tell the user: "I'm also asking the Researcher shard to review the analytical
approach for statistical validity..."

```
Task(
  subagent_type="researcher",
  description="Review analysis execution approach for [study]",
  prompt="I am the Data Scientist shard executing study [name]. Here is the
  analytical approach I'm about to implement:
  - Methodology: [from Phase 3]
  - Queries: [include query outlines or key SQL]
  - Feature engineering: [if applicable, key transformations]
  - Evaluation approach: [metrics, validation strategy]
  Please review: Any concerns about how the methodology is being implemented?
  Outlier handling appropriate? Transformations sound? Statistical tests valid
  for the data characteristics? Keep review focused on execution specifics."
)
```

Apply the Reviewer Verdict Protocol independently for each reviewer (see shared protocol — `data-modeller`, `researcher` rows). Address all Halt-tier verdicts before proceeding to build.

**Then build:**

1. **SQL queries** — Write to `studies/<name>/queries/`
   - Name files descriptively: `01_feature_extraction.sql`, `02_cohort_definition.sql`
   - Include header comments:
     ```sql
     -- Study: <study_name>
     -- Query: <description>
     -- Date: <date>
     -- Dependencies: <upstream tables>
     -- Output grain: one row per <entity>
     ```

2. **Jupyter notebook** — Write to `studies/<name>/notebooks/` using NotebookEdit.
   Structure:
   - **SQL loading rule** — **Do NOT re-embed SQL as Python strings.** Read `.sql`
     files directly using `Path.read_text()`. Reference files by relative path from
     the notebook location:
     ```python
     from pathlib import Path
     sql = Path("../queries/01_feature_extraction.sql").read_text()
     df = pd.read_sql(sql, conn)
     ```
   - **Overview** (markdown): business question, hypothesis, data sources, date, author
   - **Setup**: imports, config, data loading, reproducibility notes
   - **EDA**: target distribution, feature distributions, missingness, correlations
   - **Analysis / Modelling**: implement chosen method
   - **Results**: key numbers, visualizations, model performance with business interpretation
   - **Recommendations**: top 2-3 actionable findings with confidence levels
   - **Caveats and Limitations**: what this can't answer, assumptions, data quality

3. **Requirements file** — If analysis needs non-standard packages, create `requirements.txt`

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

- `data-scientist-phase-6-checkpoint-queries` — each SQL query returns expected shape under `LIMIT 100`; join fan-out matches Phase 3 prediction.
- `data-scientist-phase-6-checkpoint-data-load` — notebook data-load cells produce the expected shape and dtypes; row counts match the query output.
- `data-scientist-phase-6-checkpoint-eda` — EDA cells run; target distribution / missingness / correlations look as expected or the deviation is noted.
- `data-scientist-phase-6-checkpoint-analysis` — analysis or modeling cells execute; key numbers are computed (not just planned).
- `data-scientist-phase-6-checkpoint-results` — results and visualizations render; recommendations are grounded in the produced numbers.

The hook blocks all non-read tools while a checkpoint is open. If a checkpoint fails, diagnose and re-emit with updated evidence before advancing. Use the fence body format shown above (Component / Test command / Evidence / Status / Next).

### Document Phase 6

```markdown
---

## Phase 6: Build Log (Data Scientist)
- **Data Modeller query review:**
  - Verdict: Approved | Concerns raised
  - Tier: Proceed | Proceed with caveats
  - Notes: <summary>
  - Reviewer resolution: Approved | User override — <rationale>
- **Researcher build review:**
  - Verdict: Sound | Concerns | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Notes: <summary of statistical build review>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Query files:**
  - <file path>: <description>
- **Notebook location:** <file path>
- **Requirements file:** <file path or "N/A — base Python only">
- **Key EDA findings:**
  - <finding 1>
  - <finding 2>
- **Model / analysis results:**
  - <metric 1>: <value and interpretation>
  - <metric 2>: <value and interpretation>
- **Deviations from plan:** <changes from Phases 3-5 and why, or "none">
- **Surprising findings:** <anything unexpected>
```

::GATE:: id=data-scientist-phase-6 phase=6 kind=phase validates=data_scientist
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_scientist/phases/phase-7.md` in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
