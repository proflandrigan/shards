> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Phase 3 — Execute

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

Goal: Write the queries, get them reviewed, fix anything flagged, then run them
and show results. Queries are NOT executed before the Analytics Engineer review.

**Join path trace:** Before writing any query that joins tables, trace the join
path following `.claude/agents/specific_instructions/shared/join_path_protocol.md`.
Present the trace to the user. If the trace reveals fan-out risk or uncertain
grain, invoke the Data Modeller for validation before writing the query.

### Step 1 — Write queries (do NOT run yet)

Write each query to a `.sql` file in `analysis/<project_name>/queries/`
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

```
Task(
  subagent_type="analytics-engineer",
  description="Pre-execution query review for adhoc analysis",
  prompt="SERVICE MODE — PRE-EXECUTION QUERY REVIEW. I am the Data Analyst
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
     pattern auto-verify is for. Open `::AUTO-VERIFY:: agent=data-analyst phase=3`
     before the sweep, `::ENDAUTO::` after. See
     `specific_instructions/shared/auto_verify_mode.md`.
  5. Return a verdict: Sound / Concerns / Revise — with specific issues
     ordered by severity, plus the expected row counts from step 4."
)
```

Append the AE's review verbatim to the Phase 3 specs section. Present the
verdict and key findings to the user.

### Step 3 — Fix anything flagged

**If AE returns Concerns or Revise:**
1. Address SQL bugs, wrong-layer source choices, or fan-out risks: rewrite the
   affected queries. Do this BEFORE running anything.
2. Data-quality findings on the sources (not query bugs) become caveats in the
   Phase 3 result interpretation — surface them alongside the results when you
   present them.
3. If the AE flags a missing or wrong-grain mart, route this through the
   existing Analytics Engineer flag mechanism in Phase 1 (write or update
   `ae-intake.md`) and document the gap in Phase 3 specs.
4. After rewrites, re-invoke the AE once for confirmation. If still Concerns
   after one revision pass, surface the disagreement to the user and let them
   decide whether to proceed.

### Step 4 — Run the queries

With the AE's sign-off (Sound, or Concerns resolved), run each query (if
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
     Run `/bi-engineer` or `/shards`. In Phase 0, reference this file:
     analysis/<project_name>/bi-intake.md

     ---

     Tell the user: "I've written `analysis/<project_name>/bi-intake.md` with the
     dashboard requirements for the BI Engineer. Run `/bi-engineer` or `/shards`
     and reference that file in Phase 0."

     Document in Phase 3 specs:
     **BI Engineer handoff requested:** Yes
     **BI intake file written:** Yes — analysis/<project_name>/bi-intake.md

### Document Phase 3

```markdown
---

## Phase 3: Results (Data Analyst)
- **Analytics Engineer pre-execution review:**
  - **Verdict:** Sound | Concerns | Revise | Skipped — <reason if skipped>
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

::GATE:: id=data-analyst-phase-3 phase=3 kind=phase validates=data_analyst
Read this section back to the user. Stop here — wait for the user to explicitly confirm the results answer the question before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_analyst/phases/phase-4.md` in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
