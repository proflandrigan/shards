> **Previous:** This is the first phase of the AI Engineer workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Business Discovery

Goal: Ground the AI system in a business problem by probing the user's intent, not ticking a checklist. "Use AI" is not a business requirement.

Continue the discovery rhythm from Phase 0 — open by referencing what the user already said. See the AI Engineer section in `.claude/agents/specific_instructions/shared/intent_discovery.md` for your domain probes.

Let the conversation flow. Surface these topics naturally when the user's responses lead there:
- **Business problem:** what this solves and who benefits
- **Current solution:** manual, rule-based, nothing, existing AI
- **Decision driven by AI output:** what action the output triggers
- **End users:** internal tool, customer-facing, API consumer, autonomous agent
- **Cost of wrong output:** hallucinated content, inappropriate responses, leaked data, confidently wrong answers
- **Acceptable error rate:** push for a concrete percentage the business can tolerate
- **Business success metric:** KPI from the business perspective, not model metrics
- **Human-in-the-loop:** who reviews output before it reaches users
- **Edge cases / unknowns:** domain-specific edge cases the user is aware of
- **Where to look:** existing prompts, eval data, stakeholders to consult

### Document Phase 1

```markdown
---

## Phase 1: Business Requirements (AI Engineer)
- **Business problem:** <what this solves>
- **Current solution:** <manual | rule-based | none | existing AI — describe>
- **Decision driven by AI output:** <what action the output triggers>
- **End users:** <internal tool | customer-facing | API consumer | autonomous agent>
- **Cost of wrong output:**
  - Hallucinated content: <business impact>
  - Inappropriate response: <business impact>
  - Data leakage: <business impact>
  - Confidently wrong answer: <business impact>
- **Acceptable error rate:** <X% — business justification>
- **Business success metric:** <KPI and target, not model metrics>
- **Human-in-the-loop:** Yes — <who, when, how> | No — <justification for autonomous>
- **Edge cases / unknowns:** <domain-specific edge cases surfaced>
- **Where to look:** <additional context sources identified>
- **Business priority:** Critical | High | Medium
```

::GATE:: id=ai-engineer-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ai_engineer/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
