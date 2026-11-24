# Gates (shards v2 runtime)

Developer notes for the gate subsystem: `runtime/gates/`, the `gate_request` tool, the interim operator CLI, and the gate-commit path in `runtime/git/`. Describes what the code does today. Planned items are marked `TODO(E<n>)` or `TODO(owner: proflandrigan)`.

## 1. Overview

A gate is a human checkpoint at the end of a phase. The agent asks for one with `gate_request`. Only a human can confirm it. The agent has no confirm tool (D8). Confirming an advancing gate triggers a git commit of the agent's output directory plus its confirmed `targets` (section 6).

| File | Role |
|------|------|
| `runtime/tools/gate_request.js` | MCP tool `gate_request`. Opens or reopens a gate on the top frame. Validates the record when `validates` is set. |
| `runtime/tools/load_phase.js` | MCP tool `load_phase`. Serves a phase file and refuses until the previous phase's gate is confirmed. Reads gates, never writes them. Section 9. |
| `runtime/reground.js` | Re-ground block builder used by `activate` and `load_phase`. |
| `cli/commands/doctor.js` | `shards doctor`: git and gate-tool permission checks, `--fix` for `.gitignore` and stuck commits. See `docs/doctor.md`. |
| `core/schema/gate-request.schema.json` | Input schema for `gate_request`. |
| `runtime/gates/machine.js` | State machine: `requestGate`, `confirmGate`, `suspendGate` and `resumeGate`, `getGate`, `listGates`, `pendingForFrame`. `runtime/gates/index.js` re-exports it. |
| `runtime/git/index.js` | Gate commits: `commitGate`, `replayPending`, `listPending`, `gitState`, `gateRef`, `makeDenyMatcher`. |
| `runtime/git/leases.js` | `getLeasedPaths()`. Returns the paths of active lease slices (`listActive`), and `commitGate` excludes them. |
| `runtime/lib/validation.js` | Parses the last `## Validation` section for `validates`. |
| `cli/commands/gates.js` | Interim operator CLI: `gates status`, `gates confirm` (section 7). |
| `runtime/state/store.js` | Locked, atomic writes of the session state. |

What is wired today: `gate_request` opens gates, and `gate_confirm`, `gate_advance`, tier 1 elicitation and `gates confirm` confirm them. The confirm path runs the git commit. Suspend and resume (`gate_suspend`, `gate_resume`) and `gate_force_close` also write `gates.json`. The `return` tool and the status header read it (`pendingGatesFor` in `runtime/stack.js`). The PreToolUse hook blocks write/exec calls from unbound callers while a gate is pending (section 8, and `docs/delegation.md` section 3.1).

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
| `targets` | `gate_request` | Optional. Array of up to 100 unique root-relative paths (1 to 512 characters each) where the agent's deliverables land. Absolute, drive-prefixed (`C:`), `..`-escaping, root (`.`), `.git/` and `.shards/` paths are rejected, as are a leading `:` (pathspec magic), blank paths and control characters. Targets are literal paths: `*`, `?` and `[ ]` are ordinary characters (for example `app/[id]/page.tsx`). Backslashes are treated as separators; trailing slashes and duplicates are collapsed. Unset when omitted. Passing it replaces the confirmed list; `[]` clears it. Added to the commit paths (section 6). |
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
| `pending` | `requestGate`, same id | `pending` | `result: already_pending`. `summary`, `record_ref` and `targets` are updated when given (`targets` replace the old list). |
| `changes_requested` | `requestGate`, same id | `pending` | `result: reopened`. `requested_at` resets. `summary` and `record_ref` are replaced when given. `targets` are replaced when passed and kept otherwise. |
| `pending` | `confirmGate`, `confirmed` | `confirmed` | Runs the commit (section 6). |
| `pending` | `confirmGate`, `changes_requested` | `changes_requested` | `note` stored. No commit. |
| `pending` | `suspendGate` (`gate_suspend`) | `suspended` | Requires `proof`. |
| `suspended` | `resumeGate` (`gate_resume`) | `pending` | Requires `proof` (`agent-resume`, self-supplied). `suspended_from` is removed. |
| `confirmed` | anything | (terminal) | See idempotency below. |

Rules enforced in code:

