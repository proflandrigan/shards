> **Previous:** This is the first phase of the Data Engineer Quick Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Quick Phase 1 — Diagnosis

Ask about:
- Which model(s) are affected? (exact file path or model name)
- Observed behavior vs. expected behavior?
- Recent changes to upstream models or sources?
- **What should still be true after this fix?** Ask for specific regression checks / invariants the user expects to hold once the fix lands (e.g. "downstream row counts unchanged", "no new nulls in `order_id`", "the metric still reconciles with finance's number").

Then:
1. Read the model file and its .yml schema
2. Trace upstream dependencies via ref() and source()
3. Identify root cause
4. State root cause and proposed fix clearly

### Document Quick Phase 1

```markdown
---

## Quick Phase 1: Diagnosis (Data Engineer)
- **Affected model(s):** <model name(s) and file path(s)>
- **Observed behavior:** <what's happening>
- **Expected behavior:** <what should happen>
- **Root cause:** <what's wrong and why>
- **Proposed fix:** <what will be changed>
- **Upstream impact:** <models affected or "none">
- **Downstream impact:** <models or consumers affected>
- **Acceptance criteria (must hold after fix):**
  - <criterion 1>
```

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 2}} in full and follow its instructions starting from Quick Phase 2.
