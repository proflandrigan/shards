# Gates (shards v2 runtime)

Developer notes for the gate subsystem: `runtime/gates/`, the `gate_request` tool, the interim operator CLI, and the gate-commit path in `runtime/git/`. Describes what the code does today. Planned items are marked `TODO(E<n>)` or `TODO(owner: proflandrigan)`.

## 1. Overview

A gate is a human checkpoint at the end of a phase. The agent asks for one with `gate_request`. Only a human can confirm it. The agent has no confirm tool (D8). Confirming an advancing gate triggers a git commit of the agent's output directory (section 6).

| File | Role |
|------|------|
| `runtime/tools/gate_request.js` | MCP tool `gate_request`. Opens or reopens a gate on the top frame. Validates the record when `validates` is set. |
| `core/schema/gate-request.schema.json` | Input schema for `gate_request`. |
| `runtime/gates/machine.js` | State machine: `requestGate`, `confirmGate`, `suspendGate` and `resumeGate` (internal), `getGate`, `listGates`, `pendingForFrame`. `runtime/gates/index.js` re-exports it. |
| `runtime/git/index.js` | Gate commits: `commitGate`, `replayPending`, `listPending`, `gitState`, `gateRef`, `makeDenyMatcher`. |
| `runtime/git/leases.js` | `getLeasedPaths()` stub. Always returns `[]` (E5.9). |
| `runtime/lib/validation.js` | Parses the last `## Validation` section for `validates`. |
| `cli/commands/gates.js` | Interim operator CLI: `gates status`, `gates confirm` (section 7). |
| `runtime/state/store.js` | Locked, atomic writes of the session state. |

What is wired today: `gate_request` opens gates, and `gates confirm` confirms them. The confirm path runs the git commit. Only those two write `gates.json`. The `return` tool and the status header read it (`pendingGatesFor` in `runtime/stack.js`). Hooks do not enforce gates (section 8).

## 2. Gate entry schema

Stored at `<root>/.shards/state/sessions/<sessionKey>/gates.json` as `{gates: {<id>: Entry}}`. Every write goes through `StateStore.update('gates', fn)`, which takes the state lock and bumps the session `version`.

| Field | Set by | Notes |
|-------|--------|-------|
| `id` | `gate_request` | Schema pattern `^[A-Za-z0-9][A-Za-z0-9._-]*$`, max 128 characters. |
| `status` | machine | `pending`, `confirmed`, `changes_requested`, `suspended`. |
| `kind` | `gate_request` | One of the six kinds (section 4). |
| `phase` | `gate_request` | Schema allows an integer, or a string `N` or `N-M`. Pure digit strings are stored as numbers. Otherwise `frame.phase`, or `null`. |
| `track` | machine | `frame.track` or `null`. `gate_request` does not pass a track. |
| `project` | machine | `frame.project` or `null`. `gate_request` does not pass a project. |
| `agent` | machine | `frame.agent`. |
| `frame` | machine | `frame.id` of the switched-in frame that owns the gate. |
| `summary` | `gate_request` | Required by the tool, max 2000 characters. |
| `record_ref` | `gate_request` | Project-relative path, `#anchor` allowed. The file is only checked when `validates` is set. |
| `validates` | `gate_request` | String checklist name matching the schema pattern. Stored as given. The machine does not validate it. |
| `requested_at`, `updated_at` | machine | ISO timestamps. |
| `decided_at`, `decision` | `confirmGate` | `decision` is `confirmed` or `changes_requested`. |
| `note` | `confirmGate` | Set only when a note is given (`--changes`). |
| `proof` | `confirmGate`, suspend, resume | Object with a non-empty string `tier`. Interim CLI writes `{tier, user, ts}`. |
| `commit` | `confirmGate` | Section 6. |
| `suspended_from` | `suspendGate` | Present only while suspended. |
| `history` | machine | `[{ts, from, to, by?}]`. `by` is `proof.tier`, set only on suspend and resume. |

## 3. State machine

