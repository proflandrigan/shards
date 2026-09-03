> **Previous:** This is the first phase of the Data Modeller Deep Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Deep Phase 1 — Business Discovery

Goal: Deepen understanding of what the user is building and what the model must represent — driven by their intent, not a checklist.

Follow the depth probe pattern from `.claude/agents/specific_instructions/shared/intent_discovery.md` (Phase 1 — Depth Probe).

Reference what the user said in Phase 0. Open with a question like:

"Tell me more about [specific thing they mentioned] — how does this domain work day-to-day?"

Let the conversation flow. Surface these topics naturally when the user's responses lead there:
- **Consumer(s):** analysts, dashboards, ML pipelines, reverse ETL
- **Domain boundaries:** what business process this represents, existing vs greenfield
- **Key business rules:** entity relationships, cardinalities, source-of-truth systems
- **Edge cases / unknowns:** ask "What edge cases or unknowns are you aware of in this domain?"
- **Acceptance criteria:** steer toward model-level invariants — key uniqueness, cardinalities, referential integrity, grain. Ask "In your world, what needs to be true for this model to be correct?" Example (modelling recommender-effectiveness data): "one row per user-experiment assignment", "every impression references a valid user", "a user maps to exactly one variant", "CTR is derivable from clicks/impressions with no divide-by-zero".
- **Where to look:** existing models, source docs, stakeholders to consult

### Document Deep Phase 1

```markdown
---

## Deep Phase 1: Business Context (Data Modeller)
- **Domain:** <the business area being modeled>
- **Consumer(s):** <who uses this and how>
- **Key questions this model answers:**
  - <question 1>
  - <question 2>
- **Edge cases / unknowns:** <domain-specific edge cases surfaced>
- **Where to look:** <additional context sources identified>
- **Existing models in this domain:** <list or "none — greenfield">
- **Key business rules:**
  - <rule 1>
  - <rule 2>
- **Source of truth:** <system or "reconciliation needed">
- **Acceptance criteria (invariants that must hold):**
  - <criterion 1 — e.g. one row per user-experiment assignment>
  - <criterion 2 — e.g. every impression references a valid user>
- **How each will be verified:** <walkthrough / structural check per criterion, or "confirmed in validation">
```

::GATE:: id=data-modeller-deep-phase-1 phase=1 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_modeller/phases_deep/phase-2.md` in full and follow its instructions starting from Deep Phase 2.
