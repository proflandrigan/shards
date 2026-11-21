> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Phase 3 — Execute

**Context checkpoint:** Before building, prompt the user:

"Design's locked — good moment to trim or reset your context before I start building.
I'll be working from project-specs.md from here. Say the word when you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

Goal: Build the dashboard code, component by component, or produce the design
specification.

{{protocol delegated_build}}

### Build Mode (data exists)

The dashboard application goes in `dashboards/<project_name>/`. It is built as
a set of delegated tasks, one tested component each (for example one SQL query
file, the data-access layer, one chart or page, filters/defaults, the
requirements file). You are the lead: you dispatch, verify and record; you do
not write the build code yourself.

**Join path trace:** Before dispatching any task that writes dashboard queries
that join tables, trace the join path following
[`protocols/join_path.md`](../../../protocols/join_path.md). Present the trace
to the user. Fan-out in a dashboard query means every chart built on that query
shows inflated numbers: flag it explicitly.

#### Component specifications

Task cards cite these sections via `plan_ref`; workers only see the sections a
card references.

**File naming conventions:**
- Streamlit: `app.py` (main entry point), `pages/` for multi-page apps
- Plotly Dash: `app.py` (main entry), `components/` for reusable components
- Altair: `charts.py` or named by chart function
- Standalone: `<descriptive_name>.py`

**SQL files** — each query is its own file in
`dashboards/<project_name>/queries/`, and queries are completed before the
Python that uses them. Name files descriptively: `01_revenue_by_region.sql`.
Include a header comment in each file:
```sql
-- Dashboard: <project_name>
-- Query: <description>
-- Date: <date>
-- Data sources: <key tables or marts used>
-- Output grain: one row per <entity>
```

**SQL loading rule** — **Do NOT embed SQL as Python strings.** Read `.sql` files
directly using `Path.read_text()`:
```python
from pathlib import Path
sql = Path("queries/01_revenue_by_region.sql").read_text()
df = pd.read_sql(sql, conn)
```

**Include at the top of every Python file:**
```python
# Dashboard: <project_name>
# Description: <what this file does>
# Date: <date>
# Data sources: <key tables or marts used>
```

**Quality standards (every component):**
- All filters and date pickers must have sensible defaults
- Chart titles, axis labels, and tooltips must be present and clear
- Loading states handled (spinners or skeletons for slow queries)
- No hardcoded credentials — use environment variables or `.env` patterns
- `requirements.txt` listing all non-standard packages

**Task evidence guidance:** {{protocol incremental_testing}} Per-task
acceptance examples: a query file runs and returns the stated output grain with
a sane row count; a chart module imports and renders from a fixture frame; the
app starts headless without error; `requirements.txt` installs.

#### Lead loop

{{delegate tasks=dashboards/<project_name>/tasks.yaml max_parallel=3}}

1. **Load** the task list approved at the Phase 2 gate (call `tasks_set`; fix
   and re-validate if it is rejected).
2. **Dispatch** ready tasks (`task_dispatch`) in parallel up to
   `max_parallel=3`. Queries come before the Python that reads them (use
   `depends_on`).
3. **Collect** each worker's result via `task_report`.
4. **Verify before counting.** For every report, re-run (or independently
   check) the acceptance command and compare the output with the `plan_ref`
   spec. Then write a per-task evidence row to the `## Validation` Evidence
   table (Check = task id + component, Expected, Observed, Pass/Fail). Never
   mark a task done on the worker's word alone.
5. **On failure** re-dispatch with the failure output as feedback, at most 2
   retries; then stop and ask the user with a summary.
6. **Deviations** (a chart cannot be built as planned, data does not support a
   panel): pause dependent tasks and follow {{protocol plan_drift}}; amend the
   plan only via a confirmed gate.
7. **Dispatch** tasks unblocked by done tasks until all are done.
8. You write no build code yourself except for `delegate: inline` tasks.

**Final integration check (lead, after all tasks are done):** start the
assembled app end to end, confirm every panel loads with its default filters,
and record the result as an evidence row before the gate.

**If this is a Deep track project:** After all tasks are done, offer 1-2
additional chart or panel suggestions: "While I was in there, [observation] —
worth adding?"

### Spec Mode (no data)

The design document is `dashboards/<project_name>/dashboard-design.md`. Spec
mode is small: the panel template below is the component specification, and
panel tasks are normally `delegate: inline` (you write them yourself) with the
same loop, macro and evidence rows as Build Mode, using the same
`dashboards/<project_name>/tasks.yaml`.

For each chart or panel, document:

```markdown
### Panel: <Panel Name>

- **Chart type:** <bar chart | line chart | KPI card | table | scatter | heatmap | etc.>
- **Title:** <suggested chart title>
- **Purpose:** <what question this chart answers>
- **Data fields:**
  - X-axis / dimension: <field name and description>
  - Y-axis / measure: <field name and description>
  - Color / grouping: <field or "none">
  - Filters: <filter controls that affect this panel>
- **Interactivity:** <hover tooltips | click drill-down | linked selection | none>
- **Color scheme:** <recommendation>
- **Technology recommendation:** <Streamlit | Plotly Dash | Altair | etc.> — <rationale>
- **Implementation notes:** <key considerations for when data becomes available>
- **Status:** [DESIGN ONLY — NOT VALIDATED]
```

### Document Phase 3

```markdown
---

## Phase 3: Build (BI Engineer)
- **Mode:** Build | Spec
- **Files produced:**
  - <file path>: <brief description>
  - <file path>: <brief description>
- **Key implementation decisions:**
  - <decision and rationale>
  - <decision and rationale>
- **Data environment note:** <any caveats about data access or theoretical outputs>
- **Suggestions for follow-up:**
  - <suggestion or "none">
```

{{gate kind=phase validates=bi-engineer}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
