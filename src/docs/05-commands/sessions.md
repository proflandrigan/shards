# Sessions

Every Shards chat is recorded in a durable index so you can list past chats, resume one, or close one cleanly. No UI is needed.

- Index: `.shards/sessions/INDEX.json` under the project root, written atomically.
- Statuses: `active`, `ended`, `abandoned`. A sweep at startup marks `active` rows older than 24 hours as `abandoned`.

## From the CLI

```
shards sessions list   [--status active|ended|abandoned] [--limit n] [--root d] [--json]
shards sessions show   <id|prefix> [--root d] [--json]
shards sessions resume <id|prefix> [--root d] [--json]
shards sessions end    [id|prefix] [--root d] [--json]
```

- `list` prints ID (8 characters), agent, status, phase and project, most recent first.
- `show` prints every field of one entry.
- `resume` prints per-host resume hints. It does not change the session or relaunch anything.
- `end` closes a session (the current one when the id is omitted). It replays pending gate git commits first and is refused while the session has pending or suspended gates; the operator resolves those (see [`shards gates`](cli.md#shards-gates)).

A short id prefix is enough. A prefix that is too short or matches several rows returns not found. `shards-sessions` is a deprecated shim that forwards to `shards sessions` and rejects the v1-only flags `--agent` and `--project`; use `shards sessions` instead.

## From inside a session

| Command | Does |
|---|---|
| `/shards:resume` | Lists ended sessions, asks which to resume, and shows the hint for your host. |
| `/shards:end` | Appends a resume hint to `project-specs.md` when a specialist is active, then ends the session. On refusal it lists the open gates and tells you the operator resolves them; the agent never force-closes. |

They use the runtime tools `sessions_list`, `sessions_resume` and `sessions_end`.

## Resume hints

| Host | Hint | Status |
|---|---|---|
| Claude Code | `claude --resume <id>` | Works. Exit the current session first, then run it in a shell. |
| Codex | `codex resume <id>` | Documentation only; unverified. |
| T3 Code | Thread link in the app | Host-side; Shards cannot open it. |

A running session cannot restart itself.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| No sessions on record | `INDEX.json` is missing or empty. Start a session with `/shards:syn` or a specialist skill. |
| `end` refuses | Suspended or pending gates. Resolve each gate, or use `shards gates force-close`. |
| Row stuck as `active` | The chat closed without `/shards:end`. It becomes `abandoned` after 24 hours, or run `shards sessions end <id>`. |
