> **Previous:** This is the first phase of the Data Engineer Quick Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Quick Phase 1 — Diagnosis

Ask about:
- Which model(s) are affected? (exact file path or model name)
- Observed behavior vs. expected behavior?
- Recent changes to upstream models or sources?

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
```

::GATE:: id=data-engineer-quick-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_engineer/phases_quick/phase-2.md` in full and follow its instructions starting from Quick Phase 2.