| From | Action | To | Notes |
|------|--------|----|-------|
| (none) | `requestGate`, new id | `pending` | `result: opened`. |
| `pending` | `requestGate`, same id | `pending` | `result: already_pending`. `summary` and `record_ref` are updated when given. |
| `changes_requested` | `requestGate`, same id | `pending` | `result: reopened`. `requested_at` resets. `summary` and `record_ref` are replaced when given. |
| `pending` | `confirmGate`, `confirmed` | `confirmed` | Runs the commit (section 6). |
| `pending` | `confirmGate`, `changes_requested` | `changes_requested` | `note` stored. No commit. |
| `pending` | `suspendGate` (internal) | `suspended` | Requires `proof`. |
| `suspended` | `resumeGate` (internal) | `pending` | Requires `proof`. `suspended_from` is removed. |
| `confirmed` | anything | (terminal) | See idempotency below. |

Rules enforced in code:

- **Idempotency.** `requestGate` on a confirmed id returns `already_confirmed` and changes nothing. A repeat `confirmGate` with `confirmed` on a confirmed gate returns `already_confirmed` and does not commit again.
- **One open gate per frame.** `requestGate` throws if the frame already has another gate in `pending` or `suspended`. The error names it. A `changes_requested` gate does not count, so a second gate can open on that frame.
- **Suspended gates block their id.** `requestGate` on a suspended id throws `gate <id> is suspended; resume it first`.
- **Invalid transitions throw.** `confirmGate` on an unknown id, or on a gate that is not `pending` (other than the confirmed repeat above), throws.
- **Proof is shape-checked only.** `requireProof` checks that `proof` is an object with a non-empty string `tier`. The tier is not verified. `TODO(E11.3-E11.5)`.
- **Suspend and resume have no callers.** They are internal functions with no tool or CLI exposure. `TODO(E5.5)`.

## 4. Kinds

| Kind | Advances phase | On confirm | Notes |
|------|----------------|------------|-------|
| `phase` | yes | commits | Intermediate phase gate. |
| `final` | yes | commits | Last phase of a track. |
| `execute` | yes | commits | Experiment or Autonomous Research iteration completed. |
| `handoff` | yes | commits | Specialist-to-specialist transition. |
| `checkpoint` | no | no commit | `commit` is `{outcome: skipped, reason: non_advancing_kind}`. |
| `confirm` | no | no commit | Same as `checkpoint`. |

`ADVANCING_KINDS` in `machine.js` is `phase, final, execute, handoff`. Unknown kinds are rejected. The `gate_request` schema enum rejects them as a tool error, and `requestGate` throws `Unknown gate kind`. The runtime does not normalize unknown kinds to `phase`.

The runtime does not read `SHARDS_GATE_ENFORCE` or `SHARDS_CHECKPOINT_ENFORCE`. `TODO(E11.6)`.

## 5. `gate_request` tool

Input (from `core/schema/gate-request.schema.json`, `additionalProperties: false`):

| Field | Required | Type |
|-------|----------|------|
| `id` | yes | string, see section 2 |
| `kind` | yes | enum of the six kinds |
| `phase` | yes | integer `>= 0`, or string `N` or `N-M` |
| `summary` | yes | string, 1 to 2000 characters |
| `record_ref` | yes | string |
| `validates` | no | string checklist name |

Refusals (tool errors, gate not opened):

- No resolved session.
- No frame on the stack: `gate_request refused: no active frame ... Activate an agent with mode=switch first.` Consult workers never hold gates.
- `validates` set and the record is missing, outside the project root, or fails validation. The record must be inside the project root, and the error names the checklist as `<validates>/validation_checklist.md`.

Only the last `## Validation` section of the record is checked. `checkValidation` returns a list of coded errors, and each is printed with its description from `ERROR_DESCRIPTIONS`. The positive path (a valid record) has not been exercised in a smoke test. Read by code only.

Response: a text block holding the prose, followed by a JSON block. The JSON is in `text`, not a `data` field.

| `result` | Meaning | Data fields |
|----------|---------|-------------|
| `opened` | New gate | `gate_id, kind, phase, status: pending, frame, copy_queue: [], confirm: {milestone: 'A', how}` |
| `reopened` | `changes_requested` gate is pending again | Same as `opened`. The earlier note is included in the prose. |
| `already_pending` | Gate is still pending | Same as `opened`. |
| `already_confirmed` | Gate is confirmed | `gate_id, kind, phase, status: confirmed, commit`. The prose is `Gate <id> already confirmed (<sha7> or commit_pending), continue.` When the commit is still in progress, the text reads `commit in progress`. |

