> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Deep Phase 4 — Model Layer Architecture

Goal: Design the full DAG — every model, its layer, materialization, incremental
config, and key joins. No SQL yet, but the design is complete and confirmed.

Present as a text DAG in chat:
```
[source: system_a] → [stg_a_entities] → [int_a_enriched]
                                                 ↓
[source: system_b] → [stg_b_events]  → [int_ab_joined] → [fct_target_mart]
```

**If UI-Aware Mode is active**, also push the DAG as an interactive Mermaid diagram to the browser. Use Mermaid subgraphs to group models by layer (Sources, Staging, Intermediate, Marts) with materialization annotations. Use a stable `--panel-id` (e.g., `dag-<project_name>`) so the DAG can be updated in place during Phase 7:
```bash
node .shards/ui/ui-push.js dag \
  --title "DAG: <project_name>" \
  --agent "analytics-engineer" \
  --panel-id "dag-<project_name>" \
  --data '<mermaid_syntax_string>'
```

For each model: model name, layer, grain (confirmed in Phase 3), materialization
strategy, incremental config if applicable, key columns, key joins.

Ask about:
- Existing naming conventions to follow?
- Materialization preferences? (views for staging, tables/incremental for marts)
- Historical backfill needed?
- Macros to create or reuse?

Materialization guidance (state your reasoning, not just the choice):
- Staging: view (lightweight, always fresh, no storage cost)
- Intermediate: view unless large or expensive to compute — then table
- Mart: table or incremental; incremental when >10M rows or expensive recomputation
- Snapshots for SCD Type 2

### Document Deep Phase 4

```markdown
---

## Deep Phase 4: Model Layer Architecture (Analytics Engineer)
- **DAG:**
  ```
  <text DAG diagram>
  ```
- **Models to create/modify:**
  | Model | Layer | Grain | Materialization | New/Modified | File Path |
  |-------|-------|-------|-----------------|--------------|-----------|
  | <name> | staging | one per <x> | view | New | models/staging/<name>.sql |
  | <name> | intermediate | one per <x> per <y> | view | New | models/intermediate/<name>.sql |
  | <name> | marts | one per <x> | table | New | models/marts/<name>.sql |
- **Incremental strategy (if applicable):**
  - Model: <name>
  - Unique key: <column(s)>
  - Strategy: append | delete+insert | merge
  - On schema change: append_new_columns | fail | sync_all_columns
- **Key joins:**
  - <model A> JOIN <model B> on <key>: <cardinality — 1:M, 1:1>
- **Macros to create or reuse:**
  - <macro_name>: <purpose or "none">
- **Backfill approach:** full refresh | date-bounded — <details> | N/A
- **Naming conventions confirmed:** Yes | No — <deviations from project standard>
```

::GATE:: id=analytics-engineer-deep-phase-4 phase=4 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/analytics_engineer/phases_deep/phase-5.md` in full and follow its instructions starting from Deep Phase 5. Do not pre-read further phase files.
