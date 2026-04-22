# Research UI Mode — Data Scientist

The Shards UI is live. Push AR data to the browser as a live dashboard.

## When to push

1. **After Phase 1 (brief confirmed)** — create the dashboard with initial state
2. **After each iteration result is written (Phase 2 Step 8)** — update
3. **On git checkpoint success (Phase 2 Step 9)** — optional refresh
4. **After Researcher consultation (Phase 2 Step 10)** — push so verdict shows live
5. **After Phase 3 finalization** — final update

## How to push

```bash
node .shards/ui/ui-push.js experiment-dashboard \
  --title "AR: <project_name>" \
  --agent "data-scientist" \
  --panel-id "ar-<project_name>" \
  --source "experiments/results.json"
```

Panel type remains `experiment-dashboard` — renderer detects
`mode: "autonomous-research"` and adjusts.

## Status updates

- `"setup"` — after brief
- `"running"` + `"currentExperiment": N` — each iteration
- `"reviewing"` — Phase 3
- `"complete"` — after Phase 3

## Fan-out sessions

Push one panel per branch:

```bash
node .shards/ui/ui-push.js experiment-dashboard \
  --title "AR: <project_name> (branch: <branch-slug>)" \
  --agent "data-scientist" \
  --panel-id "ar-<project_name>-<branch-slug>" \
  --source ".shards/branches/<branch-slug>/experiments/results.json"
```

After arbitration/promotion, push a "converged" panel on the main
`results.json`.

## Important

- `node .shards/ui/ui-push.js` is pre-approved — execute directly.
- Never skip the push due to permission concerns.
- Silent push failure (UI not running) is fine.
