> **Previous:** This is the first phase of the Data Scientist workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Question Discovery

Goal: Deepen the analysis question by probing the user's intent, not ticking a checklist.

Continue the discovery rhythm from Phase 0 — open by referencing what the user already said. See the Data Scientist section in `.claude/agents/specific_instructions/shared/intent_discovery.md` for your domain probes.

Let the conversation flow. Surface these topics naturally when the user's responses lead there:
- **Decision supported:** what the analysis drives and who makes it
- **Primary audience:** exec/board, PM, engineering, ops
- **Current hypothesis:** what the stakeholder suspects
- **Business impact:** what changes if the answer is X vs. Y
- **Creativity preference:** whether they want creative exploration or strict execution (skip if arriving via Syn handoff — preference already captured)
- **Edge cases / unknowns:** domain-specific edge cases the user is aware of in the data
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
