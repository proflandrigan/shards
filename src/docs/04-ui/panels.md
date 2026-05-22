# Panels

Panels are rich, structured renderings that agents push to the right pane. Unlike file tabs, panels are ephemeral — they come from a running agent, not the filesystem.

## How panels arrive

An agent invokes UI mode (via the agent's `[UI]` menu option or a dedicated mode file like `research_ui_mode.md`). UI-mode variants emit structured JSON via a hook; `src/ui/js/panels.js` dispatches on `panel.panel` (the panel type) and calls the right renderer.

## Panel types

| Panel | Who pushes it | What it shows |
|---|---|---|
| `data-viewer` | Data Analyst, Analytics Engineer | Query results table, schema, row count |
| `chart` | BI Engineer, Data Analyst | Plotly / Altair / Vega-Lite visualizations |
| `diagram` / `dag` | Analytics Engineer, Data Engineer | DAG of transformations, entity diagrams |
| `experiment-dashboard` | ML Engineer, AI Engineer, Data Scientist (`[EX]` / `[AR]` modes) | Runs table, metric trends, config comparison. AR mode adds auto-decision coloring, cost strip, convergence badge |
| `prompt-lab` | AI Engineer (`[PL]` mode) | Prompt editor, eval dataset, side-by-side outputs, version history |
| `eval-dashboard` | AI Engineer, ML Engineer | Evaluation metrics per variant, confusion matrices |
| `model-card` | ML Engineer, Deep Learning Engineer, Applied ML Scientist | Model card rendered from `model-card.md` template |
| `knowledge-map` | Syn (Knowledge mode) | Ledger entries card/graph view |
| `pr-review` | Syn (PR Review mode) | PR file tree, diff view, threaded comments |
| `brainstorm` | Syn (`[B]` / `/brainstorm`) | Live multi-specialist fan-out: problem + context, specialist cards (queued → thinking → responded with headlines), synthesis buckets, facilitation log, outcome |
| `guide` | Guide activity-bar button | This developer guide |

## Registering a new panel type

Two files:

1. **Renderer** — add a branch in `src/ui/js/panels.js`:
   ```js
   case p.panel === 'my-panel':
     renderMyPanel(container, panel);
     break;
   ```
2. **Push-side** — the agent's `ui_mode.md` or equivalent variant emits the structured payload via the `push` helper.

See `src/ui/js/experiment-dashboard.js`, `prompt-lab.js`, and `knowledge-map.js` as reference implementations.

## Panel persistence

- Panel payloads are logged to the session JSON under `.shards/sessions/<id>/`.
- Re-opening a session re-renders its most recent panels.
- Panels are not saved as files — if you want a permanent artifact, save from the panel's export button (where supported).

## See also

- [File Editing](file-editing.md)
- [Experiment Versioning](../03-protocols/experiment-versioning.md)
- [Autonomous Research](../03-protocols/autonomous-research.md)