The prose for a pending gate says to stop and wait, and gives the interim `gates confirm` command. Calls that open, reopen or find a pending gate also run a best-effort `replayPending`, so pending commits can replay here. An `already_confirmed` reply returns before the replay runs.

`copy_queue` is always `[]`. `TODO(E6.8)`.

## 6. Git outcomes

### 6.1 Pipeline

`commitGate` (`runtime/git/index.js`) runs under the pending lock:

1. **Collect.** `git ls-files -co --exclude-standard -z -- <outputDirs>` inside a repo, or a filesystem walk outside one. Output directories come from the agent's `output_dir` with `{project}` substituted. Agents with `output_dir: null` return `skipped: no_output_dirs`.
2. **Filter.** Drops `.git`, leased paths, denylisted paths, directories, and files over `max_file_size_bytes`. Keeps tracked files missing from disk as deletions.
3. **Diff.** Hashes the files and diffs them against HEAD. Keeps only changed entries. None changed means `skipped: nothing_to_commit`.
4. **Snapshot.** Writes a commit object (parent = HEAD) to `refs/shards/pending/<gate>` through a temporary index.
5. **Commit.** Normal path or plumbing path (section 6.3).
6. **Finish.** On success the snapshot ref and pending record are deleted. On failure both are kept.

### 6.2 Collection rules

- `.gitignore` applies to untracked files only. Tracked files are included even when `.gitignore` matches them. Checked with `git ls-files -co --exclude-standard`.
- The commit covers the full diff of each output directory against HEAD, not only the files written during this gate.
- Denylist and size limits apply to tracked and untracked files. A tracked file excluded by these rules is left alone, not deleted.
- `.shards/` is excluded only through the output directory. No collector rule excludes it by name. Current output directories (`analysis/`, `studies/`, `models/`, `data_models/`, `services/`, `research/`, `dashboards/`) never cover the root.
- Leases: `leases.getLeasedPaths(session)` always returns `[]` until E5.9. `commitGate` accepts a `getLeasedPaths` override. `machine.js` does not pass one, so the module function is used. Tests stub the module function.

### 6.3 Commit paths

| Path | When | How |
|------|------|-----|
| Normal | Working tree equals the snapshot for every changed path | Untracked changed files are `git add`ed. The index is backed up and restored on failure. Then `git commit --only --pathspec-from-file` of only the changed paths. Runs `pre-commit` and `commit-msg`. |
| Plumbing | Working tree has moved on (replay of an older gate, or user edits) | Builds the commit from snapshot blobs on a temporary index seeded from HEAD. Runs `git hook run --ignore-missing pre-commit`, or the hook file. Moves HEAD with `update-ref HEAD <new> <old>`. Refreshes the user's real index only for paths whose index entry still equals the old HEAD entry. Runs `pre-commit` only. |

Both paths use:

- Message subject `shards gate <gate-id>`, with trailers `Shards-Gate: <gate-id>` and `Shards-Agent: <agent or unknown>`.
- Author and committer `Shards <shards@localhost>` only when `user.name` or `user.email` is unset. Both fallback identities are then set.
- `GIT_TERMINAL_PROMPT=0`, `GIT_EDITOR=true`, `GIT_LITERAL_PATHSPECS=1`, `GIT_OPTIONAL_LOCKS=0`.
- A hook timeout of `hookTimeoutMs` (default 30 s). Timeout sends SIGTERM, then SIGKILL after 1.5 s.

### 6.4 Outcomes on the gate entry

`confirmGate` stores the `commit` object on the entry:

| `outcome` | Fields | When |
|-----------|--------|------|
| `committed` | `sha`, `files` | Commit created. |
| `skipped` | `reason`, `files: []` | `nothing_to_commit`, `no_output_dirs`, or `non_advancing_kind` (no git call). |
| `commit_pending` | `reason`, `snapshot_ref`, `files`, `pending: true` | Snapshot kept. Replays later. The gate is still confirmed. |
| `in_progress` | none | Transient, set at confirm time before the commit runs. |

