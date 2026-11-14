> **Previous:** This is the first phase of the ML Engineer workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Business Discovery

Goal: Ground the ML system in a business problem by probing the user's intent, not ticking a checklist.

Continue the discovery rhythm from Phase 0 — open by referencing what the user already said. See the ML Engineer section in `.claude/agents/specific_instructions/shared/intent_discovery.md` for your domain probes.

Let the conversation flow. Surface these topics naturally when the user's responses lead there:
- **Business problem:** what this solves and who benefits
- **Current solution:** what exists today (rule-based, manual, nothing, existing ML)
- **Decision driven by model:** what action the output triggers
- **End users:** internal system, customer-facing, analyst, API consumer
- **Cost of wrong prediction:** false positive vs. false negative asymmetry
- **Business success metric:** KPI from the business perspective, not model metrics
- **Edge cases / unknowns:** domain-specific edge cases the user is aware of
- **Where to look:** existing model docs, data sources, stakeholders to consult

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
- **Edge cases / unknowns:** <domain-specific edge cases surfaced>
- **Where to look:** <additional context sources identified>
- **Business priority:** Critical | High | Medium
```

::GATE:: id=ml-engineer-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ml_engineer/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