- **Idempotency.** `requestGate` on a confirmed id returns `already_confirmed` and changes nothing. A repeat `confirmGate` with `confirmed` on a confirmed gate returns `already_confirmed` and does not commit again.
- **One open gate per frame.** `requestGate` throws if the frame already has another gate in `pending` or `suspended`. The error names it. A `changes_requested` gate does not count, so a second gate can open on that frame.
- **Suspended gates block their id.** `requestGate` on a suspended id throws `gate <id> is suspended; resume it first`.
- **Invalid transitions throw.** `confirmGate` on an unknown id, or on a gate that is not `pending` (other than the confirmed repeat above), throws.
- **The state machine shape-checks proof only.** `requireProof` checks that `proof` is an object with a non-empty string `tier`; the machine does not verify the tier. Verification happens in the callers: tier 1 (`tier1.js`), tier 2 (`tier2.js`) and tier 3 (`tier3.js`) produce the proof for confirmation (section 8 below), and `gate_suspend` requires tier 1 or tier 3 proof. The interim operator CLI writes its own `{tier, user, ts}` proof.
- **Suspend and resume are tools.** `gate_suspend` needs human proof (tier 1 form, else a verbatim chat reply via `user_reply`). `gate_resume` needs no human proof: its handler passes a self-supplied `proof: {tier: 'agent-resume'}` to `resumeGate`, so the agent can resume on its own once it has re-entered the owning agent (`activate` lists suspended gates for that agent and tells it to call `gate_resume`). The gate is re-homed to the current frame and returns to `pending`; confirming it afterwards needs a fresh user message (the tier 3 high-water mark is reset).

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
| `targets` | no | array of 0 to 100 unique strings (1 to 512 characters each), root-relative paths inside the project; `[]` clears the list |

Refusals (tool errors, gate not opened):

- No resolved session.
- No frame on the stack: `gate_request refused: no active frame ... Activate an agent with mode=switch first.` Consult workers never hold gates.
- `targets` containing an absolute path, a path escaping the root, the root itself, a path inside `.git/` or `.shards/`, a path starting with `:`, a drive-prefixed path, or a blank or control-character path.
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

Gate ids repeat across agents, projects and tracks. A confirmed gate satisfies `gate_request` (`already_confirmed`) and `load_phase` only for the active frame's agent, project and track. A confirmed gate from another project is kept in `previous`, and the id starts over as a fresh pending gate.

If `shards.config.yaml` fails to load, `gate_request` and `load_phase` treat the policy as `strict` (nothing auto-confirms) and report the error in the result (`config_error` plus a `WARNING` line). Edits to `shards.config.yaml` apply on the next tool call: the runtime reloads it when its mtime or size changes.

`copy_queue` lists the external copies queued by failed `copy_report` calls (`docs/config.md`, "External copies"). It is `[]` when nothing is queued. A line of text and a `copy_stuck` list are added when copies have failed 5 times.

## 6. Git outcomes

### 6.1 Pipeline

`commitGate` (`runtime/git/index.js`) runs under the pending lock:

1. **Collect.** `git ls-files -co --exclude-standard -z -- <outputDirs>` inside a repo, or a filesystem walk outside one. Commit paths are the agent's `output_dir` (`{project}` substituted, normally `shards/<project>/`) plus the current target list: this gate's `targets` when it passed them, otherwise the `targets` of the most recently decided confirmed gate of the same agent, project and track in the session. A target dropped from a later list is no longer committed. Paths outside the root are dropped. Name narrow targets: everything under a target (tracked, or untracked and not ignored) is included. With no commit paths (`output_dir: null` and no targets) the result is `skipped: no_output_dirs`.
2. **Filter.** Drops `.git`, leased paths, denylisted paths, directories, and files over `max_file_size_bytes`. Keeps tracked files missing from disk as deletions.
3. **Diff.** Hashes the files and diffs them against HEAD. Keeps only changed entries. None changed means `skipped: nothing_to_commit`.
4. **Snapshot.** Writes a commit object (parent = HEAD) to `refs/shards/pending/<gate>-<seq>` (one ref per pending record) through a temporary index.
5. **Commit.** Normal path or plumbing path (section 6.3).
6. **Finish.** On success the snapshot ref and pending record are deleted. On failure both are kept.

### 6.2 Collection rules

