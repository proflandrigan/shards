# Delegated Build

In build and execute phases the specialist stays in the main session as the **lead** and delegates each discrete task to a worker subagent (ADR 0009). The lead owns the plan, the gates and the conversation with you. Workers own only their task.

## Plan phase: the task list

Before the plan gate, the lead turns the agreed plan into `<output_dir>/tasks.yaml`. Each task has an `id`, `goal`, `plan_ref` (a section of `project-specs.md`), `inputs`, `owned_paths`, `acceptance` (`command` and `expected`), `depends_on`, `worker`, `size` (1 to 60 minutes) and optional `delegate: inline`.

- One task is one tested component.
- Tasks that can run in parallel must have disjoint `owned_paths`. Tasks that share a path are ordered with `depends_on`.
- No acceptance command, no task. At most 2 tasks per phase may be `inline` (the lead does them itself).
- `tasks_set` validates the list and refuses overlaps, cycles, unknown workers and missing acceptance.
- You approve plan and tasks together at the plan gate.

## Build phase: the lead loop

1. `tasks_set` loads the approved list.
2. `task_dispatch` hands each ready task to a worker, in parallel up to the thread cap. Each worker holds a lease on its owned paths.
3. The worker returns one result through `task_report`.
4. **Lead verification.** The lead re-runs the acceptance command or checks the evidence itself, then calls `task_verify`. That appends a row to the `## Validation` evidence table. A task is done only through `task_verify`, never on the worker's word.
5. A failed verification re-dispatches the task with the failure as feedback. After 2 retries the task is blocked and the lead asks you.
6. Deviations pause the dependent tasks and start plan drift handling (below).
7. Repeat for newly unblocked tasks. When all are verified, the lead runs the final integration checks and requests the phase gate with the evidence table.

Where parallel workers are unavailable, the lead works the same cards one at a time inline. Cards, checks and evidence rows are identical.

## Worker contract

A worker receives one task card and returns one JSON result: `status` (`done`, `failed`, `blocked`), `files_changed`, `check` (command, exit code, output excerpt), `deviations` and `open_questions`. Workers:

- write only inside `owned_paths` (lease-enforced for fan-out slices; see [Gate Pattern](gate-pattern.md));
- run the acceptance command themselves and never fabricate output;
- never call `gate_request`, change the plan, delegate or talk to the user;
- report anything that differs from `plan_ref` as a deviation instead of improvising.

## Plan drift

The plan (`project-specs.md`) and `tasks.yaml` change only after a confirmed amendment gate. When a worker reports deviations, the runtime pauses every task that transitively depends on it. The lead drafts the amendment and calls `gate_request` with `kind=phase` and `id=<agent>-amend-<n>`. After you confirm, it updates the plan and calls `tasks_set` with `amendment_gate=<id>`, then resumes the paused tasks. If you reject it, the original plan stands.

## Tools

`tasks_set`, `task_dispatch`, `task_report`, `task_status`, `task_verify`. `TASKS.md` is generated from `tasks.yaml` through the `tasks` job in `shards.config.yaml` (default: git binding).

## See also

- [Activation Modes](activation-modes.md)
- [Incremental Testing](incremental-testing.md)
- [Validation](validation.md)
- Source: `core/protocols/delegated_build.md`, `core/protocols/worker_contract.md`, `core/protocols/plan_drift.md`, `docs/delegation.md`
