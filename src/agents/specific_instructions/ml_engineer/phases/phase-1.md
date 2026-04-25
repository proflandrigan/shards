> **Previous:** This is the first phase of the ML Engineer workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Business Requirements

Goal: Ground the ML system in a business problem, not a technology choice.

Ask about:
- What business problem does this solve? Who benefits?
- What's the current solution? (rule-based, manual, nothing)
- What's the decision or action the model output drives?
- Who are the end users of the model's predictions? (internal system, customer-facing,
  analyst dashboard, API consumer)
- What's the cost of a wrong prediction? (false positive vs. false negative asymmetry)
- What's the success metric from the business perspective? (not model metrics —
  business KPIs like conversion rate, revenue, time saved)

### Document Phase 1

```markdown
---

## Phase 1: Business Requirements (ML Engineer)
- **Business problem:** <what this solves>
- **Current solution:** <rule-based | manual | none | existing ML — describe>
- **Decision driven by model:** <what action the output triggers>
- **End users:** <internal system | customer-facing | analyst | API consumer>
- **Cost of wrong prediction:**
  - False positive: <business impact>
  - False negative: <business impact>
- **Business success metric:** <KPI and target, not model metrics>
- **Business priority:** Critical | High | Medium
```

::GATE:: id=ml-engineer-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ml_engineer/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
