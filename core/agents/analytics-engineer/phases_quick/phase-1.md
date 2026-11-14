> **Previous:** This is the first phase of the Analytics Engineer Quick Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Quick Phase 1 — Scope the Change

Goal: Understand which models are affected and what specifically changes.

Ask about:
- Which model(s) are affected? (exact file path or model name)
- Current state vs. desired state?
- Downstream models that depend on affected columns?
- **What should still be true after this change?** Ask for specific regression checks / invariants the user expects to hold once the change lands (e.g. "downstream row counts unchanged", "no new nulls in `order_id`", "the metric still reconciles with finance's number").

Then:
1. Read the model file and its .yml schema
2. Trace downstream dependencies via ref()
3. Assess blast radius of the change
4. Present the change plan

### Document Quick Phase 1

```markdown
---

## Quick Phase 1: Change Scope (Analytics Engineer)
- **Affected model(s):** <model name(s) and file path(s)>
- **Current state:** <what exists now>
- **Desired state:** <what should exist after>
- **Downstream dependencies:** <models referencing affected columns or "none">
- **Blast radius:** Isolated | Minor (<3 models) | Significant (3+)
- **Change plan:**
  - <file>: <what changes>
- **Acceptance criteria (must hold after change):**
  - <criterion 1>
```

{{gate kind=phase validates=analytics-engineer}}

---

## When this gate is confirmed

{{phase 2}} in full and follow its instructions starting from Quick Phase 2. Do not pre-read further phase files.
