# Studio

Studio is the optional browser UI for Shards. It is a files-only add-on: it reads what the runtime writes and does not run agents, gates or hooks itself.

## What it is

- Package: `@proflandrigan/shards-studio`
- Bin: `shards-studio`
- Optional. The runtime, the agents and the gates work without it. Nothing in the runtime depends on Studio.
- Desktop build: not planned for v2.0. See [ADR 0010](adr/0010-studio-desktop-build.md).

## How to run

From the project root:

```bash
npx @proflandrigan/shards-studio
```

Studio serves a page on localhost and prints the address. Open it in a browser. It reads the project in the directory you ran it from, so run it there.

## Where its data comes from

Studio has no relay and no runtime hooks. It reads three things:

1. **`.shards/events.jsonl`.** Each `artifact_emit(type, path, meta)` call appends one line. Studio uses these lines to decide which artifact to show and where it lives. The line shape and the rules for `path` are in [`docs/runtime.md`](runtime.md) (section on the events log) and in [`docs/artifact-contract.md`](artifact-contract.md).
2. **The project's output folders.** Studio reads the files at the paths named in the events, and watches them, so a re-written file refreshes its view.
3. **Gate state.** `.shards/state/sessions/<sessionKey>/gates.json`, written by the runtime (see [`docs/gates.md`](gates.md)). Studio polls these files and shows a banner while a gate is `pending`, with the `shards gates confirm` command to run. Studio never parses chat text for gates and never writes gate state. Server routes: `GET /gates`, `GET /gates/stream` (SSE `gate-update` events), `GET /gates/mode`.

Studio's server is same-origin only. It sends no CORS headers, refuses any request whose `Host` is not on its allowed-host list (DNS rebinding), and refuses any request whose `Origin` is not its own origin. The `Host` check applies on every bind address. The page carries a Content-Security-Policy (`connect-src 'self'`, no external images) and rendered markdown is sanitized with DOMPurify. Events whose `path` resolves outside the project (absolute paths, `../`, symlinks) are dropped, never read or broadcast. The gate banner's confirm command includes `--root <project>` so it works from any directory.

Network settings (environment variables read when Studio starts):

