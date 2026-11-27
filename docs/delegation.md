# Delegation (shards v2 runtime)

Developer notes for lead/worker delegation: the task manifest (`tasks.yaml`), the `task_*` tools, the path lease store, and the `{{delegate}}` macro. Describes what the code does today. Planned items are marked `TODO(E<n>)`.

## 1. Overview

A lead (the specialist agent running the phase) splits a phase's build work into tasks. Each non-inline task is handed to a worker subagent that owns a set of paths, runs one acceptance command, and returns one JSON result. Workers never hold gates, never change the plan, and never delegate (`core/protocols/worker_contract.md`). Verified review uses the same lease store with its own leads and verifiers, which may delegate one level down (section 3.2).

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
| `runtime/fanout/index.js` | Fan-out: `startFanout`, `claimSlice`, `mergeVerdicts`, `collectFanout`. |
| `runtime/review/index.js`, `runtime/tools/review_snapshot.js` | Review leases: run ids, slice caps, the review merge, `review_snapshot` (section 3.2). |
| `runtime/tools/fanout_start.js`, `fanout_claim.js`, `fanout_collect.js` | Tools `fanout_start`, `fanout_claim`, `fanout_collect` (section 3.1). |
| `hooks/pre-tool-use.js`, `hooks/lib/enforce.js`, `hooks/lib/writes.js` | PreToolUse hook: `fanout_claim` binding and write rules (section 3.1). |
| `runtime/server.js` | `startLeaseSweep`, the scheduled expiry sweep (`SHARDS_LEASE_SWEEP_MS`). |

## 2. tasks.yaml

Top level: `version: 1` and `tasks` (one or more). No other keys are allowed. Each task:

