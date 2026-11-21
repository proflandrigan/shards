> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Phase 3 — Execute

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

Goal: Get the queries written (as delegated tasks, verified by you), reviewed,
fix anything flagged, then run them and show results. Queries are NOT executed
before the Analytics Engineer review.

{{protocol delegated_build}}

**Join path trace:** Before writing any query that joins tables, trace the join
path following [`protocols/join_path.md`](../../../protocols/join_path.md).
Present the trace to the user. If the trace reveals fan-out risk or uncertain
grain, invoke the Data Modeller for validation before dispatching the query-writing task.

### Step 1 — Query specifications and lead loop (do NOT run yet)

**Component specifications.** Each query is one component. Task cards cite
this section (and the Phase 2 plan) via `plan_ref`; workers see only the
sections a card references.

- Each query lives in its own `.sql` file in `analysis/<project_name>/queries/`
- Name files descriptively: `01_conversion_by_cohort.sql`, `02_revenue_trend.sql`
- Include a header comment in each file:
  ```sql
  -- Analysis: <project_name>
  -- Query: <description>
  -- Date: <date>
  -- Filters: <key filters applied>
  -- Output grain: one row per <entity>
  ```
- **SQL loading rule** — **Do NOT embed SQL as Python strings.** If Python
  (e.g., pandas, SQLAlchemy) is used to execute queries, read `.sql` files
  directly using `Path.read_text()`:
  ```python
  from pathlib import Path
  sql = Path("queries/01_conversion_by_cohort.sql").read_text()
  df = pd.read_sql(sql, conn)
  ```

**Task evidence guidance:** {{protocol incremental_testing}} Because queries
are not executed before the AE review, the per-task acceptance check is
static: the file exists, the header comment is complete, no embedded Python SQL
strings, and the stated output grain matches the plan.

### Lead loop

{{delegate tasks=analysis/<project_name>/tasks.yaml max_parallel=3}}

This is a small adhoc build (usually 1-2 query tasks). Tasks with
`delegate: inline` are written by you directly; any others go to workers.
Either way, run the same loop:

1. **Load** the task list approved at the Phase 2 gate (call `tasks_set`; fix
   and re-validate if it is rejected).
2. **Dispatch** ready tasks (`task_dispatch`), in parallel up to
   `max_parallel=3`. Each task card cites its query spec via `plan_ref`.
3. **Collect** each worker's result via `task_report`.
4. **Verify before counting.** For every report, re-run (or independently
   check) the acceptance command and compare the file with the `plan_ref`
   spec. Then write a per-task evidence row to the `## Validation` Evidence
   table (Check = task id + query, Expected, Observed, Pass/Fail). Never mark a
   task done on the worker's word alone.
5. **On failure** re-dispatch with the failure output as feedback, at most 2
   retries; then stop and ask the user with a summary.
6. **Deviations** (a query cannot meet the plan, grain or filters change):
   pause dependent tasks and follow {{protocol plan_drift}}; amend the plan only
   via a confirmed gate.
7. **Dispatch** tasks unblocked by done tasks until all are done.
8. You write no query code yourself except for `delegate: inline` tasks.

**Do not execute the queries yet.** They go through Analytics Engineer review
first.

### Step 2 — Analytics Engineer review (BEFORE execution)

This review is automatic — don't skip it. The AE checks the SQL for
correctness, traces sources, validates layer choice, and runs sanity checks
on the upstream sources so we have expected counts to compare against once
we actually run the queries.

**Skip condition:** If Phase 1 documented the data environment as `GREENFIELD`
or `inaccessible` (no warehouse access), skip the upstream sanity-check sweep
but still ask the AE for a structural SQL + source-trace review. Document the
skip reason in Phase 3 specs.

Tell the user: "Queries are written but not executed yet. Sending them to the
Analytics Engineer for source tracing and a sanity-check sweep on the upstream
tables — I'd rather catch SQL or layer issues before we run anything. One sec..."

{{consult analytics-engineer entry=service task="Pre-execution query review for adhoc analysis"}}

Brief for the consultant (fill the bracketed fields):

