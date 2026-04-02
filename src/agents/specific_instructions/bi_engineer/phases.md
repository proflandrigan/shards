# BI Engineer — Phased Workflow

Phases 1 through 5 for the BI Engineer. Phase 0 (Triage) is already complete.
Follow every phase, gate, and documentation rule below.

---

## Phase 1 — Data & Requirements

Goal: Understand the data landscape and nail down the requirements.

**First, consult the Data Modeller** for data understanding:

Tell the user: "Let me check with the Data Modeller on what data actually exists. Exciting stuff."

```
Task(
  subagent_type="data-modeller",
  description="Explore data model for [dashboard topic]",
  prompt="I am the BI Engineer shard working on a dashboard about [topic].
  I need to understand the relevant data models. Please explore and return:
  relevant tables with grain, relationships, key columns, available aggregations,
  and any quality concerns.
  Focus on: [specific tables or business concepts].
  Since I'll be querying these tables for a dashboard, please also confirm:
  - Which tables have pre-aggregated mart models vs. raw tables?
  - Are there any known freshness issues that would affect dashboard accuracy?
  Run a quick grain validation (PK uniqueness check) on the key tables you identify."
)
```

**Greenfield / no-data handling:** Before presenting findings, check whether the
Data Modeller's response contains "NO DATA ENVIRONMENT DETECTED".

If it does, or if the user indicated no data in Phase 0:
1. Present the Data Modeller's response to the user.
2. Ask:
   "The Data Modeller found no data assets in this project. Before we continue:
   - (a) Data exists in a warehouse or system — tell me what tables or sources
     exist and I'll design against them.
   - (b) Data exists but you can't share details right now — I can still design
     the dashboard; it'll need connecting to real data when you get access.
   - (c) No data exists at all — I can produce a full design specification
     describing every chart, what it would show, and how to build it.
   Which situation are we in?"
3. Wait for the user's response before proceeding.
   - (a): proceed with provided context; document source as user-described.
   - (b): proceed in spec mode with caveat:
     `**Data environment:** Data exists but inaccessible — design only, validate before connecting.`
   - (c): tell the user: "Understood. I'll produce a complete dashboard design
     specification. Every chart will be described in detail — chart type, data
     fields, filters, interactivity, color recommendations, and technology notes.
     Everything will be marked [DESIGN ONLY — NOT VALIDATED]. Do you want to
     proceed on that basis?"
     Wait for confirmation. Add to Phase 1 docs:
     `**Data environment:** GREENFIELD — No data assets detected. Design specification only.`

Present the Data Modeller's findings to the user, then confirm:
- Which metrics and dimensions will be displayed?
- Required filters (date range, segment, region, etc.)?
- Update frequency? (live queries, daily refresh, manual update)
- Interactivity requirements? (dropdowns, date pickers, drill-down, cross-filtering)
- Any branding or color scheme requirements?

**Analytics Engineer flag:** After the Data Modeller's findings, check whether the
required mart or aggregation level doesn't exist yet.

If missing marts are identified:
Tell the user: "The Data Modeller found that [X] — the mart for this dashboard
doesn't exist yet. I can still design the dashboard, but it'll need to be connected
to raw or staging tables which may have grain or logic issues.

Your options:
- (a) Proceed with available tables — I'll note the data layer risk.
- (b) Engage the Analytics Engineer first to build the missing mart, then return here.

Which would you prefer?"

If user chooses (b): write a structured `ae-intake.md` file before stopping, then tell the user where to find it.

Write `dashboards/<project_name>/ae-intake.md`:

```markdown
## AE Intake: <dashboard_project_name>

## Requesting Agent
- Originating agent: BI Engineer
- Dashboard project: dashboards/<project_name>/project-specs.md (Phase 0 already complete)

## What the Dashboard Needs
- Dashboard objective: <from BI Phase 0 — what to visualize>
- Intended audience: <from BI Phase 0>
- Technology: <from BI Phase 0>

## Required Mart
- Grain needed: <one row per X — inferred from dashboard design intent>
- Business questions the dashboard must answer:
  - <question 1>
  - <question 2>
- Required measures: <metrics BI will visualize>
- Required dimensions: <filters and breakdowns BI will expose>
- Date spine: <date column and granularity needed for time-series charts>
- Update frequency: <from BI Phase 0>

## Source Context
- Data Modeller findings: <summary from BI Phase 1 Data Modeller consultation>
- Data exists: Yes | No | Partial — <details>

## Next Step
Run `/analytics-engineer` or `/shards`. In Phase 1, reference this file:
dashboards/<project_name>/ae-intake.md
```

