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
| `runtime/tools/shards_status.js` | The one tool today. Reports root, session key, state version, config path, jobs and bindings, gate policy, and active agent. |
| `runtime/state/store.js` | `StateStore`: reads and locked, atomic writes of the state tree. Also `provisionalSessionKey()` and `sanitizeSessionKey()`. |
| `runtime/state/append.js` | `lockedAppend(file, line)`: appends one line under a cross-process lock. Building block for JSONL logs (E2.9). Shares `LOCK_OPTS` with the store. |
| `runtime/header.js` | Builds the one-line state header and derives its fields from the store. |
| `runtime/reground.js` | Re-grounding hook. Stub: returns empty text. Real behavior is E11.7. |
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
```

Notes on what the code does today:

- Session keys must match `[A-Za-z0-9._-]+`, be at most 128 characters, and must not contain `..`.
- Missing files read as defaults. A file that exists but does not parse throws `Corrupt state file ... Refusing to overwrite`. The store never overwrites corrupt state.
- `frames.json` and `gates.json` are read by `shards_status` and the header. No tool in `runtime/tools/` writes them yet. Writers come with the activate and gate work in later stages.
- `global.json` is part of the layout (`update(name, fn, false)` targets it), but nothing in this slice reads or writes it.

**Locking.** Every write goes through `StateStore.update(name, fn)`:

1. Creates the session directory and the `.lock` file.
2. Takes a `proper-lockfile` lock on `.lock` (`stale` 10 s, 40 retries with backoff).
3. Reads the target file and `session.json`, runs `fn`, and writes the result.
4. Releases the lock in `finally`.

**Atomic writes.** `atomicWrite` writes to `<file>.<pid>.<random>.tmp`, fsyncs, then renames over the target. On `EPERM`, `EACCES` or `EBUSY` (typical on Windows) it retries the rename up to 8 times with growing sleeps. On final failure it removes the temp file and rethrows.

**Version counter.** Each `update` bumps `version` in `session.json` by one, inside the same lock as the data write. `getVersion()` reads it without the lock. The header shows this number as `v<N>`.

**Session key (provisional).** `provisionalSessionKey()` returns `mcp-<pid>-<6 hex>`, generated once per server process. This is a stand-in. E2.11 (Stage 3) replaces it with a handshake that uses the `session_id` reported by the host hooks, or with process-ancestry correlation. Do not rely on the key format.

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
| `q` | number of queued items. Always `0` until E6.8. The store has no queue, so the header never sets it. |

Rules:

- Values are sanitized: whitespace, `]`, and `|` become `_`. Empty values become `-`.
- Agent, phase and gate values are clipped to 40 characters at first. If the header is over budget, the agent and gate limits drop by 4 each step, down to a floor of 4.
- The budget is 60 tokens by the estimator `ceil(length / 3.5)`. This is deliberately conservative; real tokenizers average closer to 4 characters per token.
- The header is computed after the handler runs, so it reflects any state change the handler made.
- The header is present on success, on unknown tools, on argument validation failures, and on handler exceptions. Those responses set `isError: true`.

Re-ground hooks (`runtime/reground.js`) are named for four events: `activate`, `load_phase`, `compact`, `version_change`. `regroundHook` is a stub that returns empty text. Nothing calls it yet, apart from being attached to the handler context. The real behavior is E11.7.

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

The legacy hook still uses them through shims. `tools/gate-hook/validation.js`, `tools/gate-hook/sql-guard.js` and `tools/gate-hook/auto-allowlist.js` each contain one line that re-exports from `../../runtime/lib/...`. The shims stay until E11.9 deletes the legacy gate hook.

**Install breakage.** `tools/install.js` copies `tools/gate-hook/` to `.shards/hooks/gate-hook/` in a target project. From there, `../../runtime/lib/` resolves to `.shards/runtime/lib/`, which the installer does not create. Installed legacy hooks would fail to load these modules. The fix is for `tools/install.js` to also copy `runtime/lib/` into the target, for example to `.shards/runtime/lib/`, so the relative path resolves. `install.js` is owned outside this change, so this is not done here.

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

Handshake: `{session_id, source (startup|resume|compact|clear), cwd, ts, pid, ppid_chain: [parent, grandparent, ...]}`. `pid` is the hook process; the host process is a common ancestor of the hook and the MCP server, so E2.11 intersects `ppid_chain` with the MCP process's own ancestry and takes the newest `ts`. Windows records `[process.ppid]` only.

Field assumptions from docs only (not seen in real payloads): Codex payloads, Codex `additionalContext` output shape, `permission_mode` on PreToolUse. Claude Code SessionStart and UserPromptSubmit were observed live (headless `claude -p`). Codex live check: OPEN (external), `TODO(owner: proflandrigan)`.
