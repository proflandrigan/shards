# Shards UI — Overview

A browser-based workspace that sits alongside Claude Code. Provides live chat with any shard, a file editor, agent-pushed panels, git integration, knowledge-map browsing, and the guide you are reading.

## Launching

```bash
shards-ui
```

Or from Claude Code:

```
/shards-ui
```

The server binds to `127.0.0.1` on the first available port in `7842-7845`. Auth tokens are per-process (randomly generated UUIDs, not persisted). The port file at `.shards/ui.port` stores the port and token for the browser.

## Layout

```
┌───────────────────────────────────────────────────────────────┐
│  Header: session bar · theme toggle · connection status       │
├──┬────────────────────────────────────────────────────────────┤
│  │  Workspace                                                 │
│A │  ┌─────────────────────┬──────────────────────────────────┐│
│c │  │  Chat pane          │  File / Panel pane               ││
│t │  │  (agent picker,     │  (Monaco editor, tables,         ││
│i │  │   messages,         │   panels, diagrams, etc.)        ││
│v │  │   pinboard,         │                                  ││
│i │  │   input)            │                                  ││
│t │  │                     │                                  ││
│y │  └─────────────────────┴──────────────────────────────────┘│
│  │                                                            │
│B │  HUD: git branch · pin count · PR comments · context       │
│a │                                                            │
│r │                                                            │
├──┴────────────────────────────────────────────────────────────┤
│  Sidebar (Explorer / Session Files / Bookmarks / Git / KM /   │
│           Guide)                                              │
└───────────────────────────────────────────────────────────────┘
```

## Top-level features

| Feature | Where | Page |
|---|---|---|
| Activity bar (sidebar nav) | Left edge | [Activity Bar](activity-bar.md) |
| Chat with any shard | Center pane | [Chat Pane](chat-pane.md) |
| File editing | Right pane | [File Editing](file-editing.md) |
| Agent-pushed panels | Right pane | [Panels](panels.md) |
| Pinboard & selection context | Above chat input | [Pinboard](pinboard-selection.md) |
| Git status + diffs + PR review | Sidebar + HUD | [Git](git.md) |
| Symbol search, Go-to-Definition | Editor | [Code Intel](code-intel.md) |
| Quick Open (Cmd+P) · Command Palette (Cmd+K) | Overlays | [Quick Open](quick-open-palette.md) |
| Knowledge Map | Sidebar button | [Knowledge Map](knowledge-map.md) |
| Settings & permissions | Cmd+, | [Settings](settings-permissions.md) |
| Guide (this doc) | Book icon | See [Activity Bar](activity-bar.md) |

## Keybindings at a glance

See the full [Keybindings Reference](keybindings.md).

Quick reference:

- `Cmd+P` — Quick Open
- `Cmd+K` — Command Palette
- `Cmd+,` — Settings
- `Cmd+B` — Toggle Explorer
- `Cmd+\` — Toggle split view
- `Cmd+1/2/3` — Switch between chat / file tabs
- `Shift+Tab` — Cycle permission mode (acceptEdits ↔ plan)

## Themes

Light and dark. Toggle in the header (moon/sun icon) or via settings. Theme persists in `localStorage`.

## Hooks

The UI integrates with Claude Code via four hooks configured in `.claude/settings.json`:

- `UserPromptSubmit` — relays user prompts to the UI.
- `Stop` — notifies the UI when the model stops.
- `PostToolUse` — pushes tool call results.
- `PreToolUse` (Bash) — captures Bash invocations.

Hook events flow through `src/ui/relay.js` → `.shards/event-queue.jsonl` → server SSE → browser.

## See also

- [Install & Setup](../01-getting-started/install.md)
- [Panels](panels.md)
- [Keybindings](keybindings.md)
