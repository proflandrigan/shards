# Gates (shards v2 runtime)

Developer notes for the gate subsystem: `runtime/gates/`, the `gate_request` tool, the interim operator CLI, and the gate-commit path in `runtime/git/`. Describes what the code does today. Planned items are marked `TODO(E<n>)` or `TODO(owner: proflandrigan)`.

## 1. Overview

A gate is a human checkpoint at the end of a phase. The agent asks for one with `gate_request`. Only a human can confirm it. The agent has no confirm tool (D8). Confirming an advancing gate triggers a git commit of the agent's output directory (section 6).

| File | Role |
|------|------|
| `runtime/tools/gate_request.js` | MCP tool `gate_request`. Opens or reopens a gate on the top frame. Validates the record when `validates` is set. |
| `runtime/tools/load_phase.js` | MCP tool `load_phase`. Serves a phase file and refuses until the previous phase's gate is confirmed. Reads gates, never writes them. Section 9. |
| `runtime/reground.js` | Re-ground block builder used by `activate` and `load_phase`. |
| `cli/commands/doctor.js` | `shards doctor`: git and gate-tool permission checks, `--fix` for `.gitignore` and stuck commits. See `docs/doctor.md`. |
| `core/schema/gate-request.schema.json` | Input schema for `gate_request`. |
| `runtime/gates/machine.js` | State machine: `requestGate`, `confirmGate`, `suspendGate` and `resumeGate` (internal), `getGate`, `listGates`, `pendingForFrame`. `runtime/gates/index.js` re-exports it. |
| `runtime/git/index.js` | Gate commits: `commitGate`, `replayPending`, `listPending`, `gitState`, `gateRef`, `makeDenyMatcher`. |
| `runtime/git/leases.js` | `getLeasedPaths()`. Returns the paths of active lease slices (`listActive`), and `commitGate` excludes them. |
| `runtime/lib/validation.js` | Parses the last `## Validation` section for `validates`. |
| `cli/commands/gates.js` | Interim operator CLI: `gates status`, `gates confirm` (section 7). |
| `runtime/state/store.js` | Locked, atomic writes of the session state. |

What is wired today: `gate_request` opens gates, and `gates confirm` confirms them. The confirm path runs the git commit. Only those two write `gates.json`. The `return` tool and the status header read it (`pendingGatesFor` in `runtime/stack.js`). The PreToolUse hook blocks write/exec calls from unbound callers while a gate is pending (section 8, and `docs/delegation.md` section 3.1).

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

`SHARDS_GATE_ENFORCE=0` turns off the PreToolUse write blocks in `hooks/lib/enforce.js` (see `docs/delegation.md` section 3.1). The runtime (`runtime/`) does not read `SHARDS_CHECKPOINT_ENFORCE`; only `packages/studio/server.js` reads it. `pendingForFrame` matches a gate of any kind, so a pending `checkpoint` or `confirm` gate also blocks unbound writes in the hook while enforcement is on.

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
- Leases: `leases.getLeasedPaths(session)` returns the paths of active lease slices (`listActive`). `commitGate` accepts a `getLeasedPaths` override. `machine.js` does not pass one, so the module function is used. Tests stub the module function.

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
- A `stuck` record blocks every later gate commit in that project. Nothing clears it automatically. `replayPending(..., {force: true})` retries it. The only production caller that passes `force` is `shards doctor --fix` (`docs/doctor.md`). No other CLI command exposes it. `TODO(owner: proflandrigan)`.
- Replay at session end is not implemented. `TODO(owner: proflandrigan)`.

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

`doctor` reports no repo, detached HEAD, merge or rebase in progress, stuck records and waiting records (`git.*` checks). It does not report `signing_required`, `commit_disabled`, hook failures or `commit_error`. `TODO(owner: proflandrigan)`.

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
| `load_phase` compaction and version-change re-ground | Not built. Only `activate` and `load_phase` return a re-ground block. | `TODO(E11.7)` (section 9) |
| Copy queue. `copy_queue` is always `[]`. | Not started | `TODO(E6.8)` |
| Hook enforcement (block tool calls while a gate is pending). `hooks/lib/enforce.js` denies write/exec calls from unbound callers while the top frame has a pending gate. Bound fan-out workers are exempt (`docs/delegation.md` section 3.1). | Partly done (E5.9) | `TODO(E11.6)` for the remainder |
| Lease exclusion. `getLeasedPaths` returns active lease paths, and `commitGate` excludes them. | Done (E5.9) | |
| Replay at session end | Not implemented. `shards doctor` exists (`docs/doctor.md`); `doctor --fix` replays stuck records. | `TODO(owner: proflandrigan)` |
| Recovery for `stuck` records and `commit_error` gaps | Partly: `doctor --fix` force-replays stuck records. `commit_error` has no recovery. | `TODO(owner: proflandrigan)` |
| Push | Not implemented | Section 6.9 |
| `.shards/` in target project `.gitignore` | OPEN for the legacy installer (`tools/install.js`), which does not add `.shards/`. `shards doctor` reports it (`git.ignore`) and `doctor --fix` appends it. The repo root `.gitignore` already ignores `.shards/`, for the shards repo only. | OPEN (installer) |

