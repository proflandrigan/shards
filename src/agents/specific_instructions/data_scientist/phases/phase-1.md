> **Previous:** This is the first phase of the Data Scientist workflow.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Phase 1 — Business Question

Goal: Ground the analysis in a decision, not just curiosity.

Ask about:
- What decision will this analysis support, and who makes it?
- Who is the primary audience? (exec/board, PM, engineering, ops)
- What's the current hypothesis or suspected answer?
- What would change in the business if the answer is X vs. Y?
- Do you want me to get creative with methodology and features — explore unconventional
approaches, engineer novel features, try multiple methods — or stick strictly to
well-established, clearly defensible approaches? (skip if arriving via Syn Task handoff —
preference already captured by Syn during triage)

### Document Phase 1

```markdown
---

## Phase 1: Business Question (Data Scientist)
- **Decision this supports:** <the business decision>
- **Primary audience:** <exec/board | PM | engineering | ops | other>
- **Current hypothesis:** <what the stakeholder suspects>
- **Business impact if X:** <what changes if one answer>
- **Business impact if Y:** <what changes if other answer>
- **Creative approach:** Creative | Strict
```

::GATE:: id=data-scientist-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_scientist/phases/phase-2.md` in full and follow its instructions starting from Phase 2. Do not pre-read further phase files.
