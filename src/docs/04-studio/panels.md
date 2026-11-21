# Artifact Panels

A panel is a structured view of an artifact an agent emitted. Panels come from `.shards/events.jsonl` (see [Overview](overview.md)), not from the chat stream, and they refresh when the underlying file changes. Closing an artifact (its event) closes the panel.

## Panel types

The 10 types accepted by `artifact_emit`:

| Type | Shows |
|---|---|
| `data-viewer` | Tabular data (sortable table) |
| `chart` | A chart |
| `dag` | A dependency graph |
| `experiment-dashboard` | Experiment results; autonomous-research runs add decision colouring, cost and convergence badges |
| `eval-dashboard` | Evaluation results |
| `model-card` | A model card |
| `prompt-lab` | Prompt editing and evaluation |
| `brainstorm` | Multi-specialist brainstorm: specialist cards, synthesis, outcome |
| `pr-review` | A pull request review |
| `notebook-walkthrough` | A notebook walked cell by cell |

Studio also renders a `diagram` panel (entity or architecture diagrams, drawn with the same renderer as `dag`). It is a Studio panel kind, not one of the 10 `artifact_emit` types.

## Related views

- The Developer Guide opens as a panel from the book icon in the activity bar.
- Git diffs and the PR review view are opened from the [Source Control](workspace.md#source-control) sidebar, not from events.
- Notebooks (`.ipynb`) and CSV/tabular files opened from the explorer render as notebook and table views in the editor area.

## What Studio no longer has

The v1 UI had a Knowledge Map panel and a hook-driven `ui-push` panel channel. Neither is part of the v2 documented surface: panels come only from `artifact_emit` events. See [Knowledge](../03-protocols/knowledge.md) for what replaces the ledger.
