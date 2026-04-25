# Quick Open & Command Palette

Two overlays for fast navigation and action.

## Quick Open — `Cmd+P`

Fuzzy file finder.

- Type to filter files by path.
- `Enter` opens in the active tab; `Cmd+Enter` opens in a new tab.
- Recent files shown first when the input is empty.
- Scope: the entire project working directory.
- Respects `.gitignore` — node_modules, build artifacts, etc., are excluded.

### Modifiers in the input

- `@symbol` — switch to symbol search within the currently open file.
- `#symbol` — switch to project-wide symbol search (equivalent to `Cmd+T`).
- `:42` — jump to line 42 in the currently open file.

## Command Palette — `Cmd+K`

All registered commands.

- Type to filter commands.
- Shows keybindings alongside each command.
- Commands include: toggle panels, switch agents, open settings, change theme, open the guide, and more.

### Common commands

| Command | Default keybinding |
|---|---|
| Open Guide | (via palette) |
| Toggle Split View | `Cmd+\` |
| Toggle Explorer | `Cmd+B` |
| Open Settings | `Cmd+,` |
| Switch Theme | (via palette) |
| Focus Chat | `Cmd+1` |
| Focus Editor | `Cmd+2` |
| Clear Pinboard | (via palette) |
| Reload Window | (via palette) |

New commands are registered in `src/ui/js/command-palette.js`.

## Differences

| | Quick Open | Palette |
|---|---|---|
| Trigger | `Cmd+P` | `Cmd+K` |
| Scope | Files + symbols + lines | Actions |
| Opens something | Always a file/location | Runs a command |

## See also

- [Keybindings](keybindings.md)
- [Code Intel](code-intel.md)
