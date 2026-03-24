# Experiment Mode UI Integration Plan

## Context

Both ML Engineer and AI Engineer experiment modes write markdown files to `experiments/` but have zero UI integration. The Shards UI has full infrastructure for agent-pushed panels (Tabulator tables, Plotly charts, Mermaid diagrams), SSE event streaming, file watching, and session persistence — but none of it is wired to experiment modes.

The goal is to make experiment visualization so compelling that users *want* the UI running when they experiment.

## Design Decisions

- **Activation**: Requires Shards UI to be running. Agent checks `.shards/ui.port` and loads UI mode variant — same pattern as `data_analyst/ui_mode.md` and `analytics_engineer/ui_mode.md`.
- **Panel model**: Experiment dashboard is a panel tab within the existing session, not a dedicated full-screen view.
- **Persistence**: Browser-side dashboard survives `/compact`. Panel state is retained client-side; agent re-pushes with same `panel-id` to update rather than duplicate.
- **Scope**: Touches both visualization/UX layer and how experiment modes write artifacts — a new `results.json` file provides structured data for the UI.
- **Chart style**: Simple bar and line charts via Plotly.

---

## Goal 1: Experiment Dashboard Panel (new panel type)

A new `experiment-dashboard` panel type that renders as a single tab showing the full experiment session — progress indicator, outcome metric chart, and live results table.

### Tasks

- **1a.** Add `experiment-dashboard` panel type to `src/ui/js/panels.js` — renderer that takes structured experiment data and produces three sections: progress bar, chart, and table
- **1b.** Add `experiment-dashboard` case to `src/ui/server.js` `handleEvent()` for panel creation and `ui-panel-update` for incremental result pushes
- **1c.** Design the data contract — the JSON shape the agent pushes and the dashboard consumes. Must support both initial creation (with plan metadata) and incremental updates (as each experiment completes)
- **1d.** Add CSS for the dashboard layout in `src/ui/index.html` — progress bar styling, chart/table split, status badges (Adopt/Revert/Refine)

---

## Goal 2: Structured Artifact Writing

Restructure experiment modes to write a machine-readable `experiments/results.json` alongside the markdown files. This JSON file is the single source of truth the UI consumes.

### Tasks

- **2a.** Define the `results.json` schema — baseline metrics, per-experiment results (before/after/delta/recommendation), plan metadata, status field
- **2b.** Update `src/agents/specific_instructions/ml_engineer/experiment.md` — after each experiment, agent writes/updates `experiments/results.json` in addition to the per-experiment markdown
- **2c.** Update `src/agents/specific_instructions/ai_engineer/experiment.md` — same changes
- **2d.** Add `experiments/` to the server's `pollFiles()` scan directories so file changes trigger `artifact-updated` events

---

## Goal 3: Experiment UI Mode Files

Create UI mode variants that instruct the agent to push experiment data to the Shards UI as structured panels.

### Tasks

- **3a.** Create `src/agents/specific_instructions/ml_engineer/experiment_ui_mode.md` — instructions for when/how to call `ui-push.js experiment-dashboard` at each phase: dashboard creation at setup, incremental updates after each experiment, final summary push at Phase 3
- **3b.** Create `src/agents/specific_instructions/ai_engineer/experiment_ui_mode.md` — same pattern
- **3c.** Update both `experiment.md` files to detect Shards UI (check `.shards/ui.port` exists) and load the UI mode variant when present — same pattern as `data_analyst/ui_mode.md`
- **3d.** Add `Bash(node .shards/ui/ui-push.js experiment-dashboard:*)` to pre-approved permissions if not already covered by the existing wildcard

---

## Goal 4: Live Progress Tracking

The dashboard shows which experiment is running, how many remain, and updates in real-time as each experiment completes.

### Tasks

- **4a.** Add a `status` field to the dashboard data contract — values: `setup`, `running` (with current experiment index), `reviewing`, `complete`
- **4b.** Agent pushes status updates via `ui-push.js experiment-dashboard --panel-id <id>` with updated status at each phase transition
- **4c.** Browser-side progress bar component in the dashboard — renders N segments, fills completed ones, animates the active one
- **4d.** Ensure dashboard survives `/compact` — the browser retains panel state client-side; if the agent re-pushes after compact, the panel updates rather than duplicates (keyed by `panel-id`)

---

## Goal 5: Metrics Visualization

Bar chart showing outcome metric delta per experiment. Line chart showing cumulative outcome metric value across the experiment sequence.

### Tasks