- `.gitignore` applies to untracked files only. Tracked files are included even when `.gitignore` matches them. Checked with `git ls-files -co --exclude-standard`.
- Commit paths: the output directory plus gate `targets`, see step 1.
- The commit covers the full diff of each commit path against HEAD, not only the files written during this gate.
- Denylist and size limits apply to tracked and untracked files. A tracked file excluded by these rules is left alone, not deleted.
- `.shards/` is excluded only through the output directory. No collector rule excludes it by name. Output directories (`shards/<project>/`, `shards/<project>/mlops/`) never cover the root, and `gate_request` rejects targets that are the root or inside `.shards/`. Every git call runs with `GIT_LITERAL_PATHSPECS=1`, so a `*` in a target never widens the snapshot.
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
{ "version": 1, "next_seq": <n>, "records": { "<gate>@<session>#<seq>": Record } }
```

Record fields: `key, gate, agent, project, track, seq, session, output_dirs, snapshot_ref, files, tries, next_try_at (epoch ms), status (pending|stuck|done), reason, created_at`. A record that reaches `done` is deleted, not kept.

Records are keyed by an opaque record key (`rec.key`), not the gate id: gate ids repeat across projects and tracks (a closed id only counts for the same agent/project/track, see `requestGate`), so a reused id such as `data-analyst-phase-1` confirmed for another project, in the same or another session, gets its own record and does not drop an earlier uncommitted one. A new confirmation replaces an existing record only when it is the same gate instance: same gate id, session, agent, project and track (a re-confirm, for example after `changes_requested`). The replaced record's snapshot ref is deleted. Replay writes the commit outcome back to the matching instance: the current gate entry, or the entry kept in its `previous` list when the id has since been reused.

Older stores keyed by bare gate id load unchanged: the existing key becomes `rec.key`, and their records (which have no `project`) count as the same instance as a new confirmation of the same gate id, session and agent.

Snapshot refs are `refs/shards/pending/<gate>-<seq>`. In `<gate>`, characters outside `[A-Za-z0-9._-]` become `_`; if anything changed, the name gets a `-<8 hex>` sha1 suffix. Records from older stores keep the ref they stored (`refs/shards/pending/<gate>`).

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

The operator CLI is interim and remains the operator-side fallback next to the Stage 5 tiers (section 8 below, E11.13). No agent can call it.

```
npx @proflandrigan/shards@next gates status  [--session <key>] [--root <dir>]
npx @proflandrigan/shards@next gates confirm <gate-id> [--session <key>] [--changes "<note>"] [--root <dir>]
```

From a repo checkout, `node cli/shards.js gates ...` is the same command. Plugin and skills installs ship no `cli/`, so the runtime prints the `npx` form (`runtime/gates/confirm-command.js`, one helper used by `gate_request`, `describeInterimConfirm` and the `load_phase` refusal). When the runtime has a sibling `cli/shards.js` (a repo checkout or `--dev` build) it also prints that local form with an absolute path. The package spec follows `package.json` `name` + `publishConfig.tag` (checked by `test/gates-confirm-command.test.js`). The npm package is not published yet; until it is, use the local form.

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
| Confirmation tiers 1 to 3 (`tier1.js`, `tier2.js`, `tier3.js`; `gate_advance`, `gate_confirm`). The state machine itself still only shape-checks `proof`. | Done (section 8 below) | |
| Replacement of the interim CLI | Not started | `TODO(E11.13)` |
| Suspend and resume exposed as tools (`gate_suspend`, `gate_resume`; `activate` calls out suspended gates on re-entry) | Done. `gate_resume` takes no human proof (self-supplied `agent-resume`). | |
| Suspended gates and frame `return`. Only `pending` gates block a pop (`runtime/stack.js`); a suspended gate does not, by design (`gate_suspend` exists to allow leaving). | As designed | |
| `load_phase` compaction and version-change re-ground | Not built. Only `activate` and `load_phase` return a re-ground block. | `TODO(E11.7)` (section 9) |
| Copy queue (`copy_report`, `copy_queue`/`copy_stuck` in `gate_request`). The re-ground block does not include it. | Done (E6.8) | |
| Hook enforcement (block tool calls while a gate is pending). `hooks/lib/enforce.js` denies write/exec calls from unbound callers while the top frame has a pending gate. Bound fan-out workers are exempt (`docs/delegation.md` section 3.1). | Partly done (E5.9) | `TODO(E11.6)` for the remainder |
| Lease exclusion. `getLeasedPaths` returns active lease paths, and `commitGate` excludes them. | Done (E5.9) | |
| Replay at session end | Not implemented. `shards doctor` exists (`docs/doctor.md`); `doctor --fix` replays stuck records. | `TODO(owner: proflandrigan)` |
| Recovery for `stuck` records and `commit_error` gaps | Partly: `doctor --fix` force-replays stuck records. `commit_error` has no recovery. | `TODO(owner: proflandrigan)` |
| Push | Not implemented | Section 6.9 |
| `.shards/` in target project `.gitignore` | Not written by the v2 install paths (the plugin and `shards install --project`). `shards doctor` reports it (`git.ignore`) and `doctor --fix` appends it. The repo root `.gitignore` already ignores `.shards/`, for the shards repo only. The v1 installer (`tools/install.js`) no longer installs by default (`docs/release.md`). | OPEN (doctor reports it) |

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
- **Which gate in a file.** The first advancing gate in the phase file's source wins. Only the `{{gate ...}}` macro (what core phase files use) is read; the legacy `::GATE::` text fence is no longer parsed. A macro's id is `<agent>[-<track>]-phase-<N>` unless `id=` is given.
- **Dual-track ids** are used verbatim from the gate declaration, for example `data-engineer-quick-phase-1`.
- **Scope.** A confirmed gate counts only for the active frame's agent, project and track (see section 5). If the config fails to load, the policy is `strict` and the result carries `config_error` and a `WARNING` line.
- **Confirmed** means a record with the id (or, failing an id match, the same agent, phase, and a matching or absent track) has `status: confirmed`. Among candidates a confirmed one wins. Otherwise the first candidate's status is reported. No record gives `missing`.
- **Refusal text** (exact form; `prev` is the preceding phase, `0` for the first-phase rule, and `status` is `missing`, `pending`, `changes_requested` or `suspended`):

  ```
  load_phase refused: gate <gate-id> for phase <prev> is not confirmed (status: <status>). Ask the user to confirm it: npx @proflandrigan/shards@next gates confirm <gate-id> --session <session-key>[ (repo checkout: node <abs>/cli/shards.js gates confirm <gate-id> --session <session-key>)]
  ```

  The agent cannot confirm the gate itself (D8). The user runs the command.
- **Policy.** `gates.policy` is read but does not change `load_phase`: under every policy (`strict`, `phase`, `plan`) the previous advancing gate must be confirmed. Under `plan`, notice-recorded gates count as confirmed (section 8 below).

Example: `data-engineer` quick phase 2 requires `data-engineer-quick-phase-1` to be confirmed, because `phases_quick/phase-1.md` declares a `{{gate kind=phase}}` macro, whose derived id is that one.

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
- The copy queue is not included (it is returned by `gate_request` instead).

### 9.6 Re-ground events

| Event | Where it runs | Content |
|-------|---------------|---------|
| `activate` (switch) | `runtime/tools/activate.js`, returned in its `reground` field | Full block (9.5) |
| `load_phase` | Appended to the phase text | Full block (9.5) |
| `compact` / `resume` | `hooks/session-start.js` via `regroundHook` | Full block (9.5), or empty when the session has no frames and no gates. |
| `version_change` | Not wired | Empty string. `TODO(E11.7)`: once-per-version re-ground. |

Other tool responses carry only the state header (`docs/runtime.md` section 4).


## 8. Stage 5 confirmation tiers (E11.3 to E11.13)

- Tier 1: `gate_request` elicits (Approve / Request changes + note) when the client advertises elicitation (`runtime/gates/tier1.js`). Proof `{tier:'elicitation',level:1}`. Interactive Claude Code only (compat CC-1); otherwise the gate stays pending. `elicitGate` outcomes: `approved`, `changes`, `declined` (the client answered `decline` or `cancel`: a form was shown and dismissed), `timeout`, `error` (the request failed or returned nothing usable, e.g. headless `claude -p` failing at once) and `unsupported` (no elicitation capability). Only `declined` prints "A confirmation form was shown but dismissed without a decision"; `timeout`/`error` print the neutral "No confirmation form could be completed in this client"; `unsupported` prints neither.
- Tier 2: `gate_advance(id, note?)`. Confirms only if the PreToolUse shim recorded, at call time, `permission_mode` `default` or `plan` and returned `ask` (record `decision:'ask'`), the record is fresh (120 s) and unconsumed, no allow rule covers the tool, and the host is not Codex (tier 2 is off there: use tier 1 or 3). Proof `{tier:'host-prompt',level:2}`.
- Tier 3: `gate_confirm(id, decision, user_reply)` (`runtime/gates/tier3.js`). `user_reply` must equal the whole, first, previously unused user message after `gate_request`/resume (prompt_id high-water mark in `confirm.json`). One fixed refusal message, shown in full once per gate. Proof `{tier:'chat-reply',level:3}`, reply stored as `gate.reply`.
- Policies (`runtime/gates/policy.js`): `strict`, `phase` (checkpoint/confirm with `evidence.status:'pass'` auto-recorded), `plan` (after confirmed `plan-approval`, every kind is a notice until failure/anomaly/budget). Counting harness: `scripts/count-approvals.js` (OPEN: live 3/3 runs).
- Auto-verify: `auto_verify_start/auto_verify_end` tools + `runtime/auto-verify/`; the PreToolUse shim auto-approves allowlisted calls inside the budget/TTL; gates always win.
- Operator CLI: `shards gates status|history|checkpoints|violations|force-close|confirm`; `gate_force_close` tool follows the tier 2 rule. Force-closed gates are terminal, never count as confirmed, and can be re-requested.
- Re-ground: `runtime/reground.js` on activate/load_phase/SessionStart compact+resume; fixture `scripts/reground-fixture.js --check` (OPEN: live 3/3 compaction criterion).

## 10. Legacy migration (E10.1) and gate-history import (E11.11)

`shards migrate [--dry-run] [--force] [--root d]` migrates a v1 install. Code: `cli/commands/migrate.js` (orchestration), `cli/commands/migrate-legacy.js` (removal), `runtime/gates/legacy-import.js` (history import). Test fixture builder: `test/fixtures/legacy-install.js` plus `test/fixtures/legacy-gates/`.

Steps, in order:

1. Ledger export (`.shards/knowledge` to `docs/knowledge`, the ledger stays in place).
2. Gate-history import. Reads `.shards/gates/state.json` in the single-slot or the v2 `sessions` format, plus `gates.jsonl`. Every `history[]` entry becomes a `confirmed` gate in `.shards/state/sessions/legacy-import/gates.json` with `proof.tier: "legacy-import"`. Duplicate ids get `.2`, `.3` suffixes. `closed` events in `gates.jsonl` beyond what `history[]` holds are added too. A gate still open in the legacy state is imported as `changes_requested` (it never blocks v2). Unknown kinds become `phase`. `gates.jsonl` is copied verbatim to `legacy-gates.jsonl` in the same session directory. One note on `HEAD` under `refs/notes/shards-legacy-gates` lists every imported gate (skipped without a repository). The legacy gate files move to `.shards/archive/legacy-gates/`; nothing is deleted.
3. Removal, manifest-driven. Only files in `.claude/.shards-manifest.json` are removed, and only if their mtime is not later than `installedAt` plus 60 s, or git shows them tracked, unchanged against `HEAD` and last committed together with the manifest (fresh clones reset every mtime). Otherwise they are reported as skipped and stay recorded in a rewritten manifest; `--force` removes them anyway. Paths that escape the root are ignored. Hook entries in `.claude/settings.json` are removed per inner hook: exactly the manifest's `hookEntries`, or, only for manifests without them, a `gate-hook.js` / `relay.js` / `ui-push` match; user hooks stay. `.shards/hooks/gate-hook.js` and `gate-hook/` go; `.shards/runtime` is only reported. The `## Shards — Agent Suite` and `## Shards — Tool-call conventions` blocks are cut from `CLAUDE.md`; blocks between `<!-- shards:begin -->` / `<!-- shards:end -->` markers (from `shards install --claude-md`) are kept.
4. Summary. Output folders are never touched. Nothing is committed.

Re-running is a no-op. The command refuses to run inside the shards source repo.