If `commitGate` throws, `confirmGate` stores `commit_pending` with `reason: commit_error: <message>`. No pending record is written for that gate (section 8).

### 6.5 Pending store

`<root>/.shards/state/git-pending.json` (project-level, not per session), written atomically. Lock target `.shards/state/git-pending.lock` (proper-lockfile, stale 10 s, up to 600 retries). A corrupt file throws and is never overwritten.

```
{ "version": 1, "next_seq": <n>, "records": { "<gate>": Record } }
```

Record fields: `gate, agent, seq, session, snapshot_ref, files, tries, next_try_at (epoch ms), status (pending|stuck|done), reason, created_at`. A record that reaches `done` is deleted, not kept.

Snapshot refs are `refs/shards/pending/<gate>`. Characters outside `[A-Za-z0-9._-]` become `_`. If anything changed, the name gets a `-<8 hex>` sha1 suffix.

### 6.6 Ordering, retries and backoff

- Records replay in ascending `seq`. A gate commit replays older records first, before its own attempt. Each `confirmGate` replays all pending records first, on a best-effort basis.
- The first record that is not `done` becomes a blocker. Later records are skipped with `blocked_by_<gate>`, so gate N never lands before N-1.
- Counted failures are `hook_failed`, `hook_timeout` and `commit_failed` (the `git commit` step). Backoff is 60 s, 300 s, 900 s, 3600 s. The fifth counted failure sets `status: stuck`.
- Precondition waits (`no_repo`, `detached_head`, merge/rebase/cherry-pick/revert in progress, `signing_required`, `commit_disabled`, `head_moved`) retry every 60 s and are not counted.
- A `stuck` record blocks every later gate commit in that project. Nothing clears it. `replayPending(..., {force: true})` retries it, but no production caller passes `force`, and no CLI command exposes it. `TODO(owner: proflandrigan)`.
- Replay at session end and from `doctor` is not implemented. `TODO(owner: proflandrigan)`.

### 6.7 Fallbacks

| Condition | `reason` | Snapshot and record | Recovery |
|-----------|----------|---------------------|----------|
| No git repository | `no_repo` | Record kept with files. No snapshot. | Next replay after `git init`. |
| Detached HEAD | `detached_head` | Kept | Check out a branch. |
| Merge, rebase, cherry-pick or revert in progress | `merge_in_progress`, `rebase_in_progress`, `cherry_pick_in_progress`, `revert_in_progress` | Kept | Finish or abort the operation. |
| `commit.gpgsign=true` | `signing_required` | Kept | Not handled. The runtime never attempts a signed commit. |
| `git.commit: false` | `commit_disabled` | Kept | Set `git.commit` to true. |
| Pre-commit hook fails or times out | `hook_failed: <line>` or `hook_timeout` | Kept. Counted. | Fix the hook. Backoff, then `stuck` after 5. |
| `git commit` fails | `commit_failed: <line>` | Kept. Counted. | Fix the cause. |
| `git add` of untracked files fails | `commit_failed: <line>` | Kept. Not counted. Index restored. | Fix the cause. |
| HEAD moved during plumbing commit | `head_moved: <line>` | Kept. Not counted. | Replays later. |
| Snapshot ref missing | `snapshot_missing` | Record `stuck` at once. | Manual. |
| Older record still failing | `blocked_by_<gate>` | Kept | Clears when the blocker is `done`. |
| `commitGate` throws | `commit_error: <message>` (gate entry only) | No pending record. A snapshot ref may remain. | Not handled. `TODO(owner: proflandrigan)`. |

`doctor` warnings for these states are not implemented. `TODO(owner: proflandrigan)`.

### 6.8 Denylist

`makeDenyMatcher(globs)`. Verified by a direct test run.

| Pattern | Matches | Does not match |
|---------|---------|----------------|
| `*.parquet` (no `/`) | the basename at any depth: `a/b/x.parquet` | none |
| `build/` (trailing `/`) | `build/x.bin` at the project root | `sub/build/x.bin` |
| `data/**/*.csv` | `data/a.csv`, `data/2024/a.csv` | `other/data/a.csv` |
| `**/cache/**` | `cache/q`, `p/cache/q` | none |
| `/root-only.txt` or `./root-only.txt` (anchored) | `root-only.txt` | `sub/root-only.txt` |

