# shards-mcp runtime

Developer notes for the v2 runtime under `runtime/`. Describes what the code does today. Items that are planned but not yet in the repo are marked as such.

## 1. Overview

`shards-mcp` is a stdio MCP server (stage D1). It exposes Shards tools to an MCP client and keeps per-project state under `.shards/state/`.

Start it with either:

```bash
node runtime/server.js [--root <dir>]
npm run mcp                      # same as: node runtime/server.js
```

**Project root discovery**, first match wins:

1. `--root <dir>` or `--root=<dir>` on the command line
2. `SHARDS_PROJECT_ROOT` environment variable
3. the current working directory

The root is resolved to an absolute path (`resolveRoot` in `server.js`).

**Config loading is lazy.** `createServer` does not read the config. The first tool that calls `ctx.getConfig()` runs `loadOrCreateConfig(root)`, and the result is cached for the process. If `shards.config.yaml` is missing it is created at the project root with the zero-config defaults. A `ConfigError` is thrown inside the tool handler, so it reaches the client as an `isError` response.

**Bin wiring is not done.** The `shards-mcp` bin entry is planned as E2.10. Until then, the only entry point is `node runtime/server.js` or `npm run mcp`.

## 2. Architecture

| File | Role |
|------|------|
| `runtime/server.js` | Entry point. Resolves the root, builds the MCP `Server` (name `shards-mcp`, tools capability), wires `tools/list` and `tools/call` to the registry, connects a stdio transport. Exports `createServer` and `resolveRoot` for tests. Logs go to stderr only; stdout belongs to the transport. |
| `runtime/registry.js` | `defineTool()` builds a tool definition and compiles its input schema with ajv. `Registry` stores tools, rejects duplicate names, lists them, and runs calls. Every response, including errors and unknown tools, starts with the state header. |
| `runtime/tools/index.js` | `loadTools()` requires every `*.js` file in `runtime/tools/` except `index.js`. A file contributes a tool if it exports a tool object (or an array of them, or `{ tool }`). No registry edit is needed to add a tool. |
| `runtime/tools/shards_status.js` | Reports root, session key, state version, config path, jobs and bindings, gate policy, and active agent. |
| `runtime/session/correlate.js` | E2.11 session correlation. `createCorrelator()` maps this MCP process to a host session key: handshake ancestry match first, then a per-process fallback that is refused for hosts without a one-process-per-session guarantee. See section 3. |
| `runtime/stack.js` | Agent stack over `frames.json`: `pushFrame`, `popFrames`, `pendingGatesFor`. Frame schema and base-frame rules in section 9. |
| `runtime/agents.js` | Agent catalog. `coreDir()` returns `SHARDS_CORE_DIR` or the repo `core/`. `loadAgents()` reads `<core>/agents/*/agent.yaml` on each call. `readPersonaSummary()` reads an agent's persona summary. |
| `runtime/tools/list_agents.js` | `list_agents`. Sessionless. Lists agents with role, activation modes, consult entries and output directory. |
| `runtime/tools/activate.js` | `activate`. `switch` pushes a frame and returns the persona summary. `consult` returns entries and pushes nothing. See section 9. |
| `runtime/tools/return.js` | `return`. Pops one frame, or pops down to `to`. See section 9. |
| `runtime/tools/active.js` | `active`. Returns the session's frame stack, top frame and depth. |
| `runtime/state/store.js` | `StateStore`: reads and locked, atomic writes of the state tree. Also `provisionalSessionKey()` and `sanitizeSessionKey()`. |
| `runtime/state/append.js` | `lockedAppend(file, line)`: appends one line under a cross-process lock. Building block for JSONL logs (E2.9). Shares `LOCK_OPTS` with the store. |
| `runtime/header.js` | Builds the one-line state header and derives its fields from the store. |
| `runtime/reground.js` | Re-ground block builder (section 4). Used by `activate` (switch) and `load_phase`. `compact` and `resume` return the block when the session has content; `version_change` returns empty text until E11.7. |
| `runtime/tools/load_phase.js` | `load_phase`. Serves a phase file for the active agent, refused until the previous gate is confirmed. See `docs/gates.md` section 9. |
| `runtime/config/index.js` | `shards.config.yaml`: YAML parse, ajv schema validation (`core/schema/shards-config.schema.json`), model-name guard, defaults merge, first-use creation, `resolveJob`. `runtime/config/bindings.js` is a separate module not covered here. |
| `runtime/lib/` | `validation.js`, `auto-allowlist.js`, `sql-guard.js`. Moved from the legacy gate hook (E2.5). See section 7. |

