> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

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

{{consult data-analyst entry=review task="Review dashboard metric and analysis design for [project]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the BI Engineer shard designing a dashboard for [topic].
Here is my dashboard design plan:
[include panel descriptions, chart types, and metrics to be displayed]
Please review: Are these the right metrics for the question being answered?
Are there obvious gaps or better measures? Any concerns about how the data
is being aggregated or displayed? Keep the review brief and focused.
```

**Request Analytics Engineer review:**

Tell the user: "Pulling in the Analytics Engineer to confirm these marts exist and are actually correct. No point building a dashboard on broken data."

{{consult analytics-engineer entry=review task="Review data model correctness for dashboard [project]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the BI Engineer shard designing a dashboard for [topic].
Here is my dashboard design and the data sources I plan to use:
[include panel descriptions, chart types, and tables/marts to be queried]
Please review: Are these marts the right ones to use for this purpose?
Are there grain, definition, or data quality concerns I should know about?
Do these marts have the necessary columns and aggregations for this design?
Keep the review brief and actionable.
```

Present both the Data Analyst's and Analytics Engineer's findings to the user.
Address any concerns raised before finalizing the design.

### Decompose the plan into tasks

Turn the plan just agreed into `shards/<project_name>/tasks.yaml`: one task per data query, panel or page, and shared component. Each task needs an id, goal, `plan_ref` (the section of `project-specs.md` it implements), inputs, `owned_paths` (no overlap between tasks that can run in parallel), an acceptance command with the expected evidence, `depends_on`, `worker` (this agent), `phase` (3), and size (60 or less).
Validate the list with the tasks_set tool; the rules are in {{protocol delegated_build}}. Add the `### Task list` table to the Phase 2 section of `project-specs.md` (see the template below) so the user approves plan and tasks together. The tasks are executed in Phase 3.

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
  - Verdict: APPROVED | NEEDS REVISION
  - Notes: <summary of metric/analysis review>
  - Issues addressed: <how concerns were resolved, or "none raised">
- **Analytics Engineer review:**
  - Verdict: APPROVED | NEEDS REVISION
  - Notes: <summary of data model review>
  - Issues addressed: <how concerns were resolved, or "none raised">

### Task list

| id | goal | owned paths | acceptance | depends_on |
|----|------|-------------|------------|------------|
| <task id> | <goal> | <owned paths> | <acceptance command and expected evidence> | <ids or none> |

- **Task count:** <N> — `shards/<project_name>/tasks.yaml`
```

Before the gate, summarize the plan and state the task count and the path `shards/<project_name>/tasks.yaml`, so the user confirms plan and task list together.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 3}} in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
