> **Previous:** This is the first phase of the BI Engineer workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Data Discovery

Goal: Deepen understanding of what the user is building and what data exists to support it — driven by their intent, not a checklist.

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

Present the Data Modeller's findings to the user. Let their questions and reactions guide the follow-ups rather than running a checklist. Surface these topics naturally:

"Given this data, what metrics matter most to you? What are you looking to see day-to-day?"

Let the conversation flow to cover:
- **Metrics and dimensions:** the actual numbers and breakdowns they care about
- **Filters:** date range, segment, region — ask "How do you want to slice this?"
- **Update frequency:** live, daily, manual — ask "How fresh does this need to be?"
- **Interactivity:** dropdowns, drill-down, cross-filter — ask "How do you want to explore the data?"
- **Branding / colors:** ask "Any visual constraints to match?"

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
- **Edge cases / unknowns:** <domain-specific edge cases surfaced>
- **Where to look:** <additional context sources identified>
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

::GATE:: id=bi-engineer-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/bi_engineer/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
