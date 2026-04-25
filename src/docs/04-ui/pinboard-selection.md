# Pinboard & Selection Context

Two mechanisms for feeding context into the chat without typing it out.

## Pinboard

A persistent shelf of items attached to the current chat session. Appears above the input box.

### Pin types

- **File pins** — full file contents included with the next user prompt.
- **Snippet pins** — a range of lines from a file.
- **Note pins** — free-text notes.
- **Symbol pins** — a function, class, or variable resolved via the symbol index.

### Pinning

- From the editor: select text → right-click → "Pin selection".
- From the Explorer: right-click a file → "Pin to chat".
- From the command palette: `Cmd+K` → "Pin file".
- Keyboard: `Cmd+Shift+P` pins the current selection.

### Managing pins

- Click the X on a pin to remove it.
- Drag pins to reorder.
- "Clear pinboard" button clears all.
- Pinboard state persists in `.shards/sessions/<id>/pinboard.json`.

## Selection context

Separate from the pinboard. When you select text in the editor, the selection is offered as **context for the next message only** (not persistent).

- "Include selection" toggle in the input row.
- Auto-cleared after the message is sent.
- Use it when you want one-shot context without managing pins.

## How pins reach the agent

The pin payload is appended to the user prompt before it's sent to Claude:

```
<pins>
  <file path="src/foo.py">...contents...</file>
  <snippet path="src/bar.py" lines="10-30">...</snippet>
  <note>Remember: teacher_activity has hidden grain.</note>
</pins>

<user prompt here>
```

The agent sees the pins as part of the prompt; there is no special tool for them.

## When to use which

| Scenario | Use |
|---|---|
| You'll reference the same file for multiple turns | Pin the file |
| You want to ask one question about a specific block | Selection context |
| You're building up a brief across several messages | Notes pins |
| You want the agent to focus on one function | Symbol pin |

## See also

- [Chat Pane](chat-pane.md)
- [Code Intel](code-intel.md)
