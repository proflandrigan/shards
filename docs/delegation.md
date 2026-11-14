# Delegation (shards v2 runtime)

Developer notes for lead/worker delegation: the task manifest (`tasks.yaml`), the `task_*` tools, the path lease store, and the `{{delegate}}` macro. Describes what the code does today. Planned items are marked `TODO(E<n>)`.

## 1. Overview

A lead (the specialist agent running the phase) splits a phase's build work into tasks. Each non-inline task is handed to a worker subagent that owns a set of paths, runs one acceptance command, and returns one JSON result. Workers never hold gates, never change the plan, and never delegate (`core/protocols/worker_contract.md`).

The lead owns the plan. A worker's `deviations` do not change anything by themselves; the lead follows `core/protocols/plan_drift.md`.

| File | Role |
|------|------|
| `core/schema/tasks.schema.json` | Manifest schema (`<output_dir>/tasks.yaml`). |
| `core/schema/task-result.schema.json` | Worker result schema. |
| `core/protocols/worker_contract.md` | Worker rules and result format. |
| `core/protocols/plan_drift.md` | Lead-side amendment procedure. |
| `runtime/tasks/index.js` | Manifest validation, per-session task state, `TASKS.md` mirror. |
| `runtime/tools/tasks_set.js` | Tool `tasks_set`. |
| `runtime/tools/task_dispatch.js` | Tool `task_dispatch`. |
| `runtime/tools/task_report.js` | Tool `task_report`. |
| `runtime/tools/task_status.js` | Tool `task_status`. |
| `runtime/leases/index.js` | Path lease store. |
| `runtime/git/leases.js` | `getLeasedPaths`, used to exclude leased paths from gate commits. |

## 2. tasks.yaml

Top level: `version: 1` and `tasks` (one or more). No other keys are allowed. Each task:

| Field | Required | Rules |
|-------|----------|-------|
| `id` | yes | `^[a-z][a-z0-9_-]*$`, unique. |
| `goal` | yes | Non-empty. |
| `plan_ref` | yes | Non-empty pointer into `project-specs.md`. |
| `inputs` | yes | String array (read-only context). |
| `owned_paths` | yes | Non-empty. Project-root-relative. No absolute paths, no `..`. |
| `acceptance` | yes | `{command, expected}`, both non-empty. |
| `depends_on` | no | Task ids. Default `[]`. |
| `worker` | yes | Agent id. Must declare `fanout_worker` activation or a `consult_entries.worker` entry (unless `delegate: inline`). |
| `size` | yes | Integer 1 to 60 (minutes). |
| `phase` | no | String or integer. Groups tasks for the inline rule. |
| `delegate` | no | `inline` or `worker`. Default `worker`. |

```yaml
version: 1
tasks:
  - id: features
    goal: Build the feature query for churn
    plan_ref: project-specs.md#phase-2-features
    inputs: [models/churn/schema.sql]
    owned_paths: [models/churn/features.py]
    acceptance:
      command: python -m pytest tests/test_features.py -q
      expected: exit 0
    worker: ml-engineer
    size: 20
    phase: 2
  - id: features-tests
    goal: Add feature null-handling tests
    plan_ref: project-specs.md#phase-2-features
    inputs: [models/churn/features.py]
    owned_paths: [tests/test_features.py]
    depends_on: [features]
    acceptance:
      command: python -m pytest tests/test_features.py -q
      expected: exit 0
    worker: ml-engineer
    size: 10
    phase: 2
```

## 3. Tools

