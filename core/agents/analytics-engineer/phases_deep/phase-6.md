> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Deep Phase 6 — Documentation Plan

Goal: Every model and non-obvious column gets a description.

Ask about:
- Documentation level? (minimal: model descriptions only; standard: model + key columns;
  thorough: all columns + business context)
- Existing documentation patterns in the project?
- Columns with non-obvious business definitions that need explanation?
- Business metrics or calculated fields that need formal definitions?

### Decompose the plan into tasks

Turn the plan just agreed into `shards/<project_name>/tasks.yaml`: one task per model (with its tests and docs) or per layer slice. Each task needs an id, goal, `plan_ref` (the section of `project-specs.md` it implements), inputs, `owned_paths` (no overlap between tasks that can run in parallel), an acceptance command with the expected evidence, `depends_on`, `worker` (this agent), `phase` (7), and size (60 or less).
Validate the list with the tasks_set tool; the rules are in {{protocol delegated_build}}. Add the `### Task list` table to the Deep Phase 6 section of `project-specs.md` (see the template below) so the user approves plan and tasks together. The tasks are executed in Deep Phase 7.

**Placement:** propose where each deliverable lands in a `## Placement` section of `project-specs.md`, and pass those paths as `targets` on this phase's `gate_request` so the user confirms them with the plan ({{protocol placement}}).

### Document Deep Phase 6

```markdown
---

## Deep Phase 6: Documentation Plan (Analytics Engineer)
- **Documentation level:** Minimal | Standard | Thorough
- **Schema file(s) to create/update:**
  - <file path>
- **Model descriptions:**
  - <model>: <1-2 sentence description — what it represents, who consumes it>
- **Key column descriptions:**
  - <model>.<column>: <description — especially for non-obvious columns>
- **Business metric definitions:**
  - <metric_name>: <definition — e.g., "gross_revenue: sum of order amounts before
    refunds, in USD, at time of capture">
  - (or "none — no metrics layer in scope")
- **External documentation:** <wiki, README, or "none">

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

{{phase 7}} in full and follow its instructions starting from Deep Phase 7. Do not pre-read further phase files.
