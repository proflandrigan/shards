> **Previous:** phase-1.md confirmed
> **Next:** phase-3.md (read only after this phase's gate is confirmed)

---

## Phase 2 — Analysis Plan

Goal: Define the queries needed and get them reviewed.

Outline the queries (max 2-3):
- What each query does
- Which tables it hits
- Key joins and filters
- Expected output shape

When selecting metrics, use established measures as a foundation but also consider whether a custom derived metric would more precisely answer the core question. A novel ratio, rate-of-change, or composite may outperform a standard count or average — propose it alongside the standard option.

**Request Data Scientist review:**

Tell the user: "This is worth a second opinion — I'm grabbing the Data Scientist shard to sanity-check the plan. Hang tight."

{{consult data-scientist entry=review task="Review analysis plan for [project]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Analyst shard. I've planned an adhoc analysis for [topic].
Here is my analysis plan:
[include the query outlines]
Please review: Does this approach make sense for the question being asked?
Are there obvious gaps or better approaches? Any concerns about the data
sources or methodology? Keep the review brief and focused.
```

**Request Researcher review of statistical assumptions:**

Tell the user: "Let me loop in the Researcher to check the statistical assumptions. Quick call, then we'll proceed."

Before this consult, collect data-modeller context (grain, entities, relationships) for the data under review: {{consult data-modeller entry=review task="Grain and relationships for the researcher review"}} Pass that context in the task of the researcher consult below.


{{consult researcher entry=service task="Review statistical assumptions for [project]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Analyst shard. I've planned an adhoc analysis for [topic].
Here is my analysis plan:
[include the query outlines, metrics, and any comparisons or aggregations]
Please review the statistical assumptions: Are the metrics I'm computing
appropriate for this data? Any distribution or outlier concerns with the
proposed approach? Any sample size issues? Keep the review focused — this
is a quick analysis, not a deep study.
```

Present both the Data Scientist's and Researcher's findings to the user.
Address any concerns raised by either review.

**BI Engineer flag (visualization output):**
If the definition of done (set in Phase 0) includes a chart, graph, or any visual
output, consult the BI Engineer for chart design review:

Tell the user: "The output includes a visualization — getting the BI Engineer to weigh in on chart type and design. One sec."

{{consult bi-engineer entry=review task="Chart design review for [project]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Analyst shard working on an adhoc analysis for [topic].
The output will include a visualization. Here is what I'm planning to display:
[include the query outline and intended visualization — chart type, axes, measures]
Please review: Is this the right chart type for this data? Any design or clarity
recommendations? Keep the review brief and focused — this is a quick analysis output.
```

Present the BI Engineer's feedback to the user. Address any design recommendations
before proceeding to execution.

**Escalation check:** If the Data Scientist suggests this needs deeper analysis,
tell the user: "The Data Scientist thinks this needs more depth. Should we escalate?"

### Decompose the plan into tasks

Turn the plan just agreed into `analysis/<project_name>/tasks.yaml`: one task per query (plus one for the output/visual if any). Each task needs an id, goal, `plan_ref` (the section of `project-specs.md` it implements), inputs, `owned_paths` (no overlap between tasks that can run in parallel), an acceptance command with the expected evidence, `depends_on`, `worker` (this agent), `phase` (3), and size (60 or less). With two or fewer tasks, set `delegate: inline` on them.
Validate the list with the tasks_set tool; the rules are in {{protocol delegated_build}}. Add the `### Task list` table to the Phase 2 section of `project-specs.md` (see the template below) so the user approves plan and tasks together. The tasks are executed in Phase 3.

### Document Phase 2

```markdown
---

## Phase 2: Analysis Plan (Data Analyst)
- **Queries planned:**
  1. <query description — tables, joins, filters, output>
  2. <query description>
  3. <query description (if needed)>
- **Data Scientist review:**
  - Verdict: APPROVED | NEEDS REVISION
  - Notes: <summary of review feedback>
  - Issues addressed: <how concerns were resolved, or "none raised">
- **Researcher review:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Notes: <summary of statistical assumption review>
  - Issues addressed: <how concerns were resolved, or "none raised">
- **BI Engineer review (if applicable):**
  - Verdict: APPROVED | NEEDS REVISION | Not applicable
  - Notes: <summary of chart design feedback or "N/A — no visualization output">
- **Escalation recommended:** No | Yes — <reason>

### Task list

| id | goal | owned paths | acceptance | depends_on |
|----|------|-------------|------------|------------|
| <task id> | <goal> | <owned paths> | <acceptance command and expected evidence> | <ids or none> |

- **Task count:** <N> — `analysis/<project_name>/tasks.yaml`
```

Before the gate, summarize the plan and state the task count and the path `analysis/<project_name>/tasks.yaml`, so the user confirms plan and task list together.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 3}} in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