```
SERVICE MODE — PRE-EXECUTION QUERY REVIEW. I am the Data Analyst
shard. I've written Phase 3 queries for project [project_name] but have
NOT executed them yet — your review gates execution.

- project-specs.md: [file_path]
- Queries directory: analysis/[project_name]/queries/
- Data environment: [not greenfield | inaccessible | GREENFIELD]

Please:
1. Read each .sql file in the queries directory
2. Trace ref()/source() (or raw table references) so we have a clear
   picture of upstream lineage — staging vs intermediate vs mart, and
   whether the analyst picked the right layer
3. Review the SQL for correctness, quality, performance, and domain fit
   against the project's business question
4. Run upstream sanity checks (skip if environment is greenfield/inaccessible):
   - Row counts on each upstream source table referenced
   - Distinct-key counts on the join keys used
   - Null % on any column used in WHERE filters or join conditions
   - A structural join fan-out check for any query joining two or more
     tables (based on key cardinality of the upstream tables)
   - Provide an *expected* result row count (or order of magnitude) given
     the source counts and applied filters, so the analyst has something
     to compare actual results against once they run the queries.
   **Auto-verify**: this sanity-check sweep is exactly the bulk read-only
   pattern auto-verify is for. Open `{{auto_verify start tool_budget=20 ttl=600}}`
   before the sweep, `{{auto_verify end}}` after. Read-only only; gates always win. See
   `../../../protocols/auto_verify_mode.md`.
5. Return a verdict: APPROVED / NEEDS REVISION / BLOCKED — with specific issues
   ordered by severity, plus the expected row counts from step 4.
```

Append the AE's review verbatim to the Phase 3 specs section. Present the
verdict and key findings to the user.

### Step 3 — Fix anything flagged

**If AE returns NEEDS REVISION or BLOCKED:**
1. Address SQL bugs, wrong-layer source choices, or fan-out risks: rewrite the
   affected queries (re-dispatch the affected query tasks and re-verify each
   with an evidence row). Do this BEFORE running anything.
2. Data-quality findings on the sources (not query bugs) become caveats in the
   Phase 3 result interpretation — surface them alongside the results when you
   present them.
3. If the AE flags a missing or wrong-grain mart, route this through the
   existing Analytics Engineer flag mechanism in Phase 1 (write or update
   `ae-intake.md`) and document the gap in Phase 3 specs.
4. After rewrites, re-invoke the AE once for confirmation. If still NEEDS REVISION
   after one revision pass, surface the disagreement to the user and let them
   decide whether to proceed.

### Step 4 — Run the queries

With the AE's sign-off (APPROVED, or NEEDS REVISION items resolved), run each query (if
environment permits) or present them ready to run. **Do NOT show results to
the user yet** — first compare actual result row counts against the AE's
expected counts from Step 2.

### Step 5 — Fix any execution-time bugs

If actual row counts diverge significantly from the AE's expected counts, or
results look obviously wrong (impossible values, all nulls, fan-out
multipliers), treat it as a bug:
- Diagnose the cause (filter logic, join issue, type mismatch, etc.)
- Fix the query, re-run
- If the divergence isn't a bug but a surprise about the data itself, briefly
  re-consult the AE before showing results

### Step 5b — Statistician review of claims

If any result states, compares or interprets a number as evidence for a conclusion (a significant difference, a lift, a ranking, a trend, "X drove Y"), it is a claim: follow {{protocol stats_review_routing}}. Tell the user: "The results make claims, so the Statistician is reviewing them before you see them. Brace yourself."

