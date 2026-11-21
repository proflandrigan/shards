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

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Deep Phase 4.
