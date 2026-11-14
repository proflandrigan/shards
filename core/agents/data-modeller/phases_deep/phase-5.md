> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Deep Phase 5 — Physical Design Decisions

Goal: Map logical model to dbt implementation decisions.

For each entity: dbt layer, materialization, incremental strategy (if applicable),
SCD approach, model file naming.

Ask about:
- Expected row counts and growth rate
- Query patterns (dashboards, ad-hoc, downstream models)
- Performance constraints

### Document Deep Phase 5

```markdown
---

## Deep Phase 5: Physical Design (Data Modeller)
- **Logical → physical mapping:**
  | Entity | dbt Model Name | Layer | Materialization | Notes |
  |--------|---------------|-------|-----------------|-------|
  | <entity> | <name> | mart | table | |
- **Incremental configs (if applicable):**
  - <model>: unique_key=<col>, strategy=<merge|delete+insert|append>
- **SCD handling:**
  - <model>: <snapshot strategy or "N/A">
- **Expected scale:**
  - <model>: ~<N> rows, growing ~<N>/day
- **Performance constraints:** <SLA or "none">
```

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 6}} in full and follow its instructions starting from Deep Phase 6.
