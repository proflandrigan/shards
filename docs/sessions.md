# Sessions (shards runtime)

Developer notes for the session index and the resume/end flow. Covers `runtime/sessions/index.js`, the `sessions_*` MCP tools, the `shards sessions` CLI, and the legacy `shards-sessions` bin. Describes what the code does today. Open items are marked `OPEN` or `TODO(owner: proflandrigan)`.

## 1. Purpose

Every Shards chat is recorded in a durable index so the user can list past chats, resume one, or close one cleanly. The index is written atomically (tmp file, then rename), so UI polls and tool calls never read a partial file.

- Index file: `.shards/sessions/INDEX.json` under the project root.
- Index module: `runtime/sessions/index.js`. It moved from `src/ui/session-index.js`.
- Writers: Studio (`appendSession`, `updateActivity`, startup sweep) and the runtime itself. `shards-mcp` registers each session it serves in the index (idempotent: `appendSession`, then `touchLiveSession`) and bumps its `lastActivityAt` again on later tool calls, at most once every 5 minutes per session, so a long-lived session is not swept by another server's startup sweep. A row the runtime is serving that a sweep marked `abandoned` goes back to `active` on its next activity bump (and its `gateOpenAtEnd` snapshot is cleared); `ended` rows stay ended. The runtime also runs `sweepAbandoned` once at server start (with `shardsDir`, so `gateOpenAtEnd` is recorded). So `sessions_list` and `sessions_resume` work without Studio. Rows the runtime creates carry no agent, prompt or message count; Studio fills those in when it runs.
- Statuses: `active`, `ended`, `abandoned`. A sweep on startup marks stale `active` rows past 24h as `abandoned`. `sweepAbandoned(sessionsDir, { shardsDir })` also records `gateOpenAtEnd` for each swept row when `shardsDir` is given.
- `gateOpenAtEnd` comes from `readGateOpenId(shardsDir, sessionId?)`: the most recently requested `pending` or `suspended` gate in that session's runtime state (`.shards/state/sessions/<key>/gates.json`), or across all sessions when no id is given. It never throws and returns `null` when nothing is open. Only a project with no `.shards/state/sessions/` at all (un-migrated v1) falls back to the legacy `.shards/gates/state.json`.

## 2. MCP tools

| Tool | Input | Behaviour |
|------|-------|-----------|
| `sessions_list` | `status?`, `limit?` | Lists index rows, most recent first. |
| `sessions_resume` | `id` | Returns the entry and per-host resume hints. Does not change the session. |
| `sessions_end` | `id?` | Closes a session (the current one when `id` is omitted). Replays pending gate git commits (`replayPending`). **Refuses** while the session has suspended or pending gates and lists them. |

Force-close is operator-only: `shards gates force-close`. No agent tool does it.

## 3. CLI

```
shards sessions list   [--root d] [--status s] [--limit n] [--json]
shards sessions show   <id> [--root d] [--json]
shards sessions resume <id> [--root d] [--json]
shards sessions end    [id] [--root d] [--json]
```

`shards-sessions` is the legacy bin and still works with the same subcommands. Use `--json` for scripts.

## 4. Host resume hints

`sessions_resume` returns one hint per host. The hint is text for the user to run or open. The runtime does not re-exec a host.

| Host | Hint | Status |
|------|------|--------|
| Claude Code | `claude --resume <id>` | Used by `/resume`. Run after exiting the current session. |
| Codex | `codex resume <id>` | Docs-only, unverified. Codex is not installed where this was checked. See `docs/compat.md` (CX-*). |
| T3 Code | Thread link in T3 Code | Host-side. The runtime cannot open it. See `docs/compat.md` (T3-4). |

A running session cannot restart itself. The user must exit first.

## 5. Command files

- `src/commands/resume.md`: `sessions_list`, then `sessions_resume` for the chosen ID. No UI.
- `src/commands/end.md`: writes the resume hint to `project-specs.md` when a specialist is active, then `sessions_end`. On refusal it lists the open gates and tells the user the operator resolves them. The agent never force-closes.

## 6. Failure modes

| Symptom | Cause | What to do |
|---------|-------|------------|
| `No Shards sessions on record` | `INDEX.json` missing or empty. | Start a session with `/shards` or a specialist command. |
| `sessions_end` refuses | Suspended or pending gates on the session. | Operator resolves each gate, or runs `shards gates force-close`. |
| Row stuck as `active` | Chat closed without `/end`. | Startup sweep marks it `abandoned` after 24h. Or run `shards sessions end <id>`. |
| `sessions_resume` returns not found | Prefix too short or matches several rows. | Use a longer prefix from `shards sessions list`. |

## 7. Open items

- OPEN: Codex resume syntax is docs-only. Verify on a machine with Codex installed.
- OPEN: T3 Code thread linking depends on the host. See `docs/compat.md` (T3-4).
- TODO(owner: proflandrigan): confirm `sessions_end` replay behaviour on macOS and Windows. Not verified.
