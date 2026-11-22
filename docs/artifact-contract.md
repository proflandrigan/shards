# Artifact contract

Agents show work in Studio (or any renderer) by calling the `artifact_emit(type, path, meta)` MCP tool. Each call appends one JSON line to `.shards/events.jsonl`. Renderers tail that file. Code: `runtime/tools/artifact_emit.js`, `runtime/lib/events.js`.

## Event envelope (v1)

Schema: [`core/schema/event.schema.json`](../core/schema/event.schema.json).

```json
{"v":1,"ts":"2026-11-14T18:00:00.000Z","session":"s1","agent":"data-analyst",
 "type":"chart","path":"shards/x/chart.json","meta":{"title":"Revenue","panel_id":"rev"}}
```

- `v`: always `1`. A breaking change to the envelope or to a type's required meta bumps `v`; consumers must ignore events with an unknown `v`.
- `agent`: top agent frame at emit time (or null). `session`: host session key.
- `path`: project-relative POSIX path of the file the panel **reads** (absolute paths inside the root are accepted and normalized; escapes and symlink escapes are rejected). Required for every type except `close`.
- `meta`: validated against `core/schema/artifacts/<type>.schema.json` (JSON Schema 2020-12). Errors read `invalid meta for <type>: ...`. Unknown extra fields are allowed.

Panels whose file is rewritten as work progresses (experiment/eval dashboards, prompt lab, brainstorm, notebook walkthrough) are **watched**: emit once, then just rewrite the file. Re-emitting with the same `meta.panel_id` updates the panel in place instead of opening a new one.

## Types

All non-`close` types require `meta.title` (string, tab title) and accept optional `meta.panel_id`.

| type | `path` points at | required meta | optional meta | emitted by |
|------|------------------|---------------|---------------|------------|
| [`data-viewer`](../core/schema/artifacts/data-viewer.schema.json) | CSV, or JSON array of row objects / `{columns,data}` | title | panel_id, row_count | data-analyst, data-modeller |
| [`chart`](../core/schema/artifacts/chart.schema.json) | JSON Plotly spec `{data,layout}` (or traces array) | title | panel_id, chart_type | data-analyst |
| [`dag`](../core/schema/artifacts/dag.schema.json) | text file of Mermaid graph syntax | title | panel_id, format (`mermaid`) | analytics-engineer |
| [`experiment-dashboard`](../core/schema/artifacts/experiment-dashboard.schema.json) | `experiments/results.json` (also AR mode) | title | panel_id, mode, branch | ml-engineer, ai-engineer, data-scientist |
| [`eval-dashboard`](../core/schema/artifacts/eval-dashboard.schema.json) | `eval-results.json` | title | panel_id, variant | ml-engineer, ai-engineer |
| [`model-card`](../core/schema/artifacts/model-card.schema.json) | `model-card.json` | title | panel_id, project | ml-engineer, ai-engineer |
| [`prompt-lab`](../core/schema/artifacts/prompt-lab.schema.json) | `prompt-lab.json` | title | panel_id, project | ai-engineer |
| [`brainstorm`](../core/schema/artifacts/brainstorm.schema.json) | `shards/brainstorm/brainstorm_<project>.state.json` (legacy `brainstorm/...`) | title | panel_id, project | syn |
| [`pr-review`](../core/schema/artifacts/pr-review.schema.json) | JSON `{pr,threads,generalComments,reviews}` | title, pr (integer) | panel_id, url | syn |
| [`notebook-walkthrough`](../core/schema/artifacts/notebook-walkthrough.schema.json) | `.shards/notebook-walkthrough.json` | title, panel_id | session_id, notebook | data-scientist, ml-engineer, syn |
| [`close`](../core/schema/artifacts/close.schema.json) | none (null/omitted) | none | panel_id | any |

File-content shapes are those the renderers read today (`packages/studio/js/panels.js`, `notebook-walkthrough.js`); the meta schemas deliberately do not duplicate them.

## `close`

`artifact_emit(type="close", meta={panel_id})` removes the panel with that id. `path` is null. Meta is free-form; `panel_id` is the only field renderers should rely on.

## Studio-only and retired panels

- `diagram` and `diff` are Studio-only panels (opened by Studio itself); they are not part of the agent-facing contract.
- `knowledge-map` is removed in E4.
- `guide` becomes plain docs (no panel).

## Experiment dashboard and autonomous research runs

Moved from `core/protocols/autonomous_research.md` (F.4/F.5), since it is renderer guidance, not agent instruction.

`experiments/results.json` carries `mode: "experiment"` (or no `mode` in older runs) for `[EX]` runs and `mode: "autonomous-research"` for `[AR]` runs. Studio's experiment-dashboard renderer must detect `mode` and either render an AR view or fall back to the experiment view. An AR view should show:

- the iteration budget (`iterationBudget`; fall back to it where `plannedCount` is absent);
- per-iteration auto-decision colours (green, red, yellow) in the outcome column;
- `lastGreenCommit` and the revert history;
- running cost totals;
- the convergence reason when the run ends.
