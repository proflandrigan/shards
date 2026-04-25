> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Deep Phase 3 — Relationship Mapping

Goal: Define how entities relate to each other.

For each relationship: two entities, cardinality, optionality, join key(s), FK direction.

Ask about:
- Many-to-many relationships needing bridge tables?
- Self-referential relationships?
- Time-dependent relationships?

Present the full relationship map as a text diagram.

### Document Deep Phase 3

```markdown
---

## Deep Phase 3: Relationship Mapping (Data Modeller)
- **Relationships:**
  | From | To | Cardinality | Optionality | Join Key | Notes |
  |------|----|-------------|-------------|----------|-------|
  | <entity> | <entity> | 1:M | Required | <key> | |
- **Bridge tables needed:**
  - <bridge entity>: resolves <entity> ↔ <entity> M:M
- **Time-dependent relationships:**
  - <description or "none">
- **Relationship diagram:**
  ```
  <text diagram>
  ```
```

::GATE:: id=data-modeller-deep-phase-3 phase=3 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_modeller/phases_deep/phase-4.md` in full and follow its instructions starting from Deep Phase 4.
