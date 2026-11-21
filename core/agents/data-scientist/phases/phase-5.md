> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Phase 5 — Output Format

Goal: Align on deliverables before building them.

Ask about:
- Primary output: Defaults jupyter notebook for analysis and markdown with summary and findings or is more needed (i.e. data files, scripts etc)?
- Required sections: EDA only, full modeling, recommendations, all?
- Visualisation style: clean/minimal vs. exploratory?
- Reproducibility: self-contained or one-time?

Tell the user: "Visuals matter. Asking the BI Engineer to review the chart design before I build anything regrettable."

{{consult bi-engineer entry=review task="Chart design review for [study]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Scientist shard. I am about to build visualizations for study [name].
Please review the planned chart types and suggest improvements before I build them.
This is a design review only — I will implement.

Study context:
- Business question: [from Phase 1]
- Primary audience: [from Phase 1]
- Visualisation style preference: [Clean/minimal | Exploratory, from Phase 5]
- Planned visualizations: [list chart types, what each shows, data basis — e.g.,
  'line chart of monthly churn rate by cohort', 'bar chart of feature importances']

Please review:
1. Are the chart types appropriate for the data and this audience?
2. Are there better alternatives I should use?
3. Any design or layout recommendations given the intended audience?
4. Any visualizations I should add that would strengthen the findings?
Return your review as: APPROVED (proceed as planned) | NEEDS REVISION (flag issues).
```

Apply the Reviewer Verdict Protocol (see shared protocol — `bi-engineer` row).

Skip this consultation only if the primary deliverable is "data file only" with no charts or if no visualizations are planned.

### Decompose the plan into tasks

Turn the plan just agreed into `shards/<project_name>/tasks.yaml`: one task per analysis section or notebook component (data load, each EDA block, each model, each figure group, report assembly). Each task needs an id, goal, `plan_ref` (the section of `project-specs.md` it implements), inputs, `owned_paths` (no overlap between tasks that can run in parallel), an acceptance command with the expected evidence, `depends_on`, `worker` (this agent), `phase` (6), and size (60 or less).
Validate the list with the tasks_set tool; the rules are in {{protocol delegated_build}}. Add the `### Task list` table to the Phase 5 section of `project-specs.md` (see the template below) so the user approves plan and tasks together. The tasks are executed in Phase 6.

**Placement:** propose where each deliverable lands in a `## Placement` section of `project-specs.md`, and pass those paths as `targets` on this phase's `gate_request` so the user confirms them with the plan ({{protocol placement}}).

### Document Phase 5

```markdown
---

## Phase 5: Output Format (Data Scientist)
- **Primary deliverable:** Notebook | Slide summary | Data file | Other
- **Sections included:** <list: EDA, modeling, recommendations, etc.>
- **Visualisation style:** Clean/minimal | Exploratory
- **Reproducibility requirement:** Self-contained | One-time
- **Additional deliverables:** <requirements.txt, summary doc, or "none">
- **BI Engineer chart design review:** N/A — no visual deliverables | <summary>
  - Verdict: APPROVED | NEEDS REVISION
  - Tier: Proceed | Proceed with caveats
  - Reviewer resolution: Approved | User override — <rationale>

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

{{phase 6}} in full and follow its instructions starting from Phase 6. Do not pre-read further phase files.
