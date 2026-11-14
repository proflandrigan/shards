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

```
Task(
  subagent_type="data-scientist",
  description="Review analysis plan for [project]",
  prompt="I am the Data Analyst shard. I've planned an adhoc analysis for [topic].
  Here is my analysis plan:
  [include the query outlines]
  Please review: Does this approach make sense for the question being asked?
  Are there obvious gaps or better approaches? Any concerns about the data
  sources or methodology? Keep the review brief and focused."
)
```

**Request Researcher review of statistical assumptions:**

Tell the user: "Let me loop in the Researcher to check the statistical assumptions. Quick call, then we'll proceed."

```
Task(
  subagent_type="researcher",
  description="Review statistical assumptions for [project]",
  prompt="I am the Data Analyst shard. I've planned an adhoc analysis for [topic].
  Here is my analysis plan:
  [include the query outlines, metrics, and any comparisons or aggregations]
  Please review the statistical assumptions: Are the metrics I'm computing
  appropriate for this data? Any distribution or outlier concerns with the
  proposed approach? Any sample size issues? Keep the review focused — this
  is a quick analysis, not a deep study."
)
```

Present both the Data Scientist's and Researcher's findings to the user.
Address any concerns raised by either review.

**BI Engineer flag (visualization output):**
If the definition of done (set in Phase 0) includes a chart, graph, or any visual
output, consult the BI Engineer for chart design review:

Tell the user: "The output includes a visualization — getting the BI Engineer to weigh in on chart type and design. One sec."

```
Task(
  subagent_type="bi-engineer",
  description="Chart design review for [project]",
  prompt="I am the Data Analyst shard working on an adhoc analysis for [topic].
  The output will include a visualization. Here is what I'm planning to display:
  [include the query outline and intended visualization — chart type, axes, measures]
  Please review: Is this the right chart type for this data? Any design or clarity
  recommendations? Keep the review brief and focused — this is a quick analysis output."
)
```

Present the BI Engineer's feedback to the user. Address any design recommendations
before proceeding to execution.

**Escalation check:** If the Data Scientist suggests this needs deeper analysis,
tell the user: "The Data Scientist thinks this needs more depth. Should we escalate?"

### Document Phase 2

```markdown
---

## Phase 2: Analysis Plan (Data Analyst)
- **Queries planned:**
  1. <query description — tables, joins, filters, output>
  2. <query description>
  3. <query description (if needed)>
- **Data Scientist review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary of review feedback>
  - Issues addressed: <how concerns were resolved, or "none raised">
- **Researcher review:**
  - Verdict: Sound | Concerns | Revise
  - Notes: <summary of statistical assumption review>
  - Issues addressed: <how concerns were resolved, or "none raised">
- **BI Engineer review (if applicable):**
  - Verdict: Approved | Not applicable | Recommendations provided
  - Notes: <summary of chart design feedback or "N/A — no visualization output">
- **Escalation recommended:** No | Yes — <reason>
```

::GATE:: id=data-analyst-phase-2 phase=2 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_analyst/phases/phase-3.md` in full and follow its instructions starting from Phase 3. Do not pre-read further phase files.
