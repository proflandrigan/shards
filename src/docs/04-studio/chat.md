# Chat

The chat tab runs Claude Code sessions from inside Studio. It is optional: sessions started in a terminal work the same way, and Studio's artifact panels do not depend on the embedded chat.

## How it works

Starting a chat spawns the `claude` CLI in the project directory (stream-json input and output, with `--agent <name>` when you pick a shard, `--permission-mode`, and `--resume` for resumed sessions). Studio streams the output into the pane: user and agent messages, collapsible tool calls, usage, and notices. The transcript is saved under `.shards/sessions/`. Claude Code must be installed and on `PATH`.

## Starting and ending

- `+ New Chat` starts a session; the agent picker lists the agents found in the project's `.claude/agents/`, and picking none starts a plain session.
- `End Chat` ends the active session, flushes the transcript and marks it `ended` in the session index. Gate state belongs to the project, not the chat, so it is untouched. See [Sessions](sessions.md).
- Typing `/` shows slash suggestions built from the project's agents and the skills in `.claude/skills/` and `~/.claude/skills/`.

## Input

- `Enter` sends, `Shift+Enter` inserts a newline.
- `Shift+Tab` cycles the permission mode between **Accept Edits** (read and edit files) and **Plan** (explore and plan, no edits). The current mode is shown on the button beside the input.
- `Cmd+F` searches the transcript.

## Permissions

Studio does not show its own permission cards and installs no Claude Code hooks. Claude Code handles tool approvals itself according to the permission mode and the `permissions.allow` list in `.claude/settings.json` (editable in Settings, see [Workspace](workspace.md)).

## Pinboard and selection context

- Pin files or selections to the chat context from the command palette ("Pin Current File to Context", "Pin Selection to Context") or by dragging an explorer entry onto the chat. Pinned content is attached to your next message; "Clear All Pins" empties it. The status bar shows the pin count.
- Text you select in an editor or markdown view is offered as selection context for the next message.

## Gates in the chat

Gates are runtime tool calls (see the [gate pattern](../03-protocols/gate-pattern.md)). Studio reads gate state from the runtime (`.shards/state/sessions/<key>/gates.json`), never from chat text. While a gate is pending, a banner at the top of the chat shows the gate id, kind, phase and summary, plus the command that confirms it, for example `shards gates confirm <id> --session <key>`. Only a human can confirm, and Studio is read-only, so you run that command in a terminal. The banner clears when the gate is decided. If `SHARDS_GATE_ENFORCE=0` is set in Studio's environment, a second banner notes that gates are advisory.