| Tool | Input | Behaviour |
|------|-------|-----------|
| `tasks_set` | exactly one of `manifest` (object) or `path` (existing YAML file); optional `output_dir` | Validates and stores the manifest. Writes `<output_dir>/tasks.yaml` when given `manifest`. `output_dir` defaults to the active specialist frame's output directory. All tasks start `pending`. Mirrors `TASKS.md`. |
| `task_dispatch` | `ids` (unique, min 1) | Atomic. Every id must be `pending` or `failed`, not paused, with all `depends_on` in `reported` or `done`. Otherwise nothing is dispatched. Opens one lease per non-inline task. Returns one card per id (`entry_file` points the worker at `agents/<worker>/modes/worker.md`). Inline cards hold no lease. |
| `task_report` | `id`, `result` (task-result object) | Task must be `dispatched`. Result is validated against the schema. Closes the task's lease. `done` is stored as `reported`; `failed` and `blocked` are stored as given. Runs the deviation hook (section 6). |
| `task_status` | none | Returns each task's status, worker, `depends_on`, `lease_id`, `attempts`, `paused_reason`, the `ready` list and status counts. |

`tasks_set` refusal rules (all problems are listed in one error, nothing is stored):

- Schema violations, duplicate ids, self or unknown `depends_on`.
- Dependency cycles.
- Missing or empty `acceptance.command` or `acceptance.expected`.
- Unsafe `owned_paths`.
- Overlapping `owned_paths` between two tasks that are not ordered by `depends_on` (directly or transitively). Overlap means equal, or one path is a directory prefix of the other.
- `delegate: inline` in a phase that has more than 2 tasks.
- Unknown worker agent, or a worker without the worker entry.

`task_dispatch` refusal rules: unknown id, status other than `pending` or `failed` (so `blocked`, `dispatched`, `reported`, `done` and `paused` are refused), paused task, unmet dependency.

## 4. Task statuses

| Status | Meaning |
|--------|---------|
| `pending` | Not yet dispatched. Ready when its dependencies are satisfied and it is not paused. |
| `dispatched` | Lease open, worker running. |
| `reported` | Worker returned `done`. Satisfies dependencies. Not yet verified. |
| `done` | Satisfies dependencies. No tool in `runtime/tools/` currently sets it. |
| `failed` | Worker returned `failed`. Can be re-dispatched. |
| `blocked` | Worker returned `blocked`. Cannot be dispatched by `task_dispatch` as written. |
| `paused` | Set when a dependency deviated (section 6). Not dispatchable. Set by runtime only when the hook is wired (see section 9). |

`reported` means the lead must still verify. The lead re-runs the acceptance command itself and never accepts a result on the worker's word. The lead verification step is `TODO(E12.5)`; no tool records it today.

`TASKS.md` mirror: written by `mirrorTasksMd` through the `tasks` job in `shards.config.yaml` (default `{binding: git, options: {path: TASKS.md}}`). It is a checklist generated from `tasks.yaml` (a header says so). Done tasks are `[x]`; others are `[ ]` with their status in parentheses. Any other binding skips the mirror and returns a note.

## 5. Lease store

Leases are stored in state name `leases` as `{leases: {<id>: lease}}`. Every write goes through `StateStore.update`, so it is locked and atomic.

Lease: `{id, session, owner, worker_type, slices: [{id, paths}], meta, status, opened_at, heartbeat_at, expires_at, ttl_ms}`. Owners: `task`, `fanout`. Status: `active`, `closed`, `expired`. Default TTL is 900000 ms (15 minutes).

| Function | Behaviour |
|----------|-----------|
| `openLease(session, {owner, worker_type, slices, ttl_ms?, meta?})` | Validates and normalizes paths, stores an active lease, returns it. |
| `heartbeat(session, id)` | Extends `expires_at` by `ttl_ms`. Throws if unknown, not active, or expired. |
| `closeLease(session, id)` | Sets status `closed`. |
| `listActive(session, now?)` | Active leases with `expires_at` in the future. |
| `expireStale(session, now?)` | Marks active leases past `expires_at` as `expired`; returns their ids. |
| `isPathAllowed(session, agentId, filePath, now?)` | Checks a path against the slices of active leases for `worker_type === agentId`. Returns `allowed: true` when that agent has no active lease. |
| `pathsOverlap(a, b)`, `normalizeRel(p)` | Helpers. |

Callers in the runtime today:

