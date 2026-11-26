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

The dashboard application goes in the targets confirmed in `## Placement` ({{protocol placement}}); `shards/<project_name>/` is the new-project default, and the paths below assume it. It is built as
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
`shards/<project_name>/queries/`, and queries are completed before the
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

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

Run the lead loop from the delegated build protocol above. BI specifics:
queries come before the Python that reads them (use `depends_on`), and a chart
that cannot be built as planned or a panel the data does not support is a
deviation ({{protocol plan_drift}}).

**Final integration check (lead, after all tasks are done):** start the
assembled app end to end, confirm every panel loads with its default filters,
and record the result as an evidence row before the gate.

**If this is a Deep track project:** After all tasks are done, offer 1-2
additional chart or panel suggestions: "While I was in there, [observation] —
worth adding?"

### Spec Mode (no data)

The design document is `shards/<project_name>/dashboard-design.md`. Spec
mode is small: the panel template below is the component specification, and
panel tasks go to workers like any other task. Mark a panel task
`delegate: inline` only for a trivial one, at most 2 per phase. Use the
same loop, macro and evidence rows as Build Mode, using the same
`shards/<project_name>/tasks.yaml`.

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