Dependencies that matter here: `@modelcontextprotocol/sdk`, `ajv` (default draft-07 class in `registry.js`; `ajv/dist/2020` in config), `ajv-formats`, `yaml`, `proper-lockfile`.

## 3. State layout

All state lives under the project root:

```
<root>/shards.config.yaml                                   config (created on first use, never rewritten)
<root>/.shards/state/global.json                            {version, schema: 1}
<root>/.shards/state/.lock                                  lock target (proper-lockfile creates .lock.lock)
<root>/.shards/state/sessions/<sessionKey>/frames.json      {frames: []}  stack of {agent, phase, ...}
<root>/.shards/state/sessions/<sessionKey>/gates.json       {gates: {}}   keyed by gate id
<root>/.shards/state/sessions/<sessionKey>/session.json     {sessionKey, createdAt, version}
<root>/.shards/state/sessions/<sessionKey>/leases.json      {leases: {}}  lease records (fan-out and task leases)
```

Notes on what the code does today:

- Session keys must match `[A-Za-z0-9._-]+`, be at most 128 characters, and must not contain `..`.
- Missing files read as defaults. A file that exists but does not parse throws `Corrupt state file ... Refusing to overwrite`. The store never overwrites corrupt state.
- `frames.json` is written by `activate` (switch), `return` and `load_phase` (which sets `phase` and `track` on the top frame), through `runtime/stack.js` and under the same lock. `gates.json` is written only by the gate machine (`gate_request`, `node cli/shards.js gates confirm`; see `docs/gates.md`). `shards_status`, the header, `pendingGatesFor` and `load_phase` read it.
- `global.json` is part of the layout (`update(name, fn, false)` targets it), but nothing in this slice reads or writes it.

**Locking.** Every write goes through `StateStore.update(name, fn)`:

1. Creates the session directory and the `.lock` file.
2. Takes a `proper-lockfile` lock on `.lock` (`stale` 10 s, 40 retries with backoff).
3. Reads the target file and `session.json`, runs `fn`, and writes the result.
4. Releases the lock in `finally`.

**Atomic writes.** `atomicWrite` writes to `<file>.<pid>.<random>.tmp`, fsyncs, then renames over the target. On `EPERM`, `EACCES` or `EBUSY` (typical on Windows) it retries the rename up to 8 times with growing sleeps. On final failure it removes the temp file and rethrows.

**Version counter.** Each `update` bumps `version` in `session.json` by one, inside the same lock as the data write. `getVersion()` reads it without the lock. The header shows this number as `v<N>`.

**Session key (E2.11).** `createCorrelator()` in `runtime/session/correlate.js` resolves the key lazily, on every tool call. `server.js` uses it unless `createServer` is given an explicit `sessionKey`, which is used as-is (`sessionSource: 'explicit'`). Resolution tries three sources in order:

