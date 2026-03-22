# Analytics Engineer — Quick Track

Quick Track (Phases 1-2) for the Analytics Engineer.
Phase 0 (Triage) is already complete. Follow every phase, gate, and documentation rule below.

---

## Quick Phase 1 — Scope the Change

Goal: Understand which models are affected and what specifically changes.

Ask about:
- Which model(s) are affected? (exact file path or model name)
- Current state vs. desired state?
- Downstream models that depend on affected columns?

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
```

**GATE: Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.**

---

## Quick Phase 2 — Implement and Validate

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

1. Implement the change in the model SQL and schema file
2. Update downstream models if column names or types changed
3. Run the stack's build/validate command to validate
4. Summarize what changed

### Document Quick Phase 2

```markdown
---

## Quick Phase 2: Implementation (Analytics Engineer)
- **Files changed:**
  - <file path>: <what changed>
- **Downstream updates:** <files updated or "none needed">
- **Validation result:** Pass | Fail — <details>
- **Tests passing:** <N> / <N>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Status:** Complete
```

Update specs header status to `Complete`.

**GATE: Read this section back to the user. Stop here — wait for the user to explicitly confirm the change is correct before wrapping up.**

---
