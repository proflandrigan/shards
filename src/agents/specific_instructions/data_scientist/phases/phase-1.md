> **Previous:** This is the first phase of the Data Scientist workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Question Discovery

Goal: Deepen the analysis question by probing the user's intent, not ticking a checklist.

Follow the depth probe pattern from `.claude/agents/specific_instructions/shared/intent_discovery.md` (Phase 1 — Depth Probe).

Reference what the user said in Phase 0. Open with a question like:

"Tell me more about [specific thing they mentioned] — what decision depends on this?"

Let the conversation flow. Surface these topics naturally when the user's responses lead there:
- **Decision supported:** what the analysis drives and who makes it
- **Primary audience:** exec/board, PM, engineering, ops
- **Current hypothesis:** what the stakeholder suspects
- **Business impact:** what changes if the answer is X vs. Y
- **Creativity preference:** ask "Should I explore unconventional approaches or stick to well-established methods?" (skip if arriving via Syn handoff — preference already captured)
- **Edge cases / unknowns:** ask "What edge cases or unknowns are you aware of in this data?"
- **Where to look:** existing studies, data sources, stakeholders to consult

### Document Phase 1

```markdown
---

## Phase 1: Business Question (Data Scientist)
- **Decision this supports:** <the business decision>
- **Primary audience:** <exec/board | PM | engineering | ops | other>
- **Current hypothesis:** <what the stakeholder suspects>
- **Business impact if X:** <what changes if one answer>
- **Business impact if Y:** <what changes if other answer>
- **Edge cases / unknowns:** <domain-specific edge cases surfaced>
- **Where to look:** <additional context sources identified>
- **Creative approach:** Creative | Strict
```

::GATE:: id=data-scientist-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_scientist/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
