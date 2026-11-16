> **Previous:** This is the first phase of the Data Engineer Quick Track.
> **Next:** phase-2.md (read only after this phase's gate is confirmed)

---

## Quick Phase 1 — Diagnosis

Ask about:
- Which model(s) are affected? (exact file path or model name)
- Observed behavior vs. expected behavior?
- Recent changes to upstream models or sources?
- **What should still be true after this fix?** Ask for specific regression checks / invariants the user expects to hold once the fix lands (e.g. "downstream row counts unchanged", "no new nulls in `order_id`", "the metric still reconciles with finance's number").

Then:
1. Read the model file and its .yml schema
2. Trace upstream dependencies via ref() and source()
3. Identify root cause
4. State root cause and proposed fix clearly

### Decompose the plan into tasks

Turn the plan just agreed into `models/<project_name>/tasks.yaml`: one task per affected model or fix. Each task needs an id, goal, `plan_ref` (the section of `project-specs.md` it implements), inputs, `owned_paths` (no overlap between tasks that can run in parallel), an acceptance command with the expected evidence, `depends_on`, `worker` (this agent), `phase` (2), and size (60 or less). With two or fewer tasks, set `delegate: inline` on them.
Validate the list with the tasks_set tool; the rules are in {{protocol delegated_build}}. Add the `### Task list` table to the Quick Phase 1 section of `project-specs.md` (see the template below) so the user approves plan and tasks together. The tasks are executed in Quick Phase 2.

### Document Quick Phase 1

```markdown
---

## Quick Phase 1: Diagnosis (Data Engineer)
- **Affected model(s):** <model name(s) and file path(s)>
- **Observed behavior:** <what's happening>
- **Expected behavior:** <what should happen>
- **Root cause:** <what's wrong and why>
- **Proposed fix:** <what will be changed>
- **Upstream impact:** <models affected or "none">
- **Downstream impact:** <models or consumers affected>
- **Acceptance criteria (must hold after fix):**
  - <criterion 1>

### Task list

| id | goal | owned paths | acceptance | depends_on |
|----|------|-------------|------------|------------|
| <task id> | <goal> | <owned paths> | <acceptance command and expected evidence> | <ids or none> |

- **Task count:** <N> — `models/<project_name>/tasks.yaml`
```

Before the gate, summarize the plan and state the task count and the path `models/<project_name>/tasks.yaml`, so the user confirms plan and task list together.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 2}} in full and follow its instructions starting from Quick Phase 2.