## 9. `load_phase` gate enforcement (E2.3)

`runtime/tools/load_phase.js`. Serves the rendered text of one phase file for the active agent and enforces the gate chain. Inputs: `agent` (required), `n` (required: digits such as `3` or `6-5`, or an integer `>= 0`), `track` (`quick|deep`; required for dual-track agents, refused for single-track).

### 9.1 Check order

| # | Check | Refusal text |
|---|-------|--------------|
| 1 | Session resolved | `load_phase requires a resolved session` |
| 2 | `n` matches `^\d+(-\d+)*$` | `Invalid phase "<n>": expected digits like 3 or 6-5` |
| 3 | Agent exists and loads | `Unknown agent "<agent>". Valid agents: ...` |
| 4 | Track matches the agent | `Agent <a> is dual-track: pass track=quick\|deep`, `has no <t> track. Valid tracks: ...`, or `is single-track; do not pass track` |
| 5 | Phase is in the track's order | `Unknown phase "<n>" for <a>[ (<track> track)]. Valid phases: ...` |
| 6 | Agent is the top frame | `load_phase refused: <a> is not the active agent (top of stack is <x>)` or `(no active frame)`, each followed by `Call activate(agent="<a>", mode="switch") first.` |
| 7 | Gate chain (9.2) | Refusal below |
| 8 | Render (9.3) | `Failed to render <path>:` plus the build errors |
| 9 | Frame update (9.4) | `load_phase refused: <a> is no longer the top frame` if the stack moved |
| 10 | Re-ground block appended (9.5) | Omitted silently if the builder throws |

Consult and fan-out workers never hold a frame, so they cannot load phases.

### 9.2 Gate rule

Loading phase N requires the advancing gate of the phase immediately before N, in the track's order.

- Order is the row order of `core/agents/<agent>/phases/index.md` (or `phases_quick/`, `phases_deep/`). The File column gives `phase-<n>.md`. Sub-phases such as `6-5` sit in their index position.
- If the index is missing or lists no rows, the order is empty. Every load then falls through to the phase-0 rule below.

| Requested phase | Gate required |
|-----------------|---------------|
| Index position > 0, and the preceding phase file has an advancing gate | That gate's id |
| Index position > 0, and the preceding phase file has no advancing gate ("unguarded") | None |
| Index position 0 (or not found in the index) | `<agent>-phase-0` (dual-track: also `<agent>-<track>-phase-0`), **only if a gate record with that id already exists** in `gates.json`. Otherwise none. |

- **Advancing kinds** are `phase`, `final`, `execute` and `handoff`. `checkpoint` and `confirm` never count.
- **Which gate in a file.** The first advancing gate in the phase file's source wins. Two forms are read: the `::GATE:: id=... kind=...` fence (what core phase files use today) and the `{{gate ...}}` macro (no core file uses it yet). A fence needs an `id` without `<` or `>`. A macro's id is `<agent>[-<track>]-phase-<N>` unless `id=` is given.
- **Dual-track ids** are used verbatim from the fence, for example `data-engineer-quick-phase-1`.
- **Confirmed** means a record with the id (or, failing an id match, the same agent, phase, and a matching or absent track) has `status: confirmed`. Among candidates a confirmed one wins. Otherwise the first candidate's status is reported. No record gives `missing`.
- **Refusal text** (exact form; `prev` is the preceding phase, `0` for the first-phase rule, and `status` is `missing`, `pending`, `changes_requested` or `suspended`):

  ```
  load_phase refused: gate <gate-id> for phase <prev> is not confirmed (status: <status>). Ask the user to confirm it: node cli/shards.js gates confirm <gate-id> --session <session-key>
  ```

  The agent cannot confirm the gate itself (D8). The user runs the command.
