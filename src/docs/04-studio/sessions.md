# Sessions

The Sessions button in the activity bar lists the durable session history from `.shards/sessions/INDEX.json`, the same index the `shards sessions` CLI reads (see the [sessions command](../05-commands/sessions.md)). It survives server restarts and browser closes. If Studio cannot reach the runtime's session index module (for example when published on its own), the list is empty and chats still run.

## What each row shows

Agent and name, a status pill (`live`, `stalled`, `ended`, `abandoned`), the last phase when known, a short preview of the last prompt, and relative time. Rows are grouped by project directory. Filter buttons narrow the list by status; a refresh button reloads it. A server-start sweep reclassifies stale `active` rows as `abandoned` after 24 hours.

## Resume

Click a row. If the session is live in this Studio process you are switched to its tab; otherwise Studio asks for confirmation and starts a new chat with `--resume <sessionId> --fork-session`. Only `ended` or `abandoned` sessions can be resumed; resuming one that is still running returns a conflict. The new chat gets a new session id and records `resumedFrom` pointing at the original.

Project state (specs, gate state) lives in the project, so a resumed session sees what the original left behind.

## Session Activity

A separate sidebar view, Session Activity, is a live timeline of tool calls for sessions running in the current Studio process. It is in-memory only; use Sessions for history.
