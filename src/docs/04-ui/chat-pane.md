# Chat Pane

The center column. Live conversation with whichever shard is active.

## Anatomy

```
┌──────────────────────────────┐
│ Agent picker                 │  ← dropdown of all shards
├──────────────────────────────┤
│ Messages                     │
│  · user prompts              │
│  · agent responses           │
│  · tool calls (collapsible)  │
│  · gate blocks               │
├──────────────────────────────┤
│ Selection / pinboard         │
├──────────────────────────────┤
│ Input [Shift+Tab = mode]     │
└──────────────────────────────┘
```

## Agent picker

- Dropdown at the top of the chat pane lists every installed shard.
- Picking an agent inserts the corresponding slash command into the input (`/data-analyst`, `/ml-engineer`, etc.).
- The picker shows the agent's short description on hover.

## Messages

- User prompts render as plain text with light styling.
- Agent responses render as markdown via `renderMarkdown()` (marked.js v4, GFM, code highlighting).
- Tool calls render collapsed by default; click to expand arguments and results.
- `::GATE::…::ENDGATE::` blocks render as highlighted gate cards — visually distinct, harder to miss.

## Search

- `Cmd+F` focuses the chat search bar.
- Navigates matches with up/down arrows.
- Match count shown inline.

## Permission modes

The current permission mode is shown in the HUD. Cycle with `Shift+Tab`:

- **plan** — Claude must present an exit-plan-mode before editing.
- **acceptEdits** — auto-approve file edits.
- **default** — prompt for every tool use.

## Input box

- Multiline supported. `Enter` sends; `Shift+Enter` inserts a newline.
- Slash commands autocomplete as you type.
- File mentions: `@path/to/file` gets expanded inline.
- Drag-and-drop a file from the Explorer onto the input to attach it.

## Pinboard + selection context

Immediately above the input:

- **Pinboard** — files, snippets, and notes you've pinned for this chat.
- **Selection context** — last text/code you selected in the editor is offered as context.

See [Pinboard & Selection](pinboard-selection.md).

## Hook-driven live updates

The chat pane is fed by hook events:

- `UserPromptSubmit` → new user bubble.
- `PostToolUse` → new tool-call card.
- `Stop` → completes the current agent turn.

Events flow through `.shards/event-queue.jsonl` and SSE — the browser does not poll.

## See also

- [Overview](overview.md)
- [Pinboard](pinboard-selection.md)
- [Keybindings](keybindings.md)