- **Policy.** `gates.policy` in `shards.config.yaml` is read. `strict` and `phase` behave identically here. `plan` is treated as `phase`. `TODO(E11.8)`.

Example: `data-engineer` quick phase 2 requires `data-engineer-quick-phase-1` to be confirmed, because `phases_quick/phase-1.md` declares that `::GATE:: kind=phase` fence.

### 9.3 Host-target rendering

- Target is `codex` when the session's host is Codex, otherwise `claude`. The host comes from session correlation (`docs/runtime.md` section 3). `skills` is not used here.
- The phase file is rendered with the build compiler (`build/compile.js`, `processFile`), `strict: false`. Frontmatter is stripped. Macros expand to the target's tool names (`docs/runtime.md`, `build/MACROS.md` section 5): `mcp__plugin_shards_shards__<tool>` on claude, `shards.<tool>` on codex.
- Phase files reference other phases with `{{phase N}}`. The rendered text tells the agent to call `load_phase`, not to read a file.

### 9.4 State change

On success, only the top frame's `phase` and `track` change:

- `phase`: a Number for digit-only `n` (`3`), otherwise the string (`"6-5"`).
- `track`: `quick`, `deep`, or `null` for single-track agents.

No gate is written. `gates.json` is only read.

### 9.5 Re-ground block

Appended to the returned text after a blank line. Built by `buildReground` in `runtime/reground.js`, after the frame update, so it shows the new phase:

```
--- Re-ground ---
Agent: <id>
Persona summary:
<contents of persona-summary.md>
Current phase: <N> (track <t>)
Project: <project>            (only when the frame has a project)
Confirmed gates:
  - <gate-id> sha=<first 12 chars> outcome=<outcome>
  (none)
Pending/suspended gates:
  - <gate-id> (<status>, kind <kind>, phase <N>)
  (none)
```

- The `sha=` and `outcome=` parts appear only when the gate has a commit object.
- The copy queue is not included. `TODO(E6.8)`.

### 9.6 Re-ground events

| Event | Where it runs | Content |
|-------|---------------|---------|
| `activate` (switch) | `runtime/tools/activate.js`, returned in its `reground` field | Full block (9.5) |
| `load_phase` | Appended to the phase text | Full block (9.5) |
| `compact` | Not wired | Empty string. `TODO(E11.7)`: SessionStart compact/resume shim and trimmed block. |
| `version_change` | Not wired | Empty string. `TODO(E11.7)`: once-per-version re-ground. |

Other tool responses carry only the state header (`docs/runtime.md` section 4).


## 8. Stage 5 confirmation tiers (E11.3 to E11.13)

- Tier 1: `gate_request` elicits (Approve / Request changes + note) when the client advertises elicitation (`runtime/gates/tier1.js`). Proof `{tier:'elicitation',level:1}`. Interactive Claude Code only (compat CC-1); otherwise the gate stays pending.
- Tier 2: `gate_advance(id, note?)`. Confirms only if the PreToolUse shim recorded, at call time, `permission_mode` `default` or `plan` and returned `ask` (record `decision:'ask'`), the record is fresh (120 s) and unconsumed, no allow rule covers the tool, and the host is not Codex (tier 2 is off there: use tier 1 or 3). Proof `{tier:'host-prompt',level:2}`.
- Tier 3: `gate_confirm(id, decision, user_reply)` (`runtime/gates/tier3.js`). `user_reply` must equal the whole, first, previously unused user message after `gate_request`/resume (prompt_id high-water mark in `confirm.json`). One fixed refusal message, shown in full once per gate. Proof `{tier:'chat-reply',level:3}`, reply stored as `gate.reply`.
- Policies (`runtime/gates/policy.js`): `strict`, `phase` (checkpoint/confirm with `evidence.status:'pass'` auto-recorded), `plan` (after confirmed `plan-approval`, every kind is a notice until failure/anomaly/budget). Counting harness: `scripts/count-approvals.js` (OPEN: live 3/3 runs).
- Auto-verify: `auto_verify_start/auto_verify_end` tools + `runtime/auto-verify/`; the PreToolUse shim auto-approves allowlisted calls inside the budget/TTL; gates always win.
- Operator CLI: `shards gates status|history|checkpoints|violations|force-close|confirm`; `gate_force_close` tool follows the tier 2 rule. Force-closed gates are terminal, never count as confirmed, and can be re-requested.
- Re-ground: `runtime/reground.js` on activate/load_phase/SessionStart compact+resume; fixture `scripts/reground-fixture.js --check` (OPEN: live 3/3 compaction criterion).
