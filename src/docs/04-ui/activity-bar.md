# Activity Bar

The vertical strip of icons on the left edge of the UI. Switches what appears in the sidebar pane to its right.

## Buttons

| Icon | View | What it shows |
|---|---|---|
| Folder | Explorer | Project file tree |
| Clock | Session Files | Files referenced or opened during this chat session |
| Bookmark | Bookmarks | Files, lines, and symbols you've pinned |
| Branch | Source Control | Git status, changes, diff and PR views |
| Brain | Knowledge Map | Knowledge Ledger entries, graph + card view |
| Book | Guide | This developer guide |

The active button is highlighted. Clicking a button when its view is already active toggles the sidebar collapsed state.

## Explorer

- File tree with lazy-loaded folders.
- Search filters the listing live.
- Switch between tree view and flat list (top-right toggle).
- Click a file to open in the right pane; Cmd+click (or middle-click) opens in a new tab.
- Right-click for context menu: reveal in Finder, copy path, bookmark.

## Session Files

- Populated as the chat agent references files.
- Fastest way to jump back to "the file we were just talking about".
- Shows file path and last-touched timestamp.

## Bookmarks

- Add bookmarks from the editor (star icon on gutter), from the command palette, or via `Cmd+D`.
- Supports file-level, line-level, and symbol-level bookmarks.
- Persists in `.shards/bookmarks.json`.

## Source Control

- Lists changed files with status badges (M / A / D / U).
- Branch name and remote status at the top.
- Click any file to open a diff view.
- PR review: when a PR is checked out, inline comment threads appear.
- See [Git](git.md).

## Knowledge Map

- Card view: one card per ledger entry.
- Graph view: entries clustered by tag and entity references.
- Click a card to open the raw markdown in the editor.
- See [Knowledge Map](knowledge-map.md).

## Guide

- TOC tree on the left of the panel, page content on the right.
- Live search across all guide pages.
- Remembers last-viewed page across browser reloads.
- Also browsable as plain markdown in `docs/shards-guide/`.

## Keybindings

- `Cmd+B` — toggle the sidebar (collapses activity bar view pane).
- `Cmd+Shift+E` — focus Explorer.
- `Cmd+Shift+G` — focus Source Control.
- `Cmd+Shift+B` — focus Bookmarks.

## See also

- [Overview](overview.md)
- [Keybindings](keybindings.md)