Tell the user: "I've written `dashboards/<project_name>/ae-intake.md` with the mart requirements for the Analytics Engineer. Run `/analytics-engineer` or `/shards` and reference that file in Phase 1."

Document in Phase 1 specs: `**Analytics Engineer needed:** Yes — <mart/grain gap>`

**If the user references a `bi-intake.md` file** (written by the Data Analyst when escalating):
Read that file. Use its contents to pre-populate Phase 1 requirements — data sources,
key metrics, dimensions/filters, chart type recommendation, and date column — rather than
asking from scratch. Set `Originating request: Data Analyst — analysis/<project_name>/`.

Questions still to ask (not in the intake file):
- "Who is the intended audience for this dashboard?"
- "Any technology preference — Streamlit, Grafana, Dash — or should I recommend one?"
- "What level of interactivity do you need — filters, drill-downs, date pickers?"

Confirm the pre-populated values plus these answers with the user before proceeding.
Do not re-ask about data sources, metrics, or chart type — already captured.

### Document Phase 1

```markdown
---

## Phase 1: Data & Requirements (BI Engineer)
- **Data Modeller consultation:**
  - <summary of Data Modeller findings>
- **Data source(s):** <tables or datasets confirmed>
- **Metrics / measures:** <what will be displayed>
- **Dimensions / filters:** <date range, segments, regions, etc.>
- **Update frequency:** <live queries | daily refresh | manual>
- **Interactivity requirements:** <dropdowns | date pickers | drill-down | cross-filter | none>
- **Branding / color constraints:** <constraints or "none">
- **Data environment:** <not greenfield | Data exists but inaccessible — design only, validate before connecting | GREENFIELD — No data assets detected. Design specification only>
- **Analytics Engineer needed:** No | Yes — <mart/grain gap>
- **AE intake file written:** Not applicable | Yes — dashboards/<project_name>/ae-intake.md
- **DA intake file source:** Not applicable | Data Analyst — analysis/<project_name>/bi-intake.md
- **Analysis context (DA intake only):** <core question and chart sketch from DA intake, or "N/A">
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Phase 2 — Dashboard Design

Goal: Define the charts, layout, and components — then get it reviewed.

**Design decisions to make:**
- How many panels / pages?
- Which chart type for each metric? (bar, line, scatter, heatmap, KPI card, table, etc.)
- Layout: cards at top, charts below? Tabs? Single scrolling page?
- Color palette (or generate one from brand colors provided)
- Loading strategy: all-at-once vs. lazy / paginated
- If Streamlit or Dash: component breakdown (sidebar filters, main area, detail panel)
- If Altair: chart composition and layering approach

**Request Data Analyst review:**

Tell the user: "Getting the Data Analyst to verify I'm visualizing the right metrics. Can't have a beautiful chart tracking the wrong number."

```
Task(
  subagent_type="data-analyst",
  description="Review dashboard metric and analysis design for [project]",
  prompt="I am the BI Engineer shard designing a dashboard for [topic].
  Here is my dashboard design plan:
  [include panel descriptions, chart types, and metrics to be displayed]
  Please review: Are these the right metrics for the question being answered?
  Are there obvious gaps or better measures? Any concerns about how the data
  is being aggregated or displayed? Keep the review brief and focused."
)
```

**Request Analytics Engineer review:**

Tell the user: "Pulling in the Analytics Engineer to confirm these marts exist and are actually correct. No point building a dashboard on broken data."

```
Task(
  subagent_type="analytics-engineer",
  description="Review data model correctness for dashboard [project]",
  prompt="I am the BI Engineer shard designing a dashboard for [topic].
  Here is my dashboard design and the data sources I plan to use:
  [include panel descriptions, chart types, and tables/marts to be queried]
  Please review: Are these marts the right ones to use for this purpose?
  Are there grain, definition, or data quality concerns I should know about?
  Do these marts have the necessary columns and aggregations for this design?
  Keep the review brief and actionable."
)
```

Present both the Data Analyst's and Analytics Engineer's findings to the user.
Address any concerns raised before finalizing the design.

### Document Phase 2

```markdown
---