{{consult statistician entry=service task="Claim review for adhoc analysis [project]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Analyst shard. My adhoc analysis for [topic] produced these
results: [result tables or summaries, with row counts]. I intend to tell
the user: [each claim, one sentence each]. Queries: [paths]. Grain and
clustering context: [from Phase 2 data-modeller context, or "none"].
Please review whether each claim follows from the evidence.
```

Apply {{protocol reviewer_verdict}}. On BLOCKED, rewrite the claim to what the Statistician says the evidence supports (or drop it) before Step 6, and resubmit once. In Step 6, use the Statistician's "What the evidence actually supports" wording for interpretations, list WEAKENS caveats with the result, and show any OFFENDS notes as "Statistician style notes (non-blocking)". If no result makes a claim (pure lookups or counts), skip this step and say so in the Phase 3 record.

### Step 6 — Present results to the user

Now — and only now — present the results. For each query, return the result
with a 1–2 sentence plain-language interpretation, plus any caveats from the
AE review or notes on expected-vs-actual divergence. If results are surprising
or raise more questions, proactively note it.

**If this is creative mode:** After delivering the primary results, suggest 1-2
adjacent angles worth exploring. "While I was in there, I noticed X — want me
to pull that too?"

**If output format = chart or dashboard:**

After delivering query results, provide visualization guidance:

1. **Recommend chart type:** "For [metric type + comparison structure], I'd recommend
   [chart type] because [reason tied to data shape — e.g., 'bar chart for categorical
   comparison across cohorts', 'line chart for time series trends', 'scatter for
   correlation between two continuous metrics']."
   Base the recommendation on the BI Engineer's Phase 2 feedback if provided.

2. **Sketch the chart in markdown:** Render a representative sample of the results
   as a markdown table with axis labels described inline:
   ```
   | [X-axis label] | [Y-axis / measure label] |
   |----------------|--------------------------|
   | value          | value                    |
   ```
   Below the table, describe: "X-axis: [field]. Y-axis: [measure]. Chart reads as: [1-sentence description]."

3. **Flag production handoff option:** "If you need this as a live, refreshing
   dashboard rather than a one-time chart, that's a BI Engineer job. Want me to
   flag it for handoff to the BI Engineer?"
   - If user says no: close normally with the static chart sketch as the deliverable.
   - If user says yes: Before stopping, write a structured intake file for the
     BI Engineer.

     Tell the user: "Writing a bi-intake.md with everything the BI Engineer
     needs to pick this up. One sec..."

     Write `analysis/<project_name>/bi-intake.md`:

     ---

     ## BI Intake: <project_name>

     ## Requesting Agent
     - Originating agent: Data Analyst
     - Analysis project: analysis/<project_name>/project-specs.md (Phases 0–3 complete)

     ## Dashboard Objective
     - Core question: <from Phase 0>
     - Definition of done: Live, refreshing dashboard
     - Intended audience: <ask if not known — "Who will use this dashboard?">

     ## Analysis Already Done
     - Queries location: analysis/<project_name>/queries/
     - Key metrics computed: <from Phase 3 results>
     - Recommended chart type: <from Phase 3 visualization recommendation>
     - Chart sketch: <reproduce the Phase 3 chart sketch inline>

     ## Data Sources
     - Primary table(s): <from Phase 1>
     - Filters/dimensions: <from Phase 1>
     - Date column: <from Phase 1 filters or inferred from queries>
     - Data environment: <from Phase 1 — not greenfield | inaccessible | GREENFIELD>

     ## Source Context
     - Data Modeller findings: <summary from Phase 1 Data Modeller consultation>

     ## Next Step
     Run `shards:bi-engineer` or `shards:syn`. In Phase 0, reference this file:
     analysis/<project_name>/bi-intake.md

     ---

     Tell the user: "I've written `analysis/<project_name>/bi-intake.md` with the
     dashboard requirements for the BI Engineer. Run `shards:bi-engineer` or `shards:syn`
     and reference that file in Phase 0."

     Document in Phase 3 specs:
     **BI Engineer handoff requested:** Yes
     **BI intake file written:** Yes — analysis/<project_name>/bi-intake.md

### Document Phase 3

```markdown
---

## Phase 3: Results (Data Analyst)
- **Analytics Engineer pre-execution review:**
  - **Verdict:** APPROVED | NEEDS REVISION | BLOCKED | Skipped — <reason if skipped>
  - **Source trace:** <summary of upstream lineage per query — layer chosen, alternatives>
  - **Upstream sanity checks:** <row counts, null %, distinct-key counts, fan-out structure — or "Skipped: greenfield/inaccessible">
  - **Expected result row counts:** <per query, from AE — or "N/A: greenfield/inaccessible">
  - **Findings:** <ordered by severity, or "None">
  - **Resolution before execution:** <fixes applied | caveat surfaced | mart gap flagged via ae-intake.md | user override — rationale>
- **Queries executed (after AE sign-off):**
  1. <query file>: <brief description>
     - Expected vs actual rows: <expected from AE> vs <actual> — <match | divergence + cause>
     - Result: <the answer — number, table summary, or chart description>
     - Interpretation: <1-2 sentence plain-language interpretation>
  2. <query file>: <description>
     - Expected vs actual rows: <expected> vs <actual> — <match | divergence + cause>
     - Result: <answer>
     - Interpretation: <interpretation>
- **Execution-time fixes (if any):** <bugs caught at run-time and how they were resolved, or "None">
- **AE re-consult after execution:** <triggered? why? outcome — or "Not needed">
- **Statistician claim review:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED | NOT APPLICABLE
  - Claims reviewed: <count, or "none — no claims in results">
  - Findings: <INVALIDATES / WEAKENS findings and how each was resolved, or "none">
- **Visualization (if applicable):**
  - Chart type recommended: <type and reasoning, or "N/A">
  - Chart sketch: <markdown table + axis description, or "N/A">
  - BI Engineer handoff requested: Yes | No | N/A
  - BI intake file written: Not applicable | Yes — analysis/<project_name>/bi-intake.md
- **Creative suggestions (if applicable):**
  - <additional angle suggested>
- **Surprising findings:** <anything unexpected or "none">
- **Follow-up needed:** Yes / No — <if yes, describe>
```

{{gate kind=phase validates=data-analyst}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