1. **Handshake ancestry (`source: 'handshake'`).** The SessionStart hook writes `<root>/.shards/state/handshake/<hook-pid>.json` (section 8). The correlator takes this process's ancestry (`ppidChain(process.ppid)`) and, for each handshake that is under 24 h old, has a valid `session_id`, and has a non-empty `ppid_chain` (pids above 1), accepts it only when our direct parent (the host process, `ancestry[0]`) appears at position 0 or 1 of the handshake's `ppid_chain`. A match through a more distant shared ancestor (a shell, tmux, an IDE) is refused. Among accepted handshakes the newest `ts` wins. A `/clear` keeps the same ancestor and writes a newer handshake, so the session is re-keyed. The key is `toSessionKey(session_id)`.
   - PID-reuse guard: a handshake older than the matched ancestor's start time is skipped. The guard runs only when the ancestry function exposes `startTimeMs`. The default ancestry does not, so the guard is inactive by default.
   - The result is cached against the handshake directory's file signatures (name, mtime, size) and the ancestry chain. The directory is re-scanned only when it changes. Refusals are not cached.
2. **Host session env (`source: 'host-env'`).** `HOST_SESSION_ENV` maps a host to an env var name. It is empty. `docs/compat.md` documents no host session env var, so this step never fires today.
3. **Fallback process key (`source: 'process'`).** Applies when no handshake matches. Whether it is allowed depends on the detected host (table below). If allowed, the key is `provisionalSessionKey()`, which is `mcp-<pid>-<6 hex>` and generated once per process.

The host is `SHARDS_HOST` when it names a known host other than `unknown`. Otherwise `detectHost()` decides, and anything not detected as Codex counts as `claude-code`.

| Host | Process-key fallback | Reason (from `docs/compat.md`) |
|------|----------------------|--------------------------------|
| `claude-code` | allowed | One stdio MCP process per session |
| `codex` | refused | An app-server may share one MCP process across threads |
| `t3` | refused | Unverified (T3-4); may share one MCP process across threads |
| `unknown` | refused | Host not recognised |

A refused fallback throws `SessionCorrelationError` (`code: SESSION_FALLBACK_REFUSED`), which reaches the client as `isError`. Fixes: enable the SessionStart hook so it writes a handshake, or set `SHARDS_ASSUME_ONE_PROCESS_PER_SESSION=1` when you know the host runs one MCP process per session.

Sessionless tools (`list_agents`) still run when resolution fails. Every other tool, including `activate` in both modes, returns the resolution error. Do not rely on the format of process keys.

**Events log (`.shards/events.jsonl`, E2.9).** The `artifact_emit(type, path, meta)` tool (`runtime/tools/artifact_emit.js`, logic in `runtime/lib/events.js`) appends one JSON line per call through `lockedAppend`, replacing the UI's `ui-push` path.

- Line shape (v1): `{v:1, ts, session, agent, type, path, meta}`. Schema: `core/schema/event.schema.json`.
- `type` is one of the 10 artifact types (data-viewer, chart, dag, experiment-dashboard, eval-dashboard, model-card, prompt-lab, brainstorm, pr-review, notebook-walkthrough) or `close`. Unknown types are rejected.
- `path` is stored relative to the project root with `/` separators. Traversal (`..`), absolute paths outside the root, NUL bytes and symlink escapes are rejected. `close` may omit it (stored as null).
- `agent` is the top frame's agent, or null.

## 4. State header

Every tool response begins with a text block containing the header, followed by a second text block with the body:

```
[shards v12 | agent=data-analyst ph=2 gate=- q=0]
```

Fields:

| Field | Source |
|-------|--------|
| `v12` | `session.json` `version` (monotonic, see section 3) |
| `agent` | `agent` of the top frame in `frames.json`, or `-` |
| `ph` | `phase` of the top frame, or `-` |
| `gate` | id of a pending gate in `gates.json` that belongs to the top frame, or `-` |
| `q` | number of queued external copies in `copies.json` (`runtime/copies`, written by `copy_report`; see `docs/config.md`). `0` when none. ` stuck=N` is appended only when N copies are stuck after 5 attempts. |

Rules:

