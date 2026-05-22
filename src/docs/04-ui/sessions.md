# Sessions Panel

The Sessions panel in the activity bar is a durable history of every Shards chat
recorded under `.shards/sessions/INDEX.json`. Unlike the **Session Activity**
timeline (which renders live in-memory state for sessions still spawned in the
current UI process), the Sessions panel survives server restarts, browser
closes, and CLI exits — anything that ever opened a chat shows up here.

## Where it lives

Activity bar → the loopback arrow icon ("Sessions — resume past chats"). The
panel sits alongside Explorer, Git, Session Files, Session Activity, and
Bookmarks.

## What you see

Each row shows:

- **Agent dot + name** — colored by the agent type
- **Status pill** — `live`, `ended`, or `abandoned` (active sessions that haven't
  reported activity in 24h are reclassified as abandoned at server startup)
- **Phase chip** — the last gate phase the session reached, when known
- **Last user prompt** — a short preview of what you said most recently
- **Relative time** — when activity last touched this session

Rows are grouped by project directory (e.g. `analysis/q2_churn`) so you can
scan past work on a particular topic quickly.

## Filtering

Three quick filter buttons sit above the list: **Live**, **Ended**,
**Abandoned**. Click one to filter; click again to clear. This is just a view
filter — the underlying index file isn't modified.

## Resuming a session

Click any row. If the session is still live in the current UI process, you'll
be switched to its chat tab. Otherwise a confirmation dialog appears summarizing
the session (agent, project, phase, last prompt). Confirm and a fresh chat
spawns with `--resume <sessionId>`, bringing the Claude Code transcript back
and dropping you into the same project context.

A few constraints worth knowing:

- Resume only works for `ended` and `abandoned` sessions. Trying to resume a
  live session that's already attached elsewhere returns a 409 from the server.
- The new session gets a new `sessionId`. The `resumedFrom` field on the new
  entry points back at the original — useful for tracing chains of resumes.
- Project state (the on-disk `project-specs.md`, `.shards/gates/state.json`,
  etc.) is shared across resumes since it lives in the project dir, not the
  session. A resumed session sees the same gate state and phase progression
  the original left behind.

## Ending a session

The header has an **End Chat** button next to **+ New Chat**. It calls
`POST /chat/end` for the active session — flushes the transcript, marks the
INDEX entry as `ended`, snapshots any open gate into `gateOpenAtEnd`, and
stops the Claude CLI process. The button is disabled when there is no active
session.

Gate state itself is **not** modified — gates belong to the project, not the
session. If the chat ended mid-phase with a gate open, resuming will land back
at the same gate awaiting the same confirmation.

## CLI parity

The same data is reachable outside the UI. See the
[Slash Command Reference](../05-commands/reference.md) for `/resume` and
`/end`, and run `shards-sessions help` from any project root for the full bin.

## Where the data lives

- `.shards/sessions/INDEX.json` — the durable index this panel reads
- `.shards/sessions/<sessionId>-transcript.json` — per-session transcript dump
- `.shards/sessions/<sessionId>.json` — short-lived in-flight metadata
  (removed when the process exits)

The disk index uses atomic writes (`INDEX.json.tmp` → rename) so concurrent
reads never observe a torn file. The server also runs an abandonment sweep
on startup that reclassifies stale `active` rows past the 24h window.
