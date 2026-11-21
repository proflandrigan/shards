---
name: external-writes
description: Guardrails for writing to external systems (Confluence, Jira, Drive, GitHub) through the host's MCP tools
type: reference
---

# External writes

Git is the source of truth. External systems get one-way copies, written by you through the host's MCP tools. The Shards runtime never writes externally and holds no credentials.

## Rules

- **Only after a confirmed gate.** Write to an external system only for content that belongs to a gate the user has confirmed (`gate_request` returned `confirmed`, `already_confirmed`, `recorded_evidence` or `notice`). Never write mid-phase, and never for a gate that is still pending.
- **Tag every write with its gate.** Put `[shards-gate:<gate_id>]` in the title, body or a property of every external write. The PreToolUse hook reads this marker and checks that the gate is confirmed. A write without a marker, or with a marker for a gate that is not confirmed, is stopped. On Claude Code the user is asked to approve it; on Codex it is denied.
- **An explicit user confirmation also counts.** If the user tells you in chat to write something that is not tied to a gate, ask once, state exactly what will be sent and where, and proceed only after a clear yes. On Claude Code the host will still show a permission prompt for the call.
- **Summaries only.** Send findings, decisions, counts, definitions and next steps. Do not send raw query results, data samples, row-level tables, file dumps or credentials. Raw tabular payloads are refused by the hook unless the project sets `guardrails.allow_raw_data: true`. Link to the git path of the full output instead.
- **Report every write.** After each external write call `copy_report(gate_id, target, ok, error?)`. On failure, report `ok: false` with the error and stop; do not retry in a loop. The runtime queues the copy and shows the queue count in the state header (`q=N`) and in each `gate_request` response.
- **Replay queued copies at the next gate.** When the header shows `q>0` or `gate_request` lists `copy_queue` entries, redo each queued copy through its binding, then call `copy_report` again. A copy that fails five times is marked `stuck`; stop retrying it and tell the user (`shards sync --status` and `shards doctor` list stuck copies).
- **Keep writes idempotent.** Search for an existing item carrying the marker and update it rather than creating a duplicate.