- **5a.** Dashboard renders a Plotly bar chart of deltas from the structured results data — green for positive, red for negative, with a horizontal line at the success threshold if set
- **5b.** Dashboard renders a Plotly line chart of the outcome metric value over the experiment sequence — baseline as the starting point
- **5c.** Results table below the charts — Tabulator table with columns: #, Name, Outcome Metric (before/after/delta), DS Verdict, Recommendation — with color-coded recommendation badges
- **5d.** Charts and table update live when `ui-panel-update` fires (new experiment result added)

---

## Goal 6: Experiment Comparison (stretch)

Click two experiments in the results table to see a side-by-side metrics diff.

### Tasks

- **6a.** Add row selection to the results table (checkbox or click-to-select)
- **6b.** "Compare" button that opens a split view showing both experiments' full metrics tables side-by-side with delta highlighting
- **6c.** Overlay mode on the bar chart — when two experiments are selected, overlay their full metric sets for visual comparison

---

## Execution Order

1. **Data contract + schema** (2a) — everything depends on this
2. **Artifact writing changes** (2b, 2c, 2d) — agents produce structured data
3. **Dashboard panel type** (1a, 1b, 1c, 1d) — browser can render it
4. **Metrics visualization** (5a, 5b, 5c, 5d) — charts and tables inside the dashboard
5. **Progress tracking** (4a, 4b, 4c, 4d) — live status updates
6. **UI mode files** (3a, 3b, 3c, 3d) — agents know how to push to UI
7. **Comparison view** (6a, 6b, 6c) — stretch goal, only if core is solid

---

## Files Touched

| File | Change |
|------|--------|
| `src/ui/js/panels.js` | New `experiment-dashboard` renderer |
| `src/ui/index.html` | CSS for dashboard layout, progress bar |
| `src/ui/server.js` | Handle new panel type, add `experiments/` to poll dirs |
| `src/ui/ui-push.js` | Support `experiment-dashboard` type |
| `src/agents/specific_instructions/ml_engineer/experiment.md` | Structured artifact writing + UI detection |
| `src/agents/specific_instructions/ai_engineer/experiment.md` | Same |
| `src/agents/specific_instructions/ml_engineer/experiment_ui_mode.md` | **New** — UI push instructions |
| `src/agents/specific_instructions/ai_engineer/experiment_ui_mode.md` | **New** — UI push instructions |

---

## Data Contract: `results.json` Schema

```json
{
  "projectName": "string",
  "agent": "ml-engineer | ai-engineer",
  "outcomeMetric": "string (e.g. 'F1 on test set')",
  "successThreshold": "number | null",
  "baseline": {
    "value": "number",
    "source": "string"
  },
  "plannedCount": "number",
  "status": "setup | running | reviewing | complete",
  "currentExperiment": "number | null",
  "experiments": [
    {
      "index": 1,
      "name": "string",
      "hypothesis": "string",
      "intervention": "string",
      "risk": "Low | Medium | High",
      "metrics": {
        "outcome": { "before": "number", "after": "number", "delta": "number" },
        "secondary": [
          { "name": "string", "before": "number", "after": "number", "delta": "number" }
        ]
      },
      "dsVerdict": "string (excerpt from Data Scientist review)",
      "outcome": "Improvement | Regression | Neutral",
      "recommendation": "Adopt | Revert | Refine"
    }
  ],
  "finalOutcomeMetric": "number | null",
  "netDelta": "number | null",
  "thresholdReached": "boolean | null"
}
```

## Dashboard Panel Data Contract (pushed via `ui-push.js`)

The agent pushes the full `results.json` content as the panel data. The browser-side renderer extracts what it needs:

- **Progress bar**: `plannedCount`, `experiments.length`, `currentExperiment`, `status`
- **Bar chart**: `experiments[].metrics.outcome.delta`, `successThreshold`
- **Line chart**: `baseline.value`, `experiments[].metrics.outcome.after`
- **Results table**: `experiments[]` array mapped to table columns
- **Status badges**: `experiments[].recommendation` → color-coded (green=Adopt, red=Revert, yellow=Refine)

### Push Commands

```bash
# Initial dashboard creation (at setup)
node .shards/ui/ui-push.js experiment-dashboard \
  --title "Experiments: <project_name>" \
  --agent "ml-engineer" \
  --panel-id "exp-<project_name>" \
  --source "experiments/results.json"

# Incremental update (after each experiment) — same panel-id triggers update
node .shards/ui/ui-push.js experiment-dashboard \
  --title "Experiments: <project_name>" \
  --agent "ml-engineer" \
  --panel-id "exp-<project_name>" \
  --source "experiments/results.json"
```

Using `--source` with the file path means the server watches `results.json` for changes and auto-pushes updates to the browser. The agent only needs to write/update the file — the UI reacts automatically.