- Values are sanitized: whitespace, `]`, and `|` become `_`. Empty values become `-`.
- Agent, phase and gate values are clipped to 40 characters at first. If the header is over budget, the agent and gate limits drop by 4 each step, down to a floor of 4.
- The budget is 60 tokens by the estimator `ceil(length / 3.5)`. This is deliberately conservative; real tokenizers average closer to 4 characters per token.
- The header is computed after the handler runs, so it reflects any state change the handler made.
- The header is present on success, on unknown tools, on argument validation failures, and on handler exceptions. Those responses set `isError: true`.

Re-ground (`runtime/reground.js`) has four event names: `activate`, `load_phase`, `compact`, `version_change`. `activate` (switch) and `load_phase` return the full block: `--- Re-ground ---`, the agent id and persona summary, current phase and track, project, confirmed gates with commit SHAs, and pending or suspended gates. Layout is in `docs/gates.md` section 9.5. `regroundHook` also returns the full block for `compact` and `resume` when the session has content, and empty text for `version_change`, which is not wired. `TODO(E11.7)`: trimmed compaction re-ground and once-per-version re-ground. The block carries a fixed `Copy queue: (empty)` line; it does not list real queue contents (the queue itself shipped in E6.8, see the `q` header field).

## 5. How to add a tool

1. Create a file in `runtime/tools/`. Any `*.js` name other than `index.js` works. Use `defineTool` from `../registry`.
2. Export the result. `loadTools()` picks it up at server start.

Example, `runtime/tools/echo_text.js`:

```js
'use strict';
const { defineTool } = require('../registry');

module.exports = defineTool({
  name: 'echo_text',                       // must match /^[a-z][a-z0-9_]*$/ and be unique
  description: 'Return the given text unchanged.',
  inputSchema: {                           // JSON Schema, type must be "object"
    type: 'object',
    properties: { text: { type: 'string', maxLength: 500 } },
    required: ['text'],
    additionalProperties: false,
  },
  async handler(args, ctx) {               // ctx: { root, getConfig, state, sessionKey, reground }
    return { text: args.text };            // or { data: {...} } for JSON output
  },
});
```

Rules the code enforces:

- **Name and description** are checked by `defineTool`. A missing or invalid name, a missing description, or a non-object schema throws at load time.
- **Arguments** are validated by ajv before the handler runs. Failures return `isError: true` with messages like `/text must be string`.
- **Return value** is `{ text }` or `{ data }`. `text` is used as-is. `data` is pretty-printed JSON. Anything else is an empty body.
- **Errors** are thrown. The registry catches them and returns `isError: true` with `e.message`. Do not return error objects.
- **Config** is read with `ctx.getConfig()`. It throws `ConfigError` if the file is invalid, which becomes an error response.
- **State** is read with `ctx.state.read(name)` and written with `ctx.state.update(name, fn)`. Writes must go through `update` so they take the lock and bump the version.

