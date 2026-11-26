> **Previous:** phase-2.md confirmed
> **Next:** phase-4.md (read only after this phase's gate is confirmed)

---

## Deep Phase 3 — Model Design

Goal: Design the source and staging layers and the pipeline that loads them.
Everything above staging is out of scope on this track: the core entity model
(dimensions, facts, bridges, snapshots) is the Data Modeller's, and intermediate,
consumer mart and metrics models are the Analytics Engineer's. Both build on
your staging layer.

For each model: model name, grain, key columns, join logic (if any), materialization.

Ask about:
- Existing patterns to follow?
- Known edge cases? (late arrivals, timezone handling, etc.)
- Historical backfill vs. ongoing loads?

Present as a DAG:
```
[source] → [staged] → (Data Modeller: core entity model; Analytics Engineer: intermediate → consumer marts)
```

### Document Deep Phase 3

```markdown
---

## Deep Phase 3: Model Design (Data Engineer)
- **DAG:**
  ```
  <source> → <staging model> → (downstream consumer)
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
