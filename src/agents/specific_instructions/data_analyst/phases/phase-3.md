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

Goal: Write and run the queries.

**Join path trace:** Before writing any query that joins tables, trace the join
path following `.claude/agents/specific_instructions/shared/join_path_protocol.md`.
Present the trace to the user. If the trace reveals fan-out risk or uncertain
grain, invoke the Data Modeller for validation before writing the query.

1. Write each query to a `.sql` file in `analysis/<project_name>/queries/`
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
2. Run each query (if environment permits) or present ready to run
3. Return results with a 1-2 sentence plain-language interpretation for each
4. If results are surprising or raise more questions, proactively note it

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
- **Queries executed:**
  1. <query file>: <brief description>
     - Result: <the answer — number, table summary, or chart description>
     - Interpretation: <1-2 sentence plain-language interpretation>
  2. <query file>: <description>
     - Result: <answer>
     - Interpretation: <interpretation>
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