- **`SHARDS_BIND`** (default `127.0.0.1`): the address Studio listens on. The allowed hosts are the loopback names (`127.0.0.1`, `localhost`, `[::1]`) and the bind host, each on the port the request arrived on. With `0.0.0.0` or `::` Studio also allows `os.hostname()` and every local interface address (IPv6 in brackets), again on the arrival port; any other name is refused. Binding to `0.0.0.0` without `SHARDS_TLS_CERT`/`SHARDS_TLS_KEY` prints a warning.
- **`SHARDS_ALLOWED_HOSTS`**: comma-separated extra hosts, `host` or `host:port` (IPv6 as `[addr]` or a bare address). An entry without a port matches any port, which is what a reverse proxy needs (its public port differs from Studio's); an entry with a port matches only that port.
- **`SHARDS_TRUST_PROXY=1`**: logs each request with the client address from `X-Forwarded-For`. It does not widen the `Host` check. Behind a proxy the `Host` header is the public name, so list that name in `SHARDS_ALLOWED_HOSTS` (for example `SHARDS_TRUST_PROXY=1 SHARDS_ALLOWED_HOSTS=studio.example.com`), or have the proxy pass `Host: 127.0.0.1:<port>`. Studio warns at startup when `SHARDS_TRUST_PROXY` is set without `SHARDS_ALLOWED_HOSTS`.

Studio writes no Claude Code hooks and shows no permission cards; Claude Code handles approvals itself (for Studio's own headless chat sessions, see Chat sessions below). Its state files are `.shards/studio.pid`, `.shards/studio.port` and `.shards/studio.log`.

If Studio shows nothing, check that the agent has emitted events (`.shards/events.jsonl` exists and has lines) and that the artifact path is inside the project.

## Chat sessions

Studio's chat panel runs `claude -p` headless (`packages/studio/chat-session.js`, `buildClaudeArgs`). Two rules make agent start work on Claude Code 2.1.329:

- **No `--agent` for v2 agents.** With the v2 plugin, `--agent <id>` resolves to the plugin's consult subagent (`agents/<id>.md`), which has no MCP tools, so `activate` cannot be called. Every session starts plain and the activation prompt asks the model to call `activate` with `mode="switch"`. The v1 `.claude/agents` and `.claude/commands` layout is not read.
- **Pre-allowed runtime tools.** Headless `-p` cannot show a permission prompt, so any tool not pre-allowed is denied. Studio passes `--allowedTools` with `STUDIO_ALLOWED_RUNTIME_TOOLS` under both prefixes (`mcp__plugin_shards_shards__` for the plugin, `mcp__shards__` for a `claude mcp add shards` registration). It deliberately leaves out `gate_advance`, `gate_confirm`, `gate_suspend` and `gate_force_close` (they need a human prompt, the user's verbatim reply, or an operator), `auto_verify_start` (widens auto-approval) and `notebook_start`/`notebook_exec`/`notebook_run_all` (run code). A gate opened from a Studio chat is therefore confirmed outside the chat, with `shards gates confirm` (the gate banner shows the command). A test keeps every `runtime/tools/*.js` tool in exactly one of the two lists.

A denied tool call (`permission_denied` in the stream) is logged to `.shards/studio.log` and shown as a notice in the chat.

## Artifact types

Studio renders the 10 artifact types that `artifact_emit` accepts:

| Type | Shows |
|------|-------|
| `data-viewer` | Tabular data |
| `chart` | A chart |
| `dag` | A dependency graph |
| `experiment-dashboard` | Experiment results |
| `eval-dashboard` | Evaluation results |
| `model-card` | A model card |
| `prompt-lab` | Prompt editing and evaluation |
| `brainstorm` | Brainstorm results from several specialists |
| `pr-review` | A pull request review |
| `notebook-walkthrough` | A notebook walked cell by cell |

Studio also has two Studio-only panels, `diagram` and `diff`. They are not among the 10 types above.

## Retired commands

The `/shards-ui` and `/shards-guide` commands are retired. Start Studio with `npx @proflandrigan/shards-studio` instead.

## Developer Guide

The Developer Guide is the markdown tree under `src/docs/` with its `manifest.json` as the table of contents. Studio's guide panel reads that one manifest; there is no separate copy. It looks for the guide in this order: the project's `docs/shards-guide/` (the installed copy), `docs/` inside the Studio package, then `src/docs/` of a monorepo checkout. When you add or remove a guide page, update `src/docs/manifest.json` only. The published package carries its own copy: `npm pack`/`npm publish` in `packages/studio` runs `prepack` (`node scripts/pack-docs.js copy`, which copies `src/docs` into `packages/studio/docs/`) and `postpack` (removes it again). `packages/studio/docs/` is gitignored; never edit it.

## Standalone install

Installed from npm, Studio cannot reach the repo's `runtime/` (`server.js` requires `../../runtime/sessions/index.js` and `../../runtime/agents.js`). Both requires are optional and Studio still starts, serves the guide, artifacts and the gate banner. What a standalone install cannot do:

- **Sessions index.** The runtime writes `.shards/sessions/INDEX.json` (not under `.shards/state/`, which holds per-session gate and state files). Without the runtime, Studio reads that file read-only: the Sessions panel (`GET /sessions/index`) still lists sessions, but Studio does not add to or sweep the index.
- **Agent list.** Without `runtime/agents.js`, Studio reads `agents-catalog.json` in its own package, generated from `core/agents/*/agent.yaml` by `prepack` (`scripts/pack-docs.js`; gitignored). There is no fallback to `.claude/agents`; a checkout that bypasses `npm pack` and lacks `runtime/` lists no agents.

