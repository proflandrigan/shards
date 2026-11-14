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

```
Task(
  subagent_type="bi-engineer",
  description="Chart design review for [study]",
  prompt="I am the Data Scientist shard. I am about to build visualizations for study [name].
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
  Return your review as: Approved (proceed as planned) | Concerns raised (flag issues)."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `bi-engineer` row).

Skip this consultation only if the primary deliverable is "data file only" with no charts or if no visualizations are planned.

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
  - Verdict: Approved | Concerns raised
  - Tier: Proceed | Proceed with caveats
  - Reviewer resolution: Approved | User override — <rationale>
```

::GATE:: id=data-scientist-phase-5 phase=5 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_scientist/phases/phase-6.md` in full and follow its instructions starting from Phase 6. Do not pre-read further phase files.
