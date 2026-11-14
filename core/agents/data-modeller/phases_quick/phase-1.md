> **Previous:** This is the first phase of the Data Modeller Quick Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Quick Phase 1 — Scope the Change

Ask about:
- Which model(s) and column(s) are affected?
- Current state vs. desired state?
- Downstream dependencies?
- **What should still be true after this change?** Ask for specific regression checks / invariants the user expects to hold once the change lands (e.g. "key uniqueness preserved", "no new nulls in `order_id`", "cardinality to `customers` unchanged").

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
- **Acceptance criteria (must hold after change):**
  - <criterion 1>
```

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 2}} in full and follow its instructions starting from Quick Phase 2.
