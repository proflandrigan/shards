# Code Intel

Symbol indexing, Go-to-Definition, and find-references across the project.

## Under the hood

`src/ui/symbol-index.js` runs on the UI server. On startup it:

1. Tries `ctags` — if available, runs `ctags -R` across the repo.
2. Falls back to a regex-based scanner if ctags is missing.
3. Watches the working tree (`chokidar`) and re-indexes changed files incrementally.

The index is kept in memory; no sidecar file is written.

## What gets indexed

- Functions, classes, methods.
- Top-level variables and constants.
- TypeScript / Python type definitions.
- SQL models (dbt model names) when ctags is configured for `.sql`.

## Symbol search

- `Cmd+T` opens the symbol picker.
- Type to filter across the whole project.
- Enter jumps to the symbol; `Cmd+Enter` opens in a new tab.
- Results show symbol kind (function / class / var) and containing file.

## Go-to-Definition

- `F12` (or right-click → "Go to Definition") on an identifier.
- If a single definition is found, jumps directly.
- Multiple matches open a peek panel listing them.

## Find references

- `Shift+F12` on an identifier.
- Opens a references panel listing each match with file + line + surrounding snippet.
- Click any result to jump.

## Installing ctags

For best results install universal-ctags:

```bash
# macOS
brew install universal-ctags

# Ubuntu/Debian
apt install universal-ctags
```

Without ctags, the regex fallback still provides workable symbol search and Go-to-Definition for Python, JavaScript, TypeScript, and Go — but with lower precision.

## Symbol pins

Code Intel feeds into the pinboard: searching a symbol and pinning it stores a reference that expands to the symbol's definition at prompt time. See [Pinboard](pinboard-selection.md).

## See also

- [File Editing](file-editing.md)
- [Quick Open & Palette](quick-open-palette.md)
