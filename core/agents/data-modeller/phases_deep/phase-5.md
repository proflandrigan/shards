> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Deep Phase 5 — Physical Design Decisions

Goal: Map logical model to dbt implementation decisions for the core entity
model (dimensions, facts, bridges, snapshots). Staging it reads is the Data
Engineer's; consumer marts on top of it are the Analytics Engineer's.

For each entity: dbt layer, materialization, incremental strategy (if applicable),
SCD approach, model file naming.

Ask about:
- Expected row counts and growth rate
- Query patterns (dashboards, ad-hoc, downstream models)
- Performance constraints

### Decompose the plan into tasks

Turn the plan just agreed into `shards/<project_name>/tasks.yaml`: one task per model file (with its tests). Each task needs an id, goal, `plan_ref` (the section of `project-specs.md` it implements), inputs, `owned_paths` (no overlap between tasks that can run in parallel), an acceptance command with the expected evidence, `depends_on`, `worker` (this agent), `phase` (6), and size (60 or less).
Validate the list with the tasks_set tool; the rules are in {{protocol delegated_build}}. Add the `### Task list` table to the Deep Phase 5 section of `project-specs.md` (see the template below) so the user approves plan and tasks together. The tasks are executed in Deep Phase 6.

**Placement:** propose where each deliverable lands in a `## Placement` section of `project-specs.md`, and pass those paths as `targets` on this phase's `gate_request` so the user confirms them with the plan ({{protocol placement}}).

### Document Deep Phase 5

```markdown
---

## Deep Phase 5: Physical Design (Data Modeller)
- **Logical → physical mapping:**
  | Entity | dbt Model Name | Layer | Materialization | Notes |
  |--------|---------------|-------|-----------------|-------|
  | <entity> | <name> | dimension \| fact \| bridge \| snapshot | table | |
- **Incremental configs (if applicable):**
  - <model>: unique_key=<col>, strategy=<merge|delete+insert|append>
- **SCD handling:**
  - <model>: <snapshot strategy or "N/A">
- **Expected scale:**
  - <model>: ~<N> rows, growing ~<N>/day
- **Performance constraints:** <SLA or "none">

### Task list

| id | goal | owned paths | acceptance | depends_on |
|----|------|-------------|------------|------------|
| <task id> | <goal> | <owned paths> | <acceptance command and expected evidence> | <ids or none> |

- **Task count:** <N> — `shards/<project_name>/tasks.yaml`
```

Before the gate, summarize the plan and state the task count and the path `shards/<project_name>/tasks.yaml`, so the user confirms plan and task list together.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 6}} in full and follow its instructions starting from Deep Phase 6.