**Testing a tool.** Follow `test/runtime-server.test.js`. The pattern:

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';        // via createRequire
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(repo, 'runtime', 'server.js'), '--root', tmpDir],
  stderr: 'pipe',
});
const client = new Client({ name: 'test', version: '0.0.0' });
await client.connect(transport);
const r = await client.callTool({ name: 'echo_text', arguments: { text: 'hi' } });
// r.content[0].text is the header; r.content[1].text is the body
await client.close();
```

Use a temp directory for `--root` so the test does not touch the repo's `.shards/`. Name new runtime test files `test/runtime-*.test.js`, since the CI job runs `vitest run test/runtime-`. For a unit test of a tool without the transport, `createServer({ root, sessionKey })` from `server.js` returns the registry and state.

## 6. Cross-OS status

- **Linux:** verified locally.
- **macOS and Windows: OPEN (external).** `.github/workflows/runtime.yml` defines a matrix of `ubuntu-latest`, `macos-latest`, `windows-latest` across Node 18, 20 and 22. It runs `npm ci` and `npx vitest run test/runtime-`. The workflow has never run, because the work is local only. It becomes verifiable once the branch is pushed and the workflow runs green.
- `TODO(owner: proflandrigan)`: push the branch and confirm the matrix. Until then the macOS and Windows legs of E2.1 are not met.
- Windows-specific code: the rename retry in `atomicWrite` (section 3). It is written for Windows file-locking behavior, but no Windows run has checked it.

## 7. Libraries

`runtime/lib/` holds three modules moved out of the legacy gate hook (E2.5):

- `validation.js`
- `auto-allowlist.js`
- `sql-guard.js`

Each module's header comment describes its contract. The library internals were not reviewed in this write-up. `test/auto-allowlist.test.js` imports `runtime/lib/auto-allowlist.js` directly.

The legacy gate hook and its re-export shims (`tools/gate-hook/validation.js`, `sql-guard.js`, `auto-allowlist.js`) were removed in E11.9.

**Install breakage (resolved in E11.9).** The installer used to copy `tools/gate-hook/` to `.shards/hooks/gate-hook/` in a target project. From there, `../../runtime/lib/` resolves to `.shards/runtime/lib/`, which the installer did not create. The installer no longer copies the legacy hook, so this path no longer applies.

## 8. Hooks (E11.0)

Hook shims live in `hooks/` (see `hooks/README.md`). They write hook-owned state through `StateStore.withLock(fn)` (added for E11.0: takes the state lock without bumping the session `version`, so hook writes never trigger version-change re-grounding).

```
<root>/.shards/state/sessions/<key>/prompts.jsonl   one line per UserPromptSubmit
<root>/.shards/state/sessions/<key>/hooks.json      {promptSeq, host, gateCalls: [...<=20], lastGateCall}
<root>/.shards/state/handshake/<hook-pid>.json      SessionStart handshake (pruned after 24h)
<root>/.shards/state/hook-errors.log                JSON lines {ts, hook, error}
```

`<key>` = `toSessionKey(session_id)` (`hooks/lib/host.js`).

`prompts.jsonl` line: `{v:1, session_id, prompt_id (int, 1-based, monotonic per session), ts (ISO), text (NFC, whitespace collapsed, trimmed), sha256 (hex of text as UTF-8), host, turn_id?, permission_mode?}`.

`hooks.json` gate record: `{tool, permission_mode (string|null), ts, host, tool_use_id?, agent_id?}`.

Lease handling in the hook: worker binding (`fanout_claim`) and worker heartbeats are written with `bump: false`, so they do not bump the session version. Expiry writes made by `expireStale` go through the normal update and do bump it. The MCP server runs a lease sweep every `SHARDS_LEASE_SWEEP_MS` ms (default 30000; zero, negative or non-numeric disables it) in `startLeaseSweep` (`runtime/server.js`). Rules and tool details: `docs/delegation.md` section 3.1.

Handshake: `{session_id, source (startup|resume|compact|clear), cwd, ts, pid, ppid_chain: [parent, grandparent, ...]}`. `pid` is the hook process; the host process is a common ancestor of the hook and the MCP server, so E2.11 intersects `ppid_chain` with the MCP process's own ancestry and takes the newest `ts`. Windows records `[process.ppid]` only.

Field assumptions from docs only (not seen in real payloads): Codex `additionalContext` output shape, `permission_mode` on Claude Code PreToolUse. Claude Code SessionStart and UserPromptSubmit were observed live (headless `claude -p`). Codex SessionStart, UserPromptSubmit, PreToolUse and SubagentStop payloads (including `permission_mode`) were captured live on Codex 0.169.0, 2026-11-19 (`docs/compat.md` CX-6; fixtures in `test/fixtures/codex/payloads-0.169.0.json`).

## 9. Registry and agent stack (E2.2)

Every tool response starts with the state header (section 4). Session-bound tools resolve their session as in section 3. `list_agents` is sessionless.

**Tools**

| Tool | Input | Result (`data`) |
|------|-------|-----------------|
| `list_agents` | none | `{agents: [{id, display_name, description, role, activation, consult_entries (keys), output_dir}], core_dir}`. An agent whose `agent.yaml` is malformed appears as `{id, error}`. |
| `activate` | `agent` (required), `mode` (`switch` or `consult`, required), `project?` (must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`), `entry?` (a consult entry key) | Switch: `{agent, mode, frame, persona_summary: {path, content}, output_dir, output_dir_created, stack, reground}`. Consult: `{agent, mode, consult_entries, entry, persona_summary: {path}, note}`. |
| `return` | `to?` (string), `pop_base?` (boolean) | `{popped, stack, top, persona_summary, state_summary}`. `state_summary` is `{agent, phase, project, pending_gates}` for the new top, or null. |
| `active` | none | `{stack, top, depth}` |
| `load_phase` | `agent`, `n`, `track?` (`quick`\|`deep`) | `{text}`: rendered phase body plus the re-ground block. Refused until the previous phase's gate is confirmed; the rules and refusal text are in `docs/gates.md` section 9. Sets the top frame's `phase` and `track`. |

