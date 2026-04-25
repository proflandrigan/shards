> **Previous:** This is the first phase of the AI Engineer workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Business Requirements

Goal: Ground the AI system in a business problem, not a technology choice. "Use AI" is
not a business requirement.

Ask about:
- What business problem does this solve? Who benefits?
- What's the current solution? (manual, rule-based, nothing, existing AI)
- What decision or action does the AI output drive?
- Who are the end users? (internal tool, customer-facing, API consumer, autonomous agent)
- **What's the cost of a wrong output?** This is more nuanced than ML false positives:
  hallucinated content shown to customers, inappropriate responses, leaked data in
  generated output, wrong instructions acted upon, confidently wrong answers.
- **What's the acceptable error rate?** For generative systems, "0% errors" is naive.
  Force a real number. What percentage of outputs can be wrong before the system
  fails the business?
- What's the success metric from the business perspective? (not model metrics —
  business KPIs)
- **Who reviews AI output before it reaches end users?** Is there a human-in-the-loop,
  or is this fully autonomous? If autonomous: are we sure? Really sure?

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
- **Business priority:** Critical | High | Medium
```

::GATE:: id=ai-engineer-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ai_engineer/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
