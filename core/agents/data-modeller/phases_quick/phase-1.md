> **Previous:** This is the first phase of the Data Modeller Quick Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Quick Phase 1 — Scope the Change

Ask about:
- Which model(s) and column(s) are affected?
- Current state vs. desired state?
- Downstream dependencies?
- **What should still be true after this change?** Ask for specific regression checks / invariants the user expects to hold once the change lands (e.g. "key uniqueness preserved", "no new nulls in `order_id`", "cardinality to `customers` unchanged").

Then:
1. Read the model file and its .yml schema
2. Trace downstream dependencies via ref()
3. Assess blast radius
4. Present the change plan

### Decompose the plan into tasks

Turn the plan just agreed into `data_models/<project_name>/tasks.yaml`: one task per affected model or column change. Each task needs an id, goal, `plan_ref` (the section of `project-specs.md` it implements), inputs, `owned_paths` (no overlap between tasks that can run in parallel), an acceptance command with the expected evidence, `depends_on`, `worker` (this agent), `phase` (2), and size (60 or less). With two or fewer tasks, set `delegate: inline` on them.
Validate the list with the tasks_set tool; the rules are in {{protocol delegated_build}}. Add the `### Task list` table to the Quick Phase 1 section of `project-specs.md` (see the template below) so the user approves plan and tasks together. The tasks are executed in Quick Phase 2.

### Document Quick Phase 1

Append to project-specs.md:

```markdown
---

## Quick Phase 1: Change Scope (Data Modeller)
- **Affected model(s):** <model name(s) and file path(s)>
- **Current state:** <what exists now>
- **Desired state:** <what should exist after>
- **Downstream dependencies:** <models that reference affected columns>
- **Blast radius:** Isolated | Minor (<3 models) | Significant (3+)
- **Change plan:**
  - <file>: <what changes>
- **Acceptance criteria (must hold after change):**
  - <criterion 1>

### Task list

| id | goal | owned paths | acceptance | depends_on |
|----|------|-------------|------------|------------|
| <task id> | <goal> | <owned paths> | <acceptance command and expected evidence> | <ids or none> |

- **Task count:** <N> — `data_models/<project_name>/tasks.yaml`
```

Before the gate, summarize the plan and state the task count and the path `data_models/<project_name>/tasks.yaml`, so the user confirms plan and task list together.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 2}} in full and follow its instructions starting from Quick Phase 2.
