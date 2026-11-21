# Studio

Studio is the optional browser UI for Shards. It is a local web page that shows the artifacts agents produce, lets you browse and edit project files, and has an embedded chat that runs Claude Code. The runtime, the agents and the gates work the same with or without it.

Studio replaces the v1 web UI. It does not need the v1 hook setup, and the runtime does not depend on it.

## Launch

Package: `@proflandrigan/shards-studio`, bin `shards-studio`, Node 18 or newer. The package is not published yet (see `docs/release.md` in the repo); today you run it from a source checkout, for example `node packages/studio/bin/shards-studio.js`.

```bash
shards-studio [start] [--project <dir>] [--port <n>] [--no-open]
shards-studio stop   [--project <dir>]
shards-studio status [--project <dir>]
```

- `start` is the default. It runs the server in the background for the project (`--project`, default the current directory), waits for it, prints `http://localhost:<port>` and opens the browser (skip with `--no-open`). If Studio is already running for that project it just prints the address.
- The server is bound to localhost and picks the first free port in 7842-7845. `--port <n>` or the `SHARDS_STUDIO_PORT` environment variable pins one.
- State files live in the project's `.shards/` directory: `studio.pid`, `studio.port` (port plus a per-process auth token) and `studio.log`.
- There is no desktop build in v2.0 (ADR 0010); Studio is browser-only.

## Where its data comes from

Studio reads files; it does not run agents or gates itself.

1. `.shards/events.jsonl`. Each `artifact_emit(type, path, meta)` call from the runtime appends one line. Studio replays the file on start, then tails it, and turns each line into a panel. Line shape: `core/schema/event.schema.json`; rules for `path`: `docs/artifact-contract.md`.
2. The files at the paths named in those events, which Studio watches so a rewritten file refreshes its panel.
3. `.shards/state/sessions/<key>/gates.json`, the runtime's gate state, for the gate banner in the chat. Read-only.
4. `.shards/sessions/INDEX.json`, the durable session index written by the runtime, for the [Sessions](sessions.md) panel.
5. The project tree itself, for the file explorer, editor and git views.

If a panel does not appear, check that `.shards/events.jsonl` exists and has lines, and that the artifact path is inside the project.

## The embedded chat

Studio can also start Claude Code sessions itself (it spawns the `claude` CLI with stream-json I/O) and shows the conversation in the chat pane. This is a convenience, not a requirement: you can keep using Claude Code in a terminal and use Studio only as a viewer. See [Chat](chat.md).

## Pages

- [Artifact panels](panels.md): what each panel type shows.
- [Workspace](workspace.md): activity bar, explorer, editor, git, quick open, command palette, keybindings, settings.
- [Chat](chat.md): the embedded chat, permission modes, pinboard and selection context.
- [Sessions](sessions.md): the session history and resume.