**Complete tool index** (every file in `runtime/tools/`):

| Tool | Purpose | Documented in |
|------|---------|---------------|
| `list_agents` | List available agents with role, activation modes, consult entries and output dir. | this section |
| `activate` | Activate an agent (switch pushes a frame; consult is one-shot). | [`activation.md`](activation.md) |
| `return` | Pop one frame (or up to `to`); refused while a popped frame owns a pending gate. | [`activation.md`](activation.md) |
| `active` | Show the agent stack. | this section |
| `load_phase` | Serve one phase, refused until the previous gate is confirmed. | [`gates.md`](gates.md) |
| `gate_request` | Request a human gate at the end of a phase. | [`gates.md`](gates.md) |
| `gate_advance` | Confirm a pending gate after the user approved the host permission prompt (tier 2). | [`gates.md`](gates.md) |
| `gate_confirm` | Relay the user's verbatim chat reply to a pending gate (tier 3). | [`gates.md`](gates.md) |
| `gate_force_close` | Force-close a stuck gate after a supervised permission prompt; not Codex. | [`gates.md`](gates.md) |
| `gate_suspend` | Suspend a pending gate when the user asks, so the frame can return. | [`gates.md`](gates.md) |
| `gate_resume` | Resume a suspended gate. | [`gates.md`](gates.md) |
| `gates_open` | List pending and suspended gates. | [`gates.md`](gates.md) |
| `copy_report` | Report the result of one external copy of a confirmed gate; failures queue for retry (max 5). | [`config.md`](config.md) |
| `artifact_emit` | Append a UI artifact event to `.shards/events.jsonl`. | [`artifact-contract.md`](artifact-contract.md) |
| `auto_verify_start` | Open a bounded auto-verify block that auto-approves read-only verification calls. | [`core/protocols/auto_verify_mode.md`](../core/protocols/auto_verify_mode.md) |
| `auto_verify_end` | End the active auto-verify block. | [`core/protocols/auto_verify_mode.md`](../core/protocols/auto_verify_mode.md) |
| `fanout_start` | Open a fan-out lease over non-overlapping worker slices; returns one card per slice. | [`delegation.md`](delegation.md) |
| `fanout_claim` | Fan-out worker: claim a slice and get its contract. | [`delegation.md`](delegation.md) |
| `fanout_collect` | Merge worker verdicts (worst wins) and close the lease. | [`delegation.md`](delegation.md) |
| `tasks_set` | Register and validate the task manifest (`tasks.yaml`). | [`delegation.md`](delegation.md) |
| `task_dispatch` | Dispatch ready tasks and open leases; returns task cards. | [`delegation.md`](delegation.md) |
| `task_report` | Record a worker's task-result (done becomes reported). | [`delegation.md`](delegation.md) |
| `task_verify` | Record the lead's independent verification of a reported task. | [`delegation.md`](delegation.md) |
| `task_status` | Show manifest state, the ready list and counts. | [`delegation.md`](delegation.md) |
| `sessions_list` | List recorded sessions, newest first. | [`sessions.md`](sessions.md) |
| `sessions_resume` | Look up a session and return per-host resume hints. | [`sessions.md`](sessions.md) |
| `sessions_end` | End a session cleanly; refused while gates are pending or suspended. | [`sessions.md`](sessions.md) |
| `shards_status` | Report runtime status: root, session, state version, config and bindings, active agent, AR lease and run. | section 2 |
| `notebook_start` | Start a persistent Jupyter kernel for a notebook. | [`notebook.md`](notebook.md) |
| `notebook_exec` | Execute one cell against the live kernel. | [`notebook.md`](notebook.md) |
| `notebook_run_all` | Restart the kernel and run every code cell, stopping at the first failure. | [`notebook.md`](notebook.md) |
| `notebook_stop` | Shut down the notebook kernel. | [`notebook.md`](notebook.md) |
| `ar_start` | Start an autonomous-research run: pin immutable paths and the eval command, measure the baseline noise floor, open the AR lease, create `refs/shards/research/<project>/<run>`. With `branch` (AR fan-out): a branch run in its own git worktree `.shards/worktrees/<run>/<branch>`, journaled to `refs/shards/research/<project>/<run>/<branch>`. | [`research.md`](research.md) |
| `ar_iterate` | Run the pinned eval for one iteration, classify GREEN/YELLOW/RED, journal it on the research ref, keep or revert the mutable scope. | [`research.md`](research.md) |
| `ar_status` | Show an AR run; rebuilds it from the research ref's trailers when session state is missing; `resume` adopts it. For a branched run without `branch`: every branch plus a leaderboard (arbitration). | [`research.md`](research.md) |
| `ar_defer` | Queue a decision for a human on an unattended run (retro-revert, pause, floor breach): a `needs-human` commit on the research ref; `retro_revert` restores the kept state before iteration M. The loop continues; `ar_status`/`ar_end` list the items for the Phase 3 gate. | [`research.md`](research.md) |
| `ar_end` | Record the stop reason on the research ref, close the AR lease (a branch leaves the shared lease), end the run; removes a branch run's worktree unless `keep_worktree`. | [`research.md`](research.md) |

