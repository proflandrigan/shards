> **Previous:** This is the first phase of the Data Modeller Quick Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Quick Phase 1 — Scope the Change

Ask about:
- Which model(s) and column(s) are affected?
- Current state vs. desired state?
- Downstream dependencies?

Then:
1. Read the model file and its .yml schema
2. Trace downstream dependencies via ref()
3. Assess blast radius
4. Present the change plan

### Document Quick Phase 1

Append to project-specs.md:

```markdown
---

## Quick Phase 1: Change Scope (Data Modeller)
- **Affected model(s):** <model name(s) and file path(s)>
- **Current state:** <what exists now>
- **Desired state:** <what should exist after>
- **Downstream dependencies:** <models that reference affected columns>
- **Blast radius:** Isolated | Minor (<3 models) | Significant (3+)
- **Change plan:**
  - <file>: <what changes>
```

::GATE:: id=data-modeller-quick-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_modeller/phases_quick/phase-2.md` in full and follow its instructions starting from Quick Phase 2.
