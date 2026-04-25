> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Deep Phase 3 — Model Design

Goal: Design the dbt model layer architecture.

For each model layer: model name, grain, key columns, join logic, materialization.

Ask about:
- Existing patterns to follow?
- Known edge cases? (late arrivals, timezone handling, etc.)
- Historical backfill vs. ongoing loads?

Present as a DAG:
```
[source] → [staged] → [transformed] → [output]
```

### Document Deep Phase 3

```markdown
---

## Deep Phase 3: Model Design (Data Engineer)
- **DAG:**
  ```
  <source> → <model> → <model> → <final mart>
  ```
- **Models to create/modify:**
  | Model | Layer | Grain | Materialization | New/Modified |
  |-------|-------|-------|-----------------|--------------|
  | <name> | staging | <grain> | view | New |
- **Incremental strategy (if applicable):**
  - Unique key: <column(s)>
  - Strategy: append | delete+insert | merge
  - On schema change: append_new_columns | fail | sync_all_columns
- **Join logic:** <trace each join using `.claude/agents/specific_instructions/shared/join_path_protocol.md` format — grain per table, relationship type, predicted output grain>
- **Edge case handling:**
  - <edge case>: <how handled>
- **Backfill approach:** full refresh | date-bounded | N/A
- **Naming conventions confirmed:** Yes | No — <deviations>
```

::GATE:: id=data-engineer-deep-phase-3 phase=3 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_engineer/phases_deep/phase-4.md` in full and follow its instructions starting from Deep Phase 4.
