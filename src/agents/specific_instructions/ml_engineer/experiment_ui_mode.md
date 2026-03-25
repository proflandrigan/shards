# Experiment UI Mode — ML Engineer

The Shards UI is live. Push experiment data to the browser as a live dashboard.

## When to push

Push the experiment dashboard at three points:

1. **After Setup (Phase 1 plan confirmed)** — create the dashboard with initial state
2. **After each experiment completes (Phase 2 Step 5)** — update with new results
3. **After Phase 3 finalization** — final update with complete status

## How to push

All pushes use the same command — the UI uses `--panel-id` to update rather than
duplicate:

```bash
node .shards/ui/ui-push.js experiment-dashboard \
  --title "Experiments: <project_name>" \
  --agent "ml-engineer" \
  --panel-id "exp-<project_name>" \
  --source "experiments/results.json"
```

Using `--source` means the server watches the file for changes. After the initial push,
you only need to update `experiments/results.json` — the UI picks up changes
automatically. However, you MAY re-push after significant updates (experiment completion,
status change) to ensure the browser refreshes immediately.

## Status updates

Update `results.json` status field at each transition:
- `"setup"` — after writing the plan (Phase 1)
- `"running"` + `"currentExperiment": N` — when starting each experiment (Phase 2)
- `"reviewing"` — during Phase 3 summary writing
- `"complete"` — after Phase 3 finalization

## Important

- The `node .shards/ui/ui-push.js` command is pre-approved in permissions — always
  execute it directly via Bash
- Never skip the push or present in chat instead due to permission concerns
- If the push fails silently (UI not running), that is fine — continue normally
