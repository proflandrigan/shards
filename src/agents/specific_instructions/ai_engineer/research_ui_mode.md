# Research UI Mode — AI Engineer

The Shards UI is live. Push AR data to the browser as a live dashboard.

## When to push

Push the research dashboard at these points:

1. **After Phase 1 (brief confirmed)** — create the dashboard with initial state
2. **After each iteration result is written (Phase 2 Step 8)** — update
3. **On git checkpoint success (Phase 2 Step 9)** — optional refresh
4. **After reviewer consultation (Phase 2 Step 10)** — push so the verdict shows live
5. **After cost-accounting updates (Phase 2 Step 12)** — push if at a 50%/80%
   warning threshold so the browser shows the warning strip
6. **After Phase 3 finalization** — final update

## How to push

```bash
node .shards/ui/ui-push.js experiment-dashboard \
  --title "AR: <project_name>" \
  --agent "ai-engineer" \
  --panel-id "ar-<project_name>" \
  --source "experiments/results.json"
```

Panel type remains `experiment-dashboard` — renderer detects
`mode: "autonomous-research"` and adjusts.

Using `--source` lets the server watch the file. Re-push after notable
transitions (iteration complete, reviewer verdict, cost warning, convergence).

## Status updates

- `"setup"` — after brief
- `"running"` + `"currentExperiment": N` — each iteration
- `"reviewing"` — Phase 3
- `"complete"` — after Phase 3

## Cost accounting visibility

AI Engineer AR runs can burn cost fast. After every iteration, update
`results.json.costAccounting` (tokens, dollars, reviewer tasks spawned). The
dashboard renders this as a running strip. When cost hits 50% / 80% of the
ceiling, push explicitly so the warning shows in the browser.

## Fan-out sessions

Push one panel per branch using the branch slug:

```bash
node .shards/ui/ui-push.js experiment-dashboard \
  --title "AR: <project_name> (branch: <branch-slug>)" \
  --agent "ai-engineer" \
  --panel-id "ar-<project_name>-<branch-slug>" \
  --source ".shards/branches/<branch-slug>/experiments/results.json"
```

After arbitration/promotion, push a "converged" panel on the main
`results.json`.

## Important

- `node .shards/ui/ui-push.js` is pre-approved — execute directly via Bash.
- Never skip the push due to permission concerns.
- Silent push failure (UI not running) is fine — continue normally.
