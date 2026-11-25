---
name: delegated-build
description: Shared protocol — decompose the plan into a task list, then run the build as a lead loop that dispatches, verifies and records each task
type: reference
---

# Delegated Build Protocol

A build or execute phase is a loop run by the lead (the specialist agent). The plan phase before it turns the agreed plan into a task list. The build phase dispatches those tasks, verifies each result itself and records evidence. The lead owns the plan; workers own only their task (`{{protocol worker_contract}}`).

## Task list format

The task list is `<output_dir>/tasks.yaml` (the agent's own output directory). Top level: `version: 1` and `tasks`. Each task has `id`, `goal`, `plan_ref` (a section of `project-specs.md`), `inputs` (read-only context), `owned_paths`, `acceptance` (`command` and `expected`), `depends_on`, `worker` (the specialist's own agent id), `size` (minutes, 1 to 60), optional `phase` and optional `delegate` (`inline` or `worker`).

```yaml
version: 1
tasks:
  - id: stg-orders
    goal: Staging model for orders with its tests
    plan_ref: project-specs.md#phase-6-component-specifications
    inputs: [shards/shop/project-specs.md]
    owned_paths: [models/staging/stg_orders.sql]   # a confirmed Placement target
    acceptance:
      command: dbt build --select stg_orders
      expected: all tests pass, row count equals source
    depends_on: []
    worker: analytics-engineer
    size: 20
    phase: 6
```

## Decompose the plan into tasks (plan phase)

Before the plan gate, turn the plan just agreed into the task list.

- One task is one tested component: the smallest unit whose correctness can be checked on its own (see `{{protocol incremental_testing}}`).
- Tasks that can run in parallel must have disjoint `owned_paths`. Tasks that touch the same path must be ordered with `depends_on`.
- Every task has an acceptance command and the evidence it should produce. No acceptance, no task.
- Keep `size` at 60 or less. Split larger components.
- At most 2 tasks in a phase may use `delegate: inline` (the lead does them itself).
- Validate with the `tasks_set` tool. It refuses overlaps, cycles, unknown workers and missing acceptance. Fix every listed problem.
- Add a `### Task list` table (id, goal, owned paths, acceptance, depends_on) to the phase's section of `project-specs.md`. {{record.write section="Task list"}} The user approves plan and tasks together at the plan gate; the gate summary names the task count and the `tasks.yaml` path.
- For the Jira tasks binding, keep implementation steps in the scoped local task list and record their existing Jira issue reference when available. The coordinating agent handles authorized Jira comments through the binding. For other bindings, once the plan gate is confirmed, mirror each task to the bound task tracker (for the default git binding this keeps `TASKS.md` in step with `tasks.yaml`). For each task: {{tasks.create title="<task goal>" owns="<owned_paths>" accept="<acceptance command>"}}

## Lead loop (build phase)

1. Load the task list approved at the plan gate and call `tasks_set`.
2. Call `task_dispatch` for every ready task (dependencies satisfied), in parallel up to the thread cap.
3. Each worker returns one result through `task_report`.
4. LEAD VERIFICATION. A task counts only after the lead has checked it. Re-run the acceptance command (or check the evidence independently), compare the outcome with the `plan_ref` section, and record a per-task evidence row in the `## Validation` Evidence table of `project-specs.md` (Check = task id and component, Expected, Observed, Pass/Fail). Record the outcome with `task_verify` (pass or fail, with expected and observed); it appends the evidence row. A task becomes done only through `task_verify`, never on the worker's word. For the Jira binding, return verified evidence to the coordinating agent. For other bindings, after a passing `task_verify`, mirror the status to the tracker. {{tasks.update id="<task id>" status=done}}
5. On a failed `task_verify`, re-dispatch with the failure output as feedback (the card carries it). Allow at most 2 retries; then the task is blocked and escalated: stop and ask the user, with a summary of what failed.
6. Deviations or a plan that cannot be met: pause the dependent tasks and follow `{{protocol plan_drift}}`. The plan and `tasks.yaml` change only through a confirmed gate.
7. Dispatch the tasks that the verified tasks have unblocked. Repeat from step 2.
8. The lead is the orchestrator. It writes no build code itself, except for tasks marked `delegate: inline` (at most 2 per phase). Everything else goes to its own workers.

When all tasks are verified, run the final integration checks (for example Restart and Run All, or the full project build). Only then request the phase gate, with the evidence table as its evidence. See `{{protocol validation}}`.

## Leads under PM mode

When Syn's PM mode launched you as a workstream lead, `{{protocol lead_contract}}` also applies: pass `scope=<workstream dir>` on every task tool call, and never call `gate_request`. Where this protocol says to request a gate or stop and ask the user, record the decision in `project-specs.md` or return `BLOCKED` to Syn instead.

## Sequential or inline fallback

Use a fallback only when worker subagents genuinely cannot be spawned on the host. Convenience is not a reason. In that case the lead works through the same task cards one at a time (sequential, or inline in its own session). Name the reason in the report to your caller and add a `Fallback: <sequential|inline> — <reason>` row to the `## Validation` Evidence table of `project-specs.md`. Never fall back silently. The cards, acceptance checks, `task_verify` calls and evidence rows are identical, and verification still means running the acceptance command and recording the observed result before the next task starts.