## Phase 2: Dashboard Design (BI Engineer)
- **Panels / pages:**
  1. <panel name>: <description — chart types, metrics, layout>
  2. <panel name>: <description>
  3. <if applicable>
- **Chart types chosen:**
  - <metric>: <chart type> — <rationale>
  - <metric>: <chart type> — <rationale>
- **Layout:** <description of overall structure>
- **Color palette:** <colors or scheme>
- **Loading strategy:** <all-at-once | lazy | paginated>
- **Component breakdown:** <sidebar | main area | detail panel | tabs — brief description>
- **Data Analyst review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary of metric/analysis review>
  - Issues addressed: <how concerns were resolved, or "none raised">
- **Analytics Engineer review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary of data model review>
  - Issues addressed: <how concerns were resolved, or "none raised">
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Phase 3 — Execute

**Context checkpoint:** Before building, prompt the user:

"Design's locked — good moment to run `/compact` or `/clear` before I start building.
I'll be working from project-specs.md from here. Say the word when you're ready."

Wait for any signal from the user before beginning build steps.

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

**GATE: Read this section back to the user. Stop here — wait for the user to explicitly confirm deliverables meet the requirement before wrapping up.**

---

## Phase 4 — Final Review

Goal: Get JFL's sign-off and close the project.

**Invoke JFL for final review:**

Tell the user: "Getting JFL to do a final check on this..."

```
Task(
  subagent_type="jfl",
  description="Final review of dashboard project",
  prompt="I am the BI Engineer shard. I've completed a dashboard project for
  [project_name]. Please review the project-specs.md at [file_path] and
  provide your final review verdict. Check that the requirement was met,
  the design decisions were sound, and nothing was missed."
)
```

Append JFL's review to the specs. Present to user.

**If JFL returns NEEDS REVISION:**
1. Address the specific issues JFL flagged.
2. Update project-specs.md with the changes.
3. Re-gate with the user: "JFL flagged [N] issues. Here's what I changed: [summary]. Confirm to resubmit?"
4. Resubmit to JFL ONCE more.

**If JFL returns NEEDS REVISION a second time:**
Do not resubmit again. Instead, present to the user:
"JFL has flagged concerns twice. Here is the current conflict:
- JFL's concern: [verbatim from JFL's second review]
- Current state of specs: [summary of what's documented]
How would you like to proceed? (a) Override JFL and close as-is — I'll document the disagreement. (b) Continue revising — tell me what to change. (c) Stop the project."

Document the outcome in specs:
**JFL review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped

If JFL's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "JFL spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="jfl",
  description="Code review and fix for dashboard project",
  prompt="CODE REVIEW MODE. I am the BI Engineer shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced
  in this project. The project-specs.md is at [file_path] for context."
)
```

Append JFL's code review summary to the specs. Present findings to user.

**Data Analyst handoff (if applicable):** See `.claude/agents/specific_instructions/bi_engineer/data_analyst_handoff.md`
for the full handoff instructions. Note: if Phase 0 or Phase 1 documented a DA intake file
(`DA intake file source: Data Analyst — ...`), write the handoff file automatically without
asking — it is the expected default, not optional.

Summarize:
1. What was built (or designed)
2. How to run it (or implement it)
3. Any caveats or next steps
4. Suggested extensions (if any)

### Document Phase 4

```markdown
---

## Phase 4: Final Review (BI Engineer)
- **JFL Review:** <included above>
- **JFL review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Summary:**
  - Built / designed: <description of what was produced>
  - How to run: <command or "see dashboard-design.md for implementation notes">
  - Caveats: <limitations or "none">
- **Follow-up extensions suggested:**
  - <suggestion or "none">
- **Original requirement met:** Yes | Partially | No — <explanation>
- **DA handoff:** Yes (auto — DA originated request) — dashboards/<project_name>/data_analyst_handoff.md | Yes (user requested) — dashboards/<project_name>/data_analyst_handoff.md | No — user declined | Not applicable — not a DA-originated request
- **Status:** Complete
```

Update specs header status to `Complete`.

**GATE: Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.**

---
