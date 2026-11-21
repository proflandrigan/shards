> **Previous:** phase-4.md confirmed
> **Next:** phase-6.md (read only after this phase's gate is confirmed)

---

## Deep Phase 5 — Documentation Plan

Goal: Document every model and column for downstream consumers.

Ask about:
- Documentation level? (minimal, standard, thorough)
- Existing documentation patterns?
- Columns needing business-context descriptions?

### Decompose the plan into tasks

Turn the plan just agreed into `shards/<project_name>/tasks.yaml`: one task per model (with its tests and docs) or per pipeline step. Each task needs an id, goal, `plan_ref` (the section of `project-specs.md` it implements), inputs, `owned_paths` (no overlap between tasks that can run in parallel), an acceptance command with the expected evidence, `depends_on`, `worker` (this agent), `phase` (6), and size (60 or less).
Validate the list with the tasks_set tool; the rules are in {{protocol delegated_build}}. Add the `### Task list` table to the Deep Phase 5 section of `project-specs.md` (see the template below) so the user approves plan and tasks together. The tasks are executed in Deep Phase 6.

**Placement:** propose where each deliverable lands in a `## Placement` section of `project-specs.md`, and pass those paths as `targets` on this phase's `gate_request` so the user confirms them with the plan ({{protocol placement}}).

### Document Deep Phase 5

```markdown
---

## Deep Phase 5: Documentation Plan (Data Engineer)
- **Documentation level:** Minimal | Standard | Thorough
- **Schema file(s):**
  - <file path>
- **Model descriptions:**
  - <model>: <1-2 sentence description>
- **Key column descriptions:**
  - <model>.<column>: <description>
- **Business context notes:** <columns needing extra context>
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

{{phase 6}} in full and follow its instructions starting from Deep Phase 6.
