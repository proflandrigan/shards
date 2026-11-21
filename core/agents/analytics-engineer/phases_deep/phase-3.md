> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Deep Phase 3 — Grain and Entity Design

Goal: Define the grain of every model in the planned DAG, and validate entity
relationships before writing a single CTE.

"What does one row represent?" must be answered for every model before Phase 4.

Ask about:
- Confirmed grain for the target mart (from Phase 1 — verify it's still right)
- Grain for each intermediate model needed
- Many-to-many relationships that need bridge models?
- Fan-out risks from any planned joins?
- Conformed dimensions already in use elsewhere?

**Consult Data Modeller for grain confirmation and entity design:**

Tell the user: "Pulling in the Data Modeller — I need grain and entity validation before I commit to a model design."

{{consult data-modeller entry=review task="Grain and entity validation for [project] transformation design"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Analytics Engineer shard designing a transformation pipeline
for [project]. I've identified the following planned models with their intended
grains:

[list each planned model with intended grain statement]

Business requirements context:
- Consumer(s): [from Phase 1]
- Key business questions: [from Phase 1]
- Required mart grain: [from Phase 1]
- Source staging models: [from Phase 2]

Please review and return:
1. Is the proposed grain correct for each model? Are there grain violations I
   haven't anticipated?
2. Are there many-to-many relationship risks in the planned joins that could
   cause fan-out? Which joins are highest risk?
3. Are there conformed dimensions already in the project I should use instead
   of defining new ones?
4. Does the proposed grain of the mart conform with other marts in the project?
   Any conformance conflicts?
5. Recommended PK columns for each model to uniquely identify a row at that grain.

Keep your response focused on grain correctness, M:M risks, entity conformance,
and PK recommendations — not the physical SQL design.
```

Apply the Reviewer Verdict Protocol (see shared protocol — `data-modeller` row).

### Document Deep Phase 3

```markdown
---

## Deep Phase 3: Grain and Entity Design (Analytics Engineer)
- **Confirmed model grains:**
  | Model | Layer | Grain Statement | PK Column(s) |
  |-------|-------|-----------------|--------------|
  | <model> | staging | one row per <source_event_id> | <source_event_id> |
  | <model> | intermediate | one row per <entity> per <period> | <surrogate_key> |
  | <model> | mart | one row per <entity> | <entity_id> |
- **Many-to-many relationship risks identified:**
  - <risk or "none">
- **Conformed dimensions in use:**
  - <dimension model>: <shared across which marts>
  - (or "none — new grain only")
- **Data Modeller consultation:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Tier: Proceed | Proceed with caveats | Halt
  - Grain assessment: <summary>
  - Fan-out risks flagged: <list or "none">
  - Conformance notes: <list or "none">
  - **Grain design revised:** Yes / No — <if yes, what changed>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
```

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Deep Phase 4. Do not pre-read further phase files.
