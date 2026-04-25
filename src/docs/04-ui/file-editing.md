# File Editing

The right pane is a Monaco-based editor with specialized renderers for non-code formats.

## Supported formats

| Format | Renderer | Features |
|---|---|---|
| Source code (`.py`, `.js`, `.ts`, `.sql`, …) | Monaco | Syntax highlighting, IntelliSense, Go-to-Definition |
| Markdown (`.md`) | Split view (Monaco + preview) | Live preview, TOC |
| Jupyter notebooks (`.ipynb`) | Cell-based renderer | Per-cell code + output, image rendering |
| CSV / Parquet | Tabular viewer | Sortable/filterable table, schema panel |
| JSON | Tree view + raw | Expand/collapse, copy path |
| Images (`.png`, `.jpg`, `.svg`) | Image viewer | Zoom, pan |
| PDFs | Embedded viewer | Page navigation |

## Editing

- Unsaved changes show a dot on the tab.
- `Cmd+S` saves; autosave can be enabled in settings.
- Multi-cursor: `Cmd+D` adds next occurrence, `Option+click` for additional cursors.
- Find & replace: `Cmd+F` / `Cmd+Option+F`.

## Tabs

- Tabs live above the editor. Drag to reorder.
- `Cmd+W` closes current tab.
- `Cmd+Shift+T` reopens the last closed tab.
- "Close All" and "Split" buttons in the tab bar actions.

## Split view

- `Cmd+\` toggles horizontal split.
- Each split maintains its own tab set.
- Drag a tab between splits to move it.

## Notebook renderer

- Cell types: code, markdown, raw.
- Outputs rendered: stdout, images, HTML, Plotly, Altair.
- Cells are not executable from the UI — editing-only.
- Notebooks produced by Data Scientist / ML Engineer / AI Engineer land here automatically.

## Tabular renderer

- Previews CSV / Parquet / Arrow.
- Column types inferred.
- Filter per column; sort by clicking header.
- Status bar shows row count, column count, memory footprint.

## Markdown preview

- Split-pane live preview with scroll-sync.
- Renders via `renderMarkdown()` — same engine as chat messages.
- Tables, code blocks, mermaid-style diagrams all supported.

## See also

- [Code Intel](code-intel.md)
- [Quick Open & Palette](quick-open-palette.md)
- [Panels](panels.md)
