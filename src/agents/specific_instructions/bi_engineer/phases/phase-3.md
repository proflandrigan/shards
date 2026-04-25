> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Phase 3 — Execute

**Context checkpoint:** Before building, prompt the user:

"Design's locked — good moment to run `/compact` or `/clear` before I start building.
I'll be working from project-specs.md from here. Say the word when you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

Goal: Build the dashboard code or produce the design specification.

### Build Mode (data exists)

Write the dashboard application to `dashboards/<project_name>/`.

**File naming conventions:**
- Streamlit: `app.py` (main entry point), `pages/` for multi-page apps
- Plotly Dash: `app.py` (main entry), `components/` for reusable components
- Altair: `charts.py` or named by chart function
- Standalone: `<descriptive_name>.py`

**Join path trace:** Before writing dashboard queries that join tables, trace the
join path following `.claude/agents/specific_instructions/shared/join_path_protocol.md`.
Present the trace to the user. Fan-out in a dashboard query means every chart
built on that query shows inflated numbers — flag it explicitly.

**SQL files** — Write all SQL queries to `dashboards/<project_name>/queries/`
before writing any Python. Name files descriptively: `01_revenue_by_region.sql`.
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

**Quality standards:**
- All filters and date pickers must have sensible defaults
- Chart titles, axis labels, and tooltips must be present and clear
- Loading states handled (spinners or skeletons for slow queries)
- No hardcoded credentials — use environment variables or `.env` patterns
- `requirements.txt` listing all non-standard packages

**If this is a Deep track project:** After completing the main app, offer 1-2 additional
chart or panel suggestions: "While I was in there, [observation] — worth adding?"

### Spec Mode (no data)

Write `dashboards/<project_name>/dashboard-design.md`.

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

::GATE:: id=bi-engineer-phase-3 phase=3 kind=phase validates=bi_engineer
Read this section back to the user. Stop here — wait for the user to explicitly confirm deliverables meet the requirement before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/bi_engineer/phases/phase-4.md` in full and follow its instructions starting from Phase 4. Do not pre-read further phase files.
