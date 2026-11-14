# Research UI Mode — ML Engineer

The Shards UI is live. Push AR data to the browser as a live dashboard.

## When to push

Push the research dashboard at these points:

1. **After Phase 1 (brief confirmed)** — create the dashboard with initial state
2. **After each iteration result is written (Phase 2 Step 8)** — update with new results
3. **On git checkpoint success (Phase 2 Step 9)** — optional refresh to ensure
   tag/commit fields are visible
4. **After reviewer consultation (Phase 2 Step 10)** — update so the reviewer
   verdict shows live
5. **After Phase 3 finalization** — final update with complete status

## How to push

All pushes use the same command — the UI uses `--panel-id` to update rather
than duplicate:

```bash
node .shards/ui/ui-push.js experiment-dashboard \
  --title "AR: <project_name>" \
  --agent "ml-engineer" \
  --panel-id "ar-<project_name>" \
  --source "experiments/results.json"
```

The panel type remains `experiment-dashboard` — the dashboard renderer
detects `mode: "autonomous-research"` in `results.json` and adjusts the view
(iteration budget instead of plannedCount, color-coded auto-decisions, cost
accounting strip). If a future AR-specific panel type ships
(`research-dashboard`), switch the panel name then.

Using `--source` means the server watches the file for changes. After the
initial push you only need to update `experiments/results.json` — the UI picks
up changes automatically. You MAY re-push after significant transitions
(iteration complete, convergence detected, reviewer verdict received) to
ensure the browser refreshes immediately.

## Status updates

Update `results.json.status` at each transition:
- `"setup"` — after Phase 1 brief
- `"running"` + `"currentExperiment": N` — when starting each iteration (Phase 2)
- `"reviewing"` — during Phase 3 summary writing
- `"complete"` — after Phase 3 finalization

## Fan-out sessions

For AR fan-out, push one panel **per branch** using the branch slug:

```bash
node .shards/ui/ui-push.js experiment-dashboard \
  --title "AR: <project_name> (branch: <branch-slug>)" \
  --agent "ml-engineer" \
  --panel-id "ar-<project_name>-<branch-slug>" \
  --source ".shards/branches/<branch-slug>/experiments/results.json"
```

Each branch's `results.json.branchContext` field identifies it. After
arbitration and promotion, push a final "converged" panel pointing at the
main `<project_dir>/experiments/results.json`.

## Important

- The `node .shards/ui/ui-push.js` command is pre-approved in permissions —
  always execute directly via Bash.
- Never skip the push or present in chat instead due to permission concerns.
- If the push fails silently (UI not running), that is fine — continue normally.