- `agent` must list the requested mode in its `activation` field.
- Switch with `project` substitutes it into the agent's `output_dir`, refuses paths that escape the root, and creates the directory if missing. Without `project` it returns `output_dir_template` instead.
- `reground` holds the full re-ground block on switch (section 4). It is empty for other events until E11.7.

**Frame schema.** `frames.json` is `{frames: [...]}`. Index 0 is the base frame and the last element is the top.

```
{ id: 'f<N>-<agent>', agent, mode: 'switch', phase: 0, track: null,
  project: string|null, gates: [], opened_at: ISO }
```

`N` is one more than the highest `N` still on the stack, so ids can repeat after a pop. `push` refuses when the top frame already has the same agent.

**Base frame.** `frames[0]` is whichever frame was pushed first in the session. Nothing enforces that it is `syn`.

- `return()` pops one frame. When only the base remains it is refused unless `pop_base: true`, which empties the stack.
- `return({to: X})` pops everything above the topmost frame for `X`. `X` stays on top, base included. If `X` is not on the stack it is an error. If `X` is already on top, nothing is popped.
- `pop_base` cannot be combined with `to`. Returning from an empty stack is an error.

**Pending gates.** A pop is refused while any popped frame owns a pending gate. A gate belongs to a frame when its `frame` field names that frame's id, or, if it has no `frame` field, when its `agent` matches the frame's agent, or when its id is listed in the frame's `gates`. The error names the gates and agents. `TODO(E5.5)`: suspend with human proof instead of refusing.

**Consult** never pushes a frame, touches no state, and holds no gates. Because `activate` is not sessionless, a session resolution failure also blocks consult.

**Catalog location.** `SHARDS_CORE_DIR` sets the core directory (resolved to an absolute path). Without it, the repo's `core/` is used. The catalog is re-read on every call.