Glob rules: `*` does not cross `/`. `?` is one non-slash character. `**/` matches zero or more directories. A trailing `**` matches anything below.

Defaults. The config (`runtime/config/index.js`) defaults `git.denylist.globs` to `*.parquet, *.feather, *.arrow, *.pkl, *.pickle, *.joblib, *.pt, *.pth, *.ckpt, *.safetensors, *.onnx, *.h5, *.npy, *.npz, *.db, *.sqlite, *.sqlite3, *.csv.gz, *.zip, *.tar, *.tar.gz`, and `max_file_size_bytes` to 5 MiB. If `commitGate` is called without config, the module defaults are an empty glob list and 5 MiB.

### 6.9 Push

Never. `normalizeConfig` pins `push: false`, and no push path exists in `runtime/git/`. The `git.push` config key has no effect. `TODO(owner: proflandrigan)` if push is ever wanted.

### 6.10 Monorepo

The project root may be a subdirectory of the git toplevel. Index paths are converted with `git rev-parse --show-prefix`. Covered by `test/git-binding-commit.test.js` ("monorepo: project root is a subdirectory of the toplevel").

## 7. Interim confirm (Milestone A)

The operator CLI is interim. It is replaced by the Stage 5 tiers (E11.3 to E11.5) and E11.13. No agent can call it.

```
node cli/shards.js gates status  [--session <key>] [--root <dir>]
node cli/shards.js gates confirm <gate-id> [--session <key>] [--changes "<note>"] [--root <dir>]
```

- Root: `--root`, else `SHARDS_PROJECT_ROOT`, else the current directory.
- Without `--session`, the CLI searches sessions for a pending gate with that id. It fails with exit 1 if none match, and with exit 2 if several match (it lists them).
- `--changes` records `changes_requested` with the note and makes no commit. Without it, the gate is confirmed and the commit runs.
- Proof is `{tier: 'operator-cli', user: <OS username>, ts}`.
- Each successful confirm appends one line to `<root>/.shards/state/gate-operator.log.jsonl` through `lockedAppend`. A throw from `confirmGate` exits 1 with no log line.
- An already-confirmed gate is logged with `decision: already_confirmed`, and the CLI prints `commit -`. Minor, but it can be confusing.

Exit codes: 0 success, 1 gate or confirm error, 2 usage error.

## 8. Not yet done

| Item | Status | Ref |
|------|--------|-----|
| Confirmation tiers. Proof is shape-checked only. | Not started | `TODO(E11.3-E11.5)` |
| Replacement of the interim CLI | Not started | `TODO(E11.13)` |
| Suspend and resume exposed to any caller | Internal only | `TODO(E5.5)` |
| Suspended gates block frame `return`. Today only `pending` gates do (`runtime/stack.js` `pendingGatesFor`), so a suspended gate does not stop a pop. | Gap | `TODO(E5.5)` |
| `load_phase` enforcement | Not implemented. `runtime/reground.js` is a stub. | `TODO(E2.3)` |
| Copy queue. `copy_queue` is always `[]`. | Not started | `TODO(E6.8)` |
| Hook enforcement (block tool calls while a gate is pending). `hooks/` does not read gates. | Not started | `TODO(E11.6)` |
| Lease exclusion. `getLeasedPaths` returns `[]`. | Stub | `TODO(E5.9)` |
| `doctor`, `sessions_end` and replay at session end | Not implemented. No such export or command exists. | `TODO(owner: proflandrigan)` |
| Recovery for `stuck` records and `commit_error` gaps | Not implemented | `TODO(owner: proflandrigan)` |
| Push | Not implemented | Section 6.9 |
| `.shards/` in target project `.gitignore` | OPEN. The legacy installer (`tools/install.js`) appends only commented output-directory entries and does not add `.shards/`. The repo root `.gitignore` already ignores `.shards/`, for the shards repo only. | OPEN (installer and doctor) |
