> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Deep Phase 4 — Column Specification

Goal: Define columns for each entity.

For each entity: PK and generation strategy, FK columns, attributes (name, type,
nullable, definition), derived/computed columns, timestamp columns.

Ask about:
- Naming conventions? (_id, _at, is_)
- Standard columns on every model? (_loaded_at, _source_system)
- Enums or constrained value sets?

### Document Deep Phase 4

```markdown
---

## Deep Phase 4: Column Specification (Data Modeller)
- **Naming conventions:**
  - Keys: <convention>
  - Timestamps: <convention>
  - Booleans: <convention>
  - Standard columns: <list or "none">
- **Entity columns:**

### <Entity Name>
| Column | Type | Nullable | Key | Description |
|--------|------|----------|-----|-------------|
| <col> | <type> | No | PK | <description> |
| <col> | <type> | No | FK → <entity> | <description> |

- **Enums / constrained values:**
  - <column>: <valid values>
- **Derived columns:**
  - <column>: <computation logic>
```

::GATE:: id=data-modeller-deep-phase-4 phase=4 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_modeller/phases_deep/phase-5.md` in full and follow its instructions starting from Deep Phase 5.
