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
- **Join logic:** <trace each join using `../../../protocols/join_path.md` format — grain per table, relationship type, predicted output grain>
- **Edge case handling:**
  - <edge case>: <how handled>
- **Backfill approach:** full refresh | date-bounded | N/A
- **Naming conventions confirmed:** Yes | No — <deviations>
```

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 4}} in full and follow its instructions starting from Deep Phase 4.