| Field | Required | Rules |
|-------|----------|-------|
| `id` | yes | `^[a-z][a-z0-9_-]*$`, unique. |
| `goal` | yes | Non-empty. |
| `plan_ref` | yes | Non-empty pointer into `project-specs.md`. |
| `inputs` | yes | String array (read-only context). |
| `owned_paths` | yes | Non-empty. Project-root-relative. No absolute paths, no `..`. |
| `acceptance` | yes | `{command, expected, cwd?}`; command and expected non-empty. `cwd` (project-root-relative, no `..`) is where the worker runs the command; default the project root. |
| `depends_on` | no | Task ids. Default `[]`. |
| `worker` | yes | Agent id. Must declare `fanout_worker` activation or a `consult_entries.worker` entry (unless `delegate: inline`). |
| `size` | yes | Integer 1 to 60 (minutes). |
| `phase` | no | String or integer. Groups tasks for the inline rule. |
| `delegate` | no | `inline` or `worker`. Default `worker`. |
| `ar` | no | `{run_id, branch?, iteration?, hypothesis?}`: marks an autonomous-research iteration card (issue #91 H4; see [`research.md`](research.md#fan-out-branch-runs-and-worktrees-h4)). Enables the AR outcome on `task_verify` and `tasks_set` `append`. |

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
| `tasks_set` | exactly one of `manifest` (object) or `path` (existing YAML file); optional `output_dir`, `amendment_gate`, `scope`, `append` | Validates and stores the manifest. Writes `<output_dir>/tasks.yaml` when given `manifest`. `output_dir` defaults to the active specialist frame's output directory. All tasks start `pending`. Mirrors `TASKS.md` (to `<scope>/TASKS.md` when `scope` is given; with `scope` and `manifest`, `output_dir` defaults to `scope`). |
| `task_dispatch` | `ids` (unique, min 1), `scope?` | Atomic. Every id must be `pending` or `failed`, not paused, with all `depends_on` in `reported` or `done`. Otherwise nothing is dispatched. Opens one lease per non-inline task. Returns one card per id (`entry_file` points the worker at `agents/<worker>/modes/worker.md`). Inline cards hold no lease. |
| `task_report` | `id`, `result` (task-result object), `scope?` | Task must be `dispatched`. Result is validated against the schema. Closes the task's lease. `done` is stored as `reported`; `failed` and `blocked` are stored as given. Runs the deviation hook (section 6). |
| `task_status` | `scope?` | Returns each task's status, worker, `depends_on`, `lease_id`, `attempts`, `paused_reason`, the `ready` list and status counts. |
| `task_verify` | `id`, `pass`, `expected`, `observed`, `notes?`, `check?`, `scope?`; AR cards: `ar_iteration?`, `metric_outcome?` (`green\|yellow\|red`), `kept?` | The lead's independent check (E12.5). Only a `reported` task can be verified. Section 4 gives the state rules. Appends an evidence row to `## Validation` in `<output_dir>/project-specs.md`. |

`scope` is optional on all five tools: a project-root-relative directory (no absolute path, no `..`; normalized, so `./shards/a/` equals `shards/a`). Omit it and everything behaves as a single session-wide manifest. State model: without `scope` the manifest, task statuses, drift state and consumed amendments live in the state entry `tasks`; with `scope` each scope has its own entry named `tasks-scope-<16 letters>`. The letters are the first 16 hex digits of the SHA-1 of the normalized scope with `0-9a-f` mapped to `a-p` (state names allow only `a-z` and `-`). Drift and amendment rules (section 7) apply per scope. Task ids may repeat across scopes. The TASKS.md mirror goes to `TASKS.md` unscoped (or the configured path) and to `<scope>/TASKS.md` when scoped; `task_verify` evidence goes to `project-specs.md` beside the scoped manifest. Leases opened by `task_dispatch` carry `meta.scope`. Amendment gates (`<agent>-amend-<n>`) are session-wide, so a pending amendment gate blocks `tasks_set` replacement in every scope until it is resolved.

### 3.0 Workstream leads under PM mode

When Syn's PM mode launches several workstream leads (specialist subagents) in parallel inside one session, each lead runs its own build loop over its own `<workstream dir>/tasks.yaml`. Each lead passes `scope=<workstream dir>` on every `tasks_set`, `task_dispatch`, `task_report`, `task_status` and `task_verify` call (the lead contract supplies the value). Parallel leads then keep separate manifests, task states and TASKS.md files and never replace or block each other's manifest. A lead outside PM mode omits `scope`.

On the content side, PM mode launches each workstream with `{{lead <agent>}}` (not `{{fanout}}`), and the launched specialist follows `core/protocols/lead_contract.md`: no gates, no user conversation, no scope change, every build phase through the delegated build loop with its own `<specialist>-worker` workers, and `scope` on every task call. Depth is fixed at Syn, then lead (depth 1), then workers (depth 2). A lead falls back to sequential or inline work only when workers genuinely cannot be spawned, and records a `Fallback:` row in its `## Validation` table and its report.

`tasks_set` refusal rules (all problems are listed in one error, nothing is stored):

- Schema violations, duplicate ids, self or unknown `depends_on`.
- Dependency cycles.
- Missing or empty `acceptance.command` or `acceptance.expected`.
- Unsafe `owned_paths`.
- Overlapping `owned_paths` between two tasks that are not ordered by `depends_on` (directly or transitively). Overlap means equal, or one path is a directory prefix of the other.
- `delegate: inline` in a phase that has more than 2 tasks.
- Unknown worker agent, or a worker without the worker entry.

`task_dispatch` refusal rules: unknown id, status other than `pending` or `failed` (so `blocked`, `dispatched`, `reported`, `done` and `paused` are refused), paused task, unmet dependency.

### 3.1 Fan-out tools (E5.9)

A fan-out is one `fanout`-owned lease over N worker slices, opened by the lead (`purpose` `fix`, the default). The same tools with `purpose: "review"` open a `review`-owned lease for verified review (section 3.2). It does not use `tasks.yaml`. Code: `runtime/fanout/index.js`.

| Tool | Input | Behaviour |
|------|-------|-----------|
| `fanout_start` | `agent`, `slices` (non-empty; each `{id, paths, acceptance}`), `ttl_ms?`, `purpose?` (`fix` default, or `review`), `run_id?` (required for `review`, refused for `fix`) | Opens one lease and returns `{lease_id, cards}`, one card per slice. `fix` needs `fanout_worker` activation; `review` needs `consult` or `fanout_worker` and has its own rules (section 3.2). |
| `fanout_claim` | `lease_id`, `slice_id` | A worker's first call. Returns that slice's card. The tool does not bind the worker; binding is done by the PreToolUse hook (below). |
| `fanout_collect` | `lease_id`, `results` (fix: one `{slice_id, verdict, summary?, findings?}` per slice; review: one `{slice_id, status, summary?, findings?}` per slice) | Merges the results, closes the lease, returns the merged result. Review shape in section 3.2. |

`fanout_start` refusals. Each is a thrown error and no lease is opened:

- The top frame of the session has a pending gate: `fanout_start refused: the active frame has a pending gate (<id>)`. The check uses `pendingForFrame`, which matches a gate of any kind.
- A gate owned by any frame on the stack is suspended: `fanout_start refused: a gate is suspended (<ids>)`. Resume and resolve it, or force-close it, first (S5F).
- Unknown agent, or the agent's `activation` does not include `fanout_worker` (`fix`) or `consult` or `fanout_worker` (`review`).
- `purpose` is not `fix` or `review`; `run_id` is missing for `review` or given for `fix`; or a review slice breaks the rules in section 3.2 (path outside `.shards/review/<run_id>/`, more than 4 slices in the call, or more than 16 for the run).
- `slices` is empty; a slice has no string `id`, a duplicate `id`, empty `acceptance`, or no `paths`.
- Two slices in the same call overlap (equal, or one is a directory prefix of the other). Paths are normalised by `normalizeRel`: project-root-relative, no absolute paths, no `..`. The overlap check covers only the slices of this call. A new fan-out is not checked against other active leases.

Slice card: `{lease_id, slice_id, owned_paths, acceptance, rules}`. `acceptance` is the slice's text as given. `rules` is the fixed string `no gates, no plan changes, no delegation, write only inside owned_paths, return verdict JSON` for fix leases, and the verifier rules (`review.RULES`, section 3.2) for review leases. The lease TTL is 900000 ms unless `ttl_ms` is given.

`fanout_claim` is refused when there is no active, unexpired `fanout` or `review` lease with that id, or the lease has no slice with that id. `fanout_collect` uses the same lookup, so an expired lease cannot be collected.

Binding (PreToolUse, `hooks/lib/enforce.js`). When a `fanout_claim` call carries an `agent_id` (Claude Code subagents), the hook binds that `agent_id` to `{lease_id, slice_id}` before the MCP tool runs. The binding is refused when the lease is not live, the slice does not exist, `agent_type` does not match the lease `worker_type` (matching rule in section 3.2), the agent is already bound to a different slice, the slice is already bound to a different agent, or the lease already has one bound worker per slice. Re-claiming the same slice with the same agent is accepted. A refused binding denies the call with `shards fanout_claim refused: <reason>`, unless `SHARDS_GATE_ENFORCE=0`, in which case the call proceeds unbound. A `fanout_claim` call with no `agent_id` is allowed and binds nothing.

Gap (TODO): the hook does not check the lease owner. `bindWorker` accepts `task` and `review` leases as well as `fanout` leases. The binding is recorded before the MCP tool runs, so a `fanout_claim` against a `task` lease binds in the hook, and the tool then refuses with "no active fanout lease".

`fanout_collect` requires exactly one result per slice. An unknown, duplicate or missing `slice_id`, or an invalid verdict, throws and nothing is closed. Merge rule for fix leases (`mergeVerdicts`, worst wins): any `BLOCKED` gives `BLOCKED`; otherwise any `NEEDS REVISION` gives `NEEDS REVISION`; otherwise `APPROVED`. The result is `{verdict, per_slice: {<slice_id>: {verdict, summary?, findings?}}}`. The lease is closed whatever the merged verdict is. Collect does not check which agent sent each result.

Heartbeat and expiry:

- A bound worker's heartbeat is `touchWorker`. It runs on every PreToolUse call from the bound `agent_id`, not only on writes. It sets `heartbeat_at` and `expires_at = now + ttl_ms`, at most once per `min(5 s, ttl/4)`. It does not bump the session version.
- `heartbeat(session, id)` in `runtime/leases` has no callers.
- Expiry has two triggers. The hook runs `expireStale` inline on a PreToolUse call when any active lease is past `expires_at`. The MCP server runs `startLeaseSweep` (`runtime/server.js`) every `SHARDS_LEASE_SWEEP_MS` ms, default 30000. Zero, a negative value or a non-number disables the timer. The sweep covers every session directory under `.shards/state/sessions/` that has a `leases.json`. The timer is `unref()`'d, and it runs only while the MCP server process is alive.
- `listActive` already excludes expired leases. A worker whose lease has expired loses its binding at once, and its later calls fall under rule 3.
- SubagentStop (`hooks/subagent-stop.js`, S5F) calls `releaseWorker`: the exiting worker's binding is removed at once (its slice can be re-claimed for a retry) and recorded under `released`. A task-owned lease (one slice, one worker) is closed outright. A fan-out or review lease stays open until `fanout_collect` or TTL expiry, because collect needs the active lease and the lead must not edit slice paths meanwhile. Idempotent; no output.

PreToolUse write rules (`hooks/lib/enforce.js`). They apply to non-gate tools. Write detection (`hooks/lib/writes.js`) covers `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `apply_patch`, the notebook-exec MCP tools, and Bash commands with redirects, `tee`, `sed -i`, `cp`, `mv`, `rm` and similar commands, `git` write subcommands, `dd of=`, `find -delete/-exec/-fprint`, `tar`/`unzip` extraction, `curl`/`wget` output, `rsync`/`scp`, and inline script writes. Targets are resolved against the payload `cwd`; a leading `~` or `~/` expands to the home directory, and `~user`, variables, globs, `eval`, `sh -c` and substitutions count as a write with an unknown target. `cd`/`pushd`/`popd` are not tracked, so a write after one is treated as unknown. Detection is best effort and nothing is executed. Enforcement runs only when the session has a `leases.json` or a `gates.json`.

1. Bound caller (`agent_id` bound to a slice of an active lease). Writes must resolve inside one of that slice's paths. Other writes are denied, and the reason lists the allowed paths. A write whose target cannot be determined is denied. Bound callers (fan-out workers and review verifiers) are exempt from the pending-gate check in rule 3 (policy: ADR 0011). Their exec calls (tests, scripts) are not checked against the slice, so rule 1 limits only write tools and detected shell writes.
2. `fanout_claim` binds (above). This runs even when a gate is pending.
3. Unbound caller (no `agent_id` bound to a lease: the lead or an unleased subagent). (a) If the top frame has a pending gate, every write or exec call is denied. (b) Otherwise a write whose target is inside, or contains, an active fan-out slice path is denied (`do not edit it from the lead`). Review slices do not count here, so the lead may write inside `.shards/review/`.

`SHARDS_GATE_ENFORCE=0` turns off every deny in rules 1 and 3 and the claim refusal. Binding still records when it succeeds.

Fail-open. An exception in the enforcement step is logged to `<root>/.shards/state/hook-errors.log`, and the call goes ahead. The hook exits 0 in all cases. One exception: an error while binding a `fanout_claim` (including a state I/O error) is turned into a deny, unless `SHARDS_GATE_ENFORCE=0`.

Codex. Codex 0.169.0 sends `agent_id` and `agent_type` on PreToolUse inside a subagent (live-verified payload, compat CX-6), and the hook fires (CX-7), so Codex workers bind through `fanout_claim` like Claude workers. The Codex binding path itself is unit-tested only; a live Codex fan-out run is still open.

### 3.2 Review leases and verifiers (verified review, ADR 0013)

Depth, on Claude Code (the host allows three levels):

```
main thread (Syn, or the active specialist)              depth 0
  -> <id>               review lead (general subagent)   depth 1  has Task
       -> <id>-verify   verifier                         depth 2  no Task
       -> <other>-service  cross-lens consult            depth 2  no Task
```

A lead is launched by `{{review_lead}}` (`build/MACROS.md` 3.16). It calls `fanout_start(purpose="review")` (at most 4 slices per call), launches one `<id>-verify` per card, then calls `fanout_collect`. Verifiers and consult entries never spawn.

Rules for `fanout_start(purpose="review")` (`runtime/review/index.js`, `runtime/fanout/index.js`):

- `run_id` matches `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, is required, and is stored in the lease `meta.run_id`.
- Every slice path must sit inside `.shards/review/<run_id>/`. At most 4 slices per call and 16 per `run_id` per session. Every review lease with that run id counts, open or closed, and the cap check runs under the state lock.
- Unlike fix fan-outs, a review slice is also checked against the slices of every other live review lease: a path that overlaps one (equal, or a directory prefix either way) is refused, so two verifiers never share a scratch dir. The check runs in the same guard as the cap.
- Review leases never restrict other callers. `findSliceOwning` and `isPathAllowed` skip them, so the lead can still write outside the scratch dirs. A bound verifier is confined to its slice like a worker.
- Binding uses `fanout_claim` as for workers. The `agent_type` matching rule (`typeAccepted` in `runtime/leases/index.js`): the lease `worker_type` is the agent id `X`; the accepted `agent_type` tail (last `:` segment, lower-cased) is `X`, or `X-worker` for fan-out and task leases, or `X-verify` for review leases. Any other tail is refused. An empty value on either side matches (Codex built-in roles).

`fanout_collect` for a review lease: `results` is one `{slice_id, status, summary?, findings?}` per slice, with `status` one of:

- **CONFIRMED**: the repro ran and its output shows the problem.
- **PLAUSIBLE**: not verified; the reason is given. Also used when code execution is not approved.
- **REFUTED**: the test showed no problem. Kept in `per_slice` for the record.

The result is `{verdict, counts, per_slice}`. `verdict` is `APPROVED` only when every finding is REFUTED; otherwise `NEEDS REVISION`. `BLOCKED` is never produced for review leases. Every slice needs exactly one result; an unknown, duplicate or missing `slice_id`, or an invalid status, throws and closes nothing. The lease is closed whatever the verdict.

Guardrails. These limit what the hook and the runtime can see. They are not a sandbox.

- **Code execution.** The brief carries `**Code execution:** approved — allowed commands: ...` or `not approved`. Enforcement is the verifier contract (`core/protocols/review_execution.md`), not the runtime. Verifiers have Bash, and the hook does not check what a command runs.
- **Scratch dirs.** A verifier writes only to `.shards/review/<run_id>/<slice_id>/`. The hook checks write tools and detected shell writes against the slice. It does not check exec calls, so a repro test can write anywhere the user account can.
- **Snapshot.** `review_snapshot` (`runtime/review/index.js`) records a sha256 per file under the given project-relative paths. `start` takes `paths` (`.` means the whole project; a path that does not exist is refused) and an optional `exclude` list (the caller's own output, reused by `check`) and writes `<session dir>/review-snapshots/<run_id>.json`. A second `start` for a run id that already has a baseline is refused, so the baseline cannot be reset mid-run. `check` re-hashes the same paths and returns `{clean, added, modified, deleted}`; it fails if there was no `start`. Symlinks are hashed by their target text and never followed. `.git`, `.shards`, `node_modules`, `venv`, `.venv`, `__pycache__` and `.pytest_cache` are skipped. The snapshot reports changes after the fact; it does not stop them.

Subagent MCP tools. A Claude subagent with a `tools:` list gets no `mcp__` tools unless they are listed (compat CC-7). The lists are built in `build/emit.js` from `build/host-tools.js` and prefixed `mcp__plugin_shards_shards__`:

| Subagent | Task | Shards MCP tools |
|---|---|---|
| `<id>` (general: lead for a specialist or reviewer) | yes, except Syn | `fanout_start`, `fanout_collect`, `tasks_set`, `task_dispatch`, `task_report`, `task_status`, `task_verify`, `load_phase`, `ar_iterate`, `ar_status`, `ar_defer`, `ar_end` |
| `syn` (general) | no | none |
| `<id>-worker` | no | `fanout_claim` |
| `<id>-verify` | no | `fanout_claim` |
| `<id>-review`, `-advise`, `-service`, `-final_review`, `-arbiter` | no | none |

`review_snapshot` is not in the lead's list (section 9). `core/protocols/review_panel.md` has the main-thread caller run `start` before dispatch and `check` after the leads return, so this is consistent today. Add it to the list if a lead must call it.

## 4. Task statuses

| Status | Meaning |
|--------|---------|
| `pending` | Not yet dispatched. Ready when its dependencies are satisfied and it is not paused. |
| `dispatched` | Lease open, worker running. |
| `reported` | Worker returned `done`. Satisfies dependencies. Not yet verified. |
| `done` | Satisfies dependencies. Set only by `task_verify` with `pass=true`. |
| `failed` | Worker returned `failed`, or `task_verify` failed the check (observed output kept as `feedback`). Can be re-dispatched. |
| `blocked` | Worker returned `blocked`, or `task_verify` failed the check after 2 retries (`escalated`). Cannot be dispatched by `task_dispatch` as written; the lead stops and asks the user. |
| `paused` | Set when a dependency deviated (section 6). Not dispatchable. Set by runtime only when the hook is wired (see section 9). |

`reported` means the lead must still verify. The lead re-runs the acceptance command itself and never accepts a result on the worker's word, then calls `task_verify` (E12.5). Verification semantics:

- `reported` + `pass=true` gives `done`. Feedback is cleared and dependents become ready.
- `reported` + `pass=false` gives `failed`, with the observed output stored as `feedback`. `task_dispatch` re-sends it to the worker. Up to 2 retries.
- A `pass=false` after 2 retries gives `blocked` with `escalated=true`. The lead stops and asks the user with a summary of the evidence rows.
- Every call, pass or fail, appends one row to the Evidence table in `## Validation` of `<output_dir>/project-specs.md`.
- **AR iteration cards** (`ar` set; issue #91, bug 22): the lead first calls `ar_iterate` (the runtime re-runs the pinned eval), then `task_verify` with `ar_iteration: N` (the outcome is read from the run; a contradicting `metric_outcome` or `kept` is refused) or with `metric_outcome` (plus `kept` for a YELLOW). The task becomes `done` with `ar_outcome: {metric_outcome, result: kept|reverted, iteration?, commit?}`: GREEN or kept YELLOW is `kept`, RED or unkept YELLOW is `reverted`. It never becomes `failed`, uses no retry and never escalates; AR's own stop conditions bound the loop. An AR card must be verified with these arguments (plain `pass` is refused), `ar_iteration` must match the card's own `ar.iteration` when it has one, and one iteration of a run/branch can back only one card. The evidence row notes `AR <OUTCOME>: <result>` and TASKS.md shows it. These arguments are refused on a card without `ar`.

`tasks_set` with `append: true` (AR iteration cards only) adds the cards in `manifest.tasks` to the registered manifest of that scope, keeping every existing task state, without an amendment gate: an AR lead learns each hypothesis only after the previous iteration. Every appended task must carry `ar`; the merged manifest is validated as a whole (so a card owning the same worktree paths as the previous one must depend on it); an open drift refuses it.

`TASKS.md` mirror: written by `mirrorTasksMd` through the `tasks` job in `shards.config.yaml` (default `{binding: git, options: {path: TASKS.md}}`). It is a checklist generated from `tasks.yaml` (a header says so). Done tasks are `[x]`; others are `[ ]` with their status in parentheses. Any other binding skips the mirror and returns a note.

## 5. Lease store

Leases are stored in state name `leases` as `{leases: {<id>: lease}}`. Every write goes through `StateStore.update`, so it is locked and atomic.

Lease: `{id, session, owner, worker_type, slices: [{id, paths}], meta, status, opened_at, heartbeat_at, expires_at, ttl_ms}`. Owners: `task`, `fanout`, `review`. Status: `active`, `closed`, `expired`. Default TTL is 900000 ms (15 minutes).

| Function | Behaviour |
|----------|-----------|
| `openLease(session, {owner, worker_type, slices, ttl_ms?, meta?})` | Validates and normalizes paths, stores an active lease, returns it. |
| `heartbeat(session, id)` | Extends `expires_at` by `ttl_ms`. Throws if unknown, not active, or expired. |
| `closeLease(session, id)` | Sets status `closed`. |
| `listActive(session, now?)` | Active leases with `expires_at` in the future. |
| `expireStale(session, now?)` | Marks active leases past `expires_at` as `expired`; returns their ids. |
| `bindWorker(session, {agentId, agentType, leaseId, sliceId})` | Binds an agent to one slice of an active lease. The hook calls it for `fanout_claim` (section 3.1). Does not bump the session version. |
| `findWorkerLease(session, agentId, now?)` | The active lease and slice bound to the agent, or `null`. |
| `touchWorker(session, agentId, now?)` | Refreshes a bound worker's lease, throttled (section 3.1). Returns `true` when it refreshed. |
| `findSliceOwning(session, filePath, now?)` | The active fan-out slice that contains, or is contained by, the path, or `null`. Used for unbound callers. |
| `isPathAllowed(session, agentId, filePath, now?)` | For a bound agent, checks the path against that worker's slice. Otherwise checks active fan-out and task leases whose `worker_type === agentId` (review leases are skipped). Returns `allowed: true` when neither applies. The hook calls it only for bound callers. |
| `pathsOverlap(a, b)`, `normalizeRel(p)` | Helpers. |

Callers in the runtime today:

- `task_dispatch` opens leases; `task_report` closes them.
- `fanout_start` opens `fanout` leases (`review` leases with `purpose: "review"`); `fanout_collect` closes them (sections 3.1, 3.2).
- `getLeasedPaths(session)` (`runtime/git/leases.js`) returns the paths of every `listActive` lease, review leases included. `commitGateLocked` in `runtime/git/index.js` excludes those paths from a gate commit.
- `expireStale` runs from the hook (inline) and from the MCP server sweep (section 3.1). `bindWorker`, `touchWorker`, `findWorkerLease`, `findSliceOwning` and `isPathAllowed` are called from `hooks/lib/enforce.js`. `heartbeat` has no callers. Worker heartbeats go through `touchWorker`.

Expired leases stop excluding paths because `listActive` filters on `expires_at`, even before `expireStale` runs.

### 5.1 Autonomous-research (AR) lease and git guard (issue #91)

An `[AR]` run holds one session-wide **AR lease** that makes its write scope and its git policy enforceable, not just prose. It lives in the same `leases` state with `owner: 'ar'`, `worker_type: 'ar'`, `slices: []` and an `ar` block `{run_id, project, mutable, immutable, allow}`. It has no slices, so `getLeasedPaths` never excludes the mutable code from gate commits and no worker can bind to it. At most one AR lease is active per session; the branch runs of one AR fan-out (same `run_id`, distinct `branch`) share it, with `ar.branches.<branch> = {root, mutable, immutable}` prefixed by each branch's worktree (`.shards/worktrees/<run>/<branch>`, see [`research.md`](research.md#fan-out-branch-runs-and-worktrees-h4)). For a branched lease the top-level `mutable` is the union of the branches' prefixed entries and `immutable` is the main-tree list plus every branch's prefixed list.

| Function (`runtime/leases`) | Behaviour |
|----------|-----------|
| `openArLease(session, {runId, project?, mutable, immutable?, allow?, ttl_ms?, meta?, branch?, workRoot?})` | `mutable` (required) and `immutable` are project-root-relative paths or globs (`*`, `**`, `?`); `allow` is extra paths or globs. `project` (the AR project/output dir) is added to `allow`. Default TTL 6 hours. Throws if another AR lease is active, unless `branch` is given and the active lease is a branched lease of the same `runId` (the branch joins it; a duplicate branch throws). `workRoot` is the branch worktree's root-relative path. |
| `closeArLease(session, idOrRunId, {branch?})` | Closes the matching active AR lease; returns it, or `null` if none matched. With `branch`, only that branch leaves; the lease stays active (and is returned with `status: 'active'`) while other branches remain. |
| `getActiveArLease(session, now?)` | The active AR lease, or `null`. `shards_status` reports it as `arLease`. |
| `touchArLease(session, now?)` | Hook keepalive: refreshes `expires_at` (throttled to once per minute, no version bump) on every enforced tool call. |
| `checkArWrite(session, lease, filePath)` | `{allowed, reason, rel}` for one write target. |

The `ar_start` / `ar_end` tools ([`research.md`](research.md)) call `openArLease` / `closeArLease`; `ar_status` with `resume: true` reopens it for a run rebuilt in a new session. While the lease is active, `hooks/lib/ar-guard.js` (called from `enforce.js` as rule 4, for every caller of the session: main thread and subagents) applies two checks. `SHARDS_GATE_ENFORCE=0` turns both off.

**Write scope.** For Write, Edit, MultiEdit, NotebookEdit, `apply_patch` and Bash writes:
- A target inside an `immutable` entry, or a directory that contains one (`rm -rf src` when `src/eval.py` is immutable), is denied. Immutable wins over `mutable` and `allow`.
- Otherwise a target is allowed inside `.shards/` (except `.shards/worktrees/`, which only a branch's prefixed `mutable` entries open), an `allow` entry (the project dir), a `mutable` entry, or the OS temp dir.
- Anything else is denied: other project files, paths outside the project root, and the project root itself.
- A write whose target can't be determined (`sh -c`, `eval`, `cd ... && ...`, `git apply`/`merge`/`stash`) is denied rather than asked, because an unattended run can't answer a prompt.
- Exec-only calls (`python train.py`, `pytest`, the eval command) and Shards notebook execution are not checked. A script can still write anywhere. Pinning hashes of the immutable paths (H1) is the backstop for that.

**Git guard.** Matching sees through `git -C dir` and `-c k=v`, env assignments and wrappers (`FOO=1`, `env`, `sudo`, `timeout`), chains (`&&`, `;`, `|`, newlines), subshells (`(git ...)`) and `$(...)` / backticks. Long options also match by any unambiguous prefix, as git accepts them (`--ha` is `--hard`). Denied:
- `git reset --hard`, `--soft`, `--keep` or `--merge`, and `git reset <commit>` (any reset that moves a ref). Unstaging stays allowed: `git reset`, `git reset HEAD`, `git reset -- <paths>`
- `git clean` with `-f` in any form (`-f`, `-fd`, `-xdf`, `--force`)
- `git push --force`, `-f`, `--force-with-lease[=...]`, `--force-if-includes` or a `+refspec`; `git push --delete`, `-d`, `:ref`, `--mirror` or `--prune`
- `git fetch <src>:<dst>` (updates a local ref)
- `git tag -d`, `--delete` or `-f`
- `git checkout -b`, `-B` (also with the name attached, `-bfoo`), `--orphan` or `--detach`
- `git switch` (any form)
- `git branch` in any form that creates, moves, copies, forces or re-tracks a branch (`git branch foo`, `-f`, `-m`/`-M`, `-c`/`-C`, `-u`, `-D`); listing (`--list`, `-a`, `-r`, `-v`, `--show-current`, `--contains`, ...) and a plain `-d` stay allowed
- `git commit --amend`, `git update-ref`, `git symbolic-ref <ref> <target>`, `git filter-branch`, `git filter-repo`, `git replace`, `git reflog expire`/`delete`, `git gc --prune`, `git prune`
- `git worktree add`, `remove`, `move`, `prune` or `repair` (AR branch worktrees are runtime-owned)

`git checkout-index` and `git read-tree -u`/`--reset` write the working tree with no checkable target, so the write-scope check denies them.

`git checkout` and `git restore` pathspecs must pass the write-scope check, so a revert is `git checkout <sha> -- <mutable paths>`. Without `--`, every operand is treated as a path: `git checkout main` is denied. Wildcard pathspecs and pathspecs after a `cd` are denied. Safe commands pass, for example `git status`, `git diff`, `git log`, `git add`, `git commit --only <paths>`, `git tag <name>`, `git read-tree` without `-u`, `git reset -- <paths>`, and a plain `git push`.

## 6. Task result and deviations

Schema (`core/schema/task-result.schema.json`): all five fields are required; the only optional key is `metric: {name, value}` (AR iteration cards: the metric the worker saw; informational, `ar_iterate` is the record).

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

Syntax: `{{delegate [tasks=<path>] [max_parallel=<n>] [mode=parallel|sequential|inline]}}`. All arguments are optional. `tasks` is a non-empty path hint (default `<output_dir>/tasks.yaml`). `max_parallel` is a positive integer cap on concurrent workers. `mode` selects the rendering: `parallel` (one worker per ready card, up to the cap), `sequential` (one ready card in flight at a time), `inline` (no worker handoff; the agent does each card itself under the same owned-path rule). Default per host: `parallel` for `claude` and `codex`, `sequential` for `skills` (no parallel guarantee on that host). Any other `mode` value is a build error. Example: `{{delegate tasks=shards/foo/tasks.yaml max_parallel=3 mode=sequential}}`.

The macro validates arguments only (`build/resolve.js`). It renders the build loop (`build/render.js`): `tasks_set`, then `task_dispatch` for ready tasks (up to the cap, or one at a time in `sequential`/`inline`), hand each card to a worker, `task_report` each result, verify each acceptance check with `task_verify`, dispatch what is unblocked. A task is done only through `task_verify`. Deviations stop dependent tasks and follow plan_drift. The phase gate is raised only when every task is done. Host fallbacks (parallel, then sequential, then inline) are stated in the rendered text; see `docs/compat.md` (Delegate host fallbacks, E12.8).

Tool names are prefixed per target (see `build/MACROS.md` section 5).

## 8.1 Codex limits: `max_depth` and `max_threads` (E8.6)

Both keys are docs-only and UNVERIFIED (`docs/compat.md` CX-4): one source says `agents.max_depth` defaults to 1 and `agents.max_threads` to 6; the fetched page names the thread limit `agents.max_concurrent_threads_per_session` (`max_threads` as legacy alias) and does not mention `max_depth`.

| Use | Recommendation | Why |
|-----|----------------|-----|
| Review lead and its verifiers (section 3.2) | `agents.max_depth = 2` | the lead is a subagent (depth 1) and its `<id>-verify` helpers are depth 2. With depth 1 the lead cannot spawn verifiers: it leaves findings PLAUSIBLE or verifies inline, and says so. |
| Consult (specialist asks Syn or a reviewer) | `agents.max_depth = 2` | main thread (0) spawns the specialist's consult at depth 1 only if the specialist runs in the main thread; a specialist that runs as a subagent and consults needs depth 2. With depth 1 the consult is blocked: flatten it (ask the reviewer from the main thread). |
| Fan-out (`fanout_start`, `{{fanout}}`, `{{delegate}}`) | `agents.max_threads = 4` (or the plan's `max_parallel` if lower) | workers are leaf subagents; width, not depth, is the limit. Excess slices queue or run sequentially. |

The Codex build emits these as commented lines in `.codex/config.toml` (`# [agents]`, `# max_depth = 2`, `# max_threads = 4`); uncomment the keys your Codex version accepts. The generated `AGENTS.md` fragment (`shards install --agents-md`) repeats the requirement. Under PM mode the chain is Syn, then a workstream lead (depth 1), then its workers (depth 2), so the lead needs `agents.max_depth = 2`. Workers never delegate, so depth beyond 2 is never needed.

## 9. Not done yet

| Item | Status |
|------|--------|
| Write enforcement of owned paths for fan-out slices | Done (section 3.1, rules 1 and 3). |
| Write enforcement of owned paths for task-owned leases | Not done. The hook binds only through `fanout_claim`, and `task_dispatch` workers have no claim tool. `TODO`. |
| `fanout_claim` binding does not check the lease owner | Gap (section 3.1). `TODO`. |
| SubagentStop and leases | Wired (S5F). `hooks/subagent-stop.js` releases the exiting worker's binding. Codex 0.169.0 sends `agent_id` on SubagentStop and on PreToolUse inside a subagent (CX-6, live-verified payloads), so release works there too; a live Codex fan-out run is not done. |
| PM 2-workstream live run | OPEN. The live-run budget is not spent. Harness: `scripts/pm-fanout-live-run.sh` (one sample, never a pass rate; `--dry-run` and `--check-only` modes). |
| Lead verification of `reported` tasks | Done (E12.5): `task_verify` tool (section 3). Only `done` satisfies dependencies; each verification appends an evidence row to `## Validation` in `<output_dir>/project-specs.md`; max 2 retries, then `blocked` and escalated. |
| Host fallbacks (E12.8) | Done: see `docs/compat.md` (Delegate host fallbacks). |
| Delegated-build golden harness (E12.9) | Built: `test/golden/delegated-build/` (`run.sh`, `score.js`, `dry-run.js`, `fixture/`); only the dry-run (synthetic state through the real tools) was run, no live `claude -p` sample. |
| 3/3 runs per host | OPEN. The live-run budget is not spent. |
| Codex and other hosts | OPEN (external). `TODO(owner: proflandrigan)`. |
| Auto-pause on deviation and amendment refusal in `tasks_set` | Done (E12.6): `runtime/tasks/drift.js`, covered by `test/tasks-drift.test.js`. |
| Phase rewrites for delegated build | Done (E12.3/E12.4): build phases are lead loops over `<output_dir>/tasks.yaml` (`core/protocols/delegated_build.md`); planning phases decompose the plan into tasks. `core/protocols/incremental_testing.md` is folded in as the task evidence guide (checkpoint gates removed). Guarded by `test/delegated-build.test.js` and the `write_whole_build` coupling metric. |
| `review_snapshot` is not in the review lead's MCP tool list | OPEN. `build/emit.js` `GENERAL_MCP_TOOLS` omits it, and a subagent with a `tools:` list gets no Shards tools unless listed. Consistent with `review_panel.md` today (the main thread runs `start` and `check`). Add it to the list if a lead must call it. |
| Review verifiers are not sandboxed | Guardrails only: the snapshot and the scratch dirs (section 3.2). Test processes are not confined by the hook. |
| Subagent generation for workers | The `worker` entry is validated but no subagent is generated. `TODO(E5.3)`. |
| Lease heartbeats and stale sweeps for fan-out | Done (section 3.1): `touchWorker` on bound-worker PreToolUse calls, inline expiry in the hook, and the server sweep (`SHARDS_LEASE_SWEEP_MS`). `heartbeat()` has no caller. Task leases get no heartbeat but are still expired by the sweep. |
