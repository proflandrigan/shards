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

{{gate kind=phase phase=0 id=specific-instructions-analytics-engineer-quick-phases-phase0}}

---

## Quick Phase 2 — Implement and Validate

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

1. Implement the change in the model SQL and schema file
2. Update downstream models if column names or types changed
3. Run the stack's build/validate command to validate
4. **Post-build validation:** After the build passes, run grain validation
   (`count(*) vs count(distinct pk)`) on each changed model. For models with
   joins, run the fan-out check from `join_path_protocol.md` Tier 2+. Run
   `dbt show --select <model> --limit 5` to confirm output looks right.
   If any check fails, fix before proceeding. Skip if no-data environment.
5. Summarize what changed

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Quick Phase 2

```markdown
---

## Quick Phase 2: Implementation (Analytics Engineer)
- **Files changed:**
  - <file path>: <what changed>
- **Downstream updates:** <files updated or "none needed">
- **Validation result:** Pass | Fail — <details>
- **Tests passing:** <N> / <N>
- **Post-build validation:** PASS | FAIL | SKIPPED (no data) — <details>
- **Follow-up needed:** Yes / No — <if yes, describe>
- **Write-backs proposed:**
  - <title> → <knowledge job destination> (confirmed | declined | pending)
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

{{gate kind=final phase=0 id=specific-instructions-analytics-engineer-quick-phases-phase0-2}}

---

## Quick-to-Deep Escalation

If during Quick Phase 1 or Quick Phase 2 the scope grows beyond a quick change (e.g., blast radius is Significant, new models are needed, or the change requires a full redesign), escalate to the Deep track:

1. **Announce:** Tell the user exactly what triggered the escalation and why the Quick track can't handle it.
2. **Propose:** Recommend switching to the Deep track within the same Analytics Engineer session.
3. **Preserve context:** Write an `## Escalation Brief` section to `project-specs.md` following the format defined in [`protocols/behavioral_rules.md`](../../../protocols/behavioral_rules.md). Set the **Target agent** to `Analytics Engineer (Deep Track)`.
4. **Hand off:** Tell the user:

> "This has grown beyond a quick change — [specific trigger]. I recommend switching to the **Deep track** for a full pipeline design.
>
> I've written an Escalation Brief to `project-specs.md` so nothing is lost. I'll load the Deep track phases now and pick up from the brief."

After the user confirms, read [`modes/deep_phases.md`](deep_phases.md) in full and resume from Deep Phase 1, treating the Escalation Brief as prior context.

---
