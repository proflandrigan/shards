# Settings & Permissions

User-facing configuration. Open with `Cmd+,` or from the command palette.

## Sections

### Appearance

- Theme: light / dark.
- Editor font family + size.
- Chat font family + size.
- Line wrapping toggle.

### Editor

- Tab size (default 2).
- Autosave (off / on focus change / on timeout).
- Show minimap.
- Show line numbers.

### Chat

- Render markdown (on by default).
- Collapse tool calls by default.
- Show gate blocks inline (on by default).
- Search scope: current session only vs. all sessions.

### Code Intel

- Enable ctags (auto-detects).
- Regex fallback (on if ctags missing).
- Reindex on save vs. debounced.

### Permissions

The permission model for Claude Code tool use. Presets:

- **plan** — Claude must present a plan before modifying files. Safest.
- **acceptEdits** — file edits auto-approved; other tools still prompt.
- **default** — every tool use prompts.
- **bypassPermissions** — *dangerous*. All tools auto-approved. Only for trusted, sandboxed contexts.

Cycle the active mode with `Shift+Tab` from the chat input.

Permission state is held per-session and displayed in the HUD.

## Where settings live

- UI-only settings (theme, fonts, editor prefs) → `localStorage`.
- Permission modes → per-session state, driven by Claude Code.
- `.claude/settings.json` — project-level settings (hooks, permissions allowlist). Edited directly, not from the UI.

## See also

- [Keybindings](keybindings.md)
- [Chat Pane — permission modes](chat-pane.md)