- `task_dispatch` opens leases; `task_report` closes them.
- `getLeasedPaths(session)` (`runtime/git/leases.js`) returns the paths of `listActive` leases. `commitGateLocked` in `runtime/git/index.js` excludes those paths from a gate commit.
- `isPathAllowed`, `heartbeat` and `expireStale` have no callers outside the lease module. Owned-path write enforcement is `TODO(E5.9/E11.6)`. Heartbeats and stale sweeps are not scheduled.

Expired leases stop excluding paths because `listActive` filters on `expires_at`, even before `expireStale` runs.

## 6. Task result and deviations

Schema (`core/schema/task-result.schema.json`): all five fields are required; no other keys.

| Field | Type |
|-------|------|
| `status` | `done` \| `failed` \| `blocked` |
| `files_changed` | string[] |
| `check` | `{command: string, exit_code: integer, output_excerpt: string}` |
| `deviations` | string[] (each non-empty) |
| `open_questions` | string[] |

```json
{
  "status": "done",
  "files_changed": ["models/churn/features.py"],
  "check": {"command": "python -m pytest tests/test_features.py -q", "exit_code": 0, "output_excerpt": "12 passed in 0.8s"},
  "deviations": [],
  "open_questions": []
}
```

`task_report` returns the deviations and open questions in its text. It calls `onDeviations(session, id, result)` in `runtime/tasks/index.js`.

## 7. Plan drift

The rule (`core/protocols/plan_drift.md`): the plan (`project-specs.md`) and the manifest change only after a confirmed amendment gate. Deviations alone change nothing.

Procedure as documented:

1. Dependents of a deviating task are auto-paused (transitively).
2. The lead drafts the amendment and raises `gate_request` with `kind=phase`, `id=<agent>-amend-<n>`, `phase=<current>`.
3. After the user confirms, the lead updates `project-specs.md` and calls `tasks_set` with the revised manifest and `amendment_gate=<gate id>`.
4. `tasks_set` refuses a replacement while an amendment gate is pending, or after a deviation without a confirmed amendment gate. The lead then resumes or redispatches the paused tasks.

Current implementation: `runtime/tasks/drift.js` is installed as the default hooks. `task_report` with non-empty `deviations` pauses pending/dispatched transitive dependents and records `drift.open`; it opens no gate. `tasks_set` accepts `amendment_gate` and refuses replacement while an `-amend-<n>` gate is pending, or, after drift or once any task has left `pending`, unless the named gate is confirmed and not yet consumed.

## 8. `{{delegate}}` macro

Syntax: `{{delegate [tasks=<path>] [max_parallel=<n>]}}`. Both arguments are optional. `tasks` is a non-empty path hint (default `<output_dir>/tasks.yaml`). `max_parallel` is a positive integer cap on concurrent workers. Example: `{{delegate tasks=data_models/foo/tasks.yaml max_parallel=3}}`.

The macro validates arguments only (`build/resolve.js`). It renders the build loop (`build/render.js`): `tasks_set`, then `task_dispatch` for ready tasks up to the cap, hand each card to a worker, `task_report` each result, verify each acceptance check, dispatch what is unblocked. Deviations stop dependent tasks and follow plan_drift. The phase gate is raised only when every task is done.

Tool names are prefixed per target (see `build/MACROS.md` section 5).

## 9. Not done yet

| Item | Status |
|------|--------|
| Write enforcement of owned paths | `isPathAllowed` exists with no caller. `TODO(E5.9/E11.6)`. |
| Lead verification of `reported` tasks | Not recorded by any tool. `TODO(E12.5)`. |
| Auto-pause on deviation and amendment refusal in `tasks_set` | Done (E12.6): `runtime/tasks/drift.js`, covered by `test/tasks-drift.test.js`. |
| Phase rewrites for delegated build | `TODO(E12.3/E12.4)`. |
| Subagent generation for workers | The `worker` entry is validated but no subagent is generated. `TODO(E5.3)`. |
| Lease heartbeats and stale sweeps | Functions exist; no scheduler calls them. |
