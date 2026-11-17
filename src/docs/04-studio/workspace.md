# Workspace

The Studio window has a vertical activity bar, a sidebar, a main area of tabs (chat, files, panels) with optional split view, and a status bar (HUD) showing git branch, pinned items and estimated context usage.

## Activity bar

| Button | Sidebar view |
|---|---|
| Explorer | Project file tree, with a Tree/List toggle |
| Session Files | Files the chat session has touched |
| Session Activity | Live timeline for sessions running in this Studio process |
| Sessions | Durable history and resume (see [Sessions](sessions.md)) |
| Bookmarks | Pinned files and lines |
| Source Control | Git status and diffs |
| Developer Guide | Opens the guide as a panel |

Bookmarks are stored in the browser (`localStorage`), not in a project file.

## Explorer and editor

- Open any project file from the explorer; each opens in a tab. Close All, and a Split button for two panes.
- The editor is Monaco with syntax highlighting. `Cmd/Ctrl+S` saves; files are written back to the project through the server.
- Notebooks and tabular files (CSV and similar) have their own views; tabular files can be edited and downloaded as CSV.
- Code intelligence: Studio indexes symbols with `ctags` when it is installed and falls back to a regex indexer otherwise. This powers go to definition (`F12`), peek definition, find references (`Shift+F12`) and symbol search.

## Source Control

Lists changed files with status badges, the branch, a repo picker when several repos are present, and opens a diff for a file (a Diff toggle also shows an inline diff in the editor). When the checked-out branch has a GitHub pull request, the PR review panel shows its comments (this uses the `gh` CLI).

## Quick Open and command palette

- `Cmd/Ctrl+P` opens Quick Open: fuzzy match over files known to the current session; an `@` prefix switches to symbol search.
- `Cmd/Ctrl+K` opens the command palette (view toggles, tab and navigation actions, settings, theme, pin actions). Skills found in `.claude/skills/` and `~/.claude/skills/` are added as commands that send the slash command to the active chat.

## Keybindings

`Cmd` on macOS, `Ctrl` elsewhere.

| Key | Action |
|---|---|
| `Cmd+P` | Quick Open |
| `Cmd+K` | Command palette |
| `Cmd+Shift+O` | Go to symbol |
| `Cmd+G` | Go to line (in an editor) |
| `Cmd+,` | Settings |
| `Cmd+B` | Toggle explorer sidebar |
| `Cmd+\` | Toggle split view |
| `Cmd+S` | Save the current file |
| `Cmd+W` | Close the current tab |
| `Cmd+1` | Switch to the chat tab |
| `Cmd+2`, `Cmd+3` | Switch to the first / second open file tab |
| `Cmd+Shift+[`, `Cmd+Shift+]` | Previous / next session tab |
| `Cmd+F` | Search the chat (when chat is focused) |
| `Cmd+Enter` | Notebook: finish editing a cell and move to the next |
| `F12`, `Shift+F12` | Go to definition, find references |
| `Shift+Tab` (in chat input) | Cycle permission mode |
| `Esc` | Close overlay or search bar |

The Monaco editor adds its standard bindings (multi-cursor, comment toggle, and so on).

## Settings

`Cmd+,` opens Settings: theme (light/dark), UI font size, editor font size, Reset Layout, and the permission list described next. Appearance settings live in the browser.

### Permissions

The Permissions section edits the `permissions.allow` list in the project's `.claude/settings.json`, which Claude Code itself reads. Choose the Read-only or Permissive preset, remove entries, or add a custom one such as `find` or `Bash(pytest:*)`. When a permission card in the chat is answered "always allow", Studio adds a prefix pattern (for example `Bash(git status:*)`) to the same file.

## Terminal

An in-app terminal exists in the code but only activates inside an Electron shell, which v2.0 does not ship (ADR 0010). In the browser there is no terminal; use your own.
