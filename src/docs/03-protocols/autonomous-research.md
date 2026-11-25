# Autonomous Research (AR)

A budget-bounded, self-steering research loop. The specialist proposes a change, evaluates it against a metric, auto-keeps or auto-reverts based on the result, and continues until the budget is exhausted or the metric converges.

Available on: Data Scientist, ML Engineer, AI Engineer, Applied ML Scientist, Deep Learning Engineer. Activated via `[AR]` on each agent's menu.

Use AR when you have a metric and a budget, cannot enumerate the experiments ahead of time, and want adaptive hypotheses. Use `[EX]` experiment mode instead when you have 2 to 3 specific things to try. AR needs a single primary metric and changes that can be reverted with git.

## The core loop

1. **Setup**: you define the metric, the budget (iterations, wall-clock minutes, optional metric floor; a token or dollar ceiling is advisory only) and the starting point. The specialist first checks the knowledge source for prior runs (see [Knowledge](knowledge.md)).
2. **Hypothesis**: the specialist adapts a hypothesis based on prior iterations and the steering document.
3. **Implement**: a small, reversible change to the current candidate.
4. **Evaluate**: run the eval and record the metric.
5. **Auto-keep or auto-revert**: if the metric improved, keep the change, otherwise revert.
6. **Log**: an iteration file, `history.jsonl` and `results.json` are updated, and an experiment checkpoint is made (see [Experiment Versioning](experiment-versioning.md)).
7. **Check**: budget exhausted, converged, or steering updated? If not, go back to step 2.

With the Shards runtime, steps 4 to 6 belong to the runtime, not the specialist. `ar_start` pins the eval harness and measures a baseline noise floor. `ar_iterate` runs the eval itself, classifies the result as GREEN, YELLOW or RED, and keeps or reverts the change. It also commits every iteration, kept or reverted, to the git ref `refs/shards/research/<project>/<run>`, with `AR-*` trailers; your branch is never touched. `ar_status` and `ar_end` report and close the run. After a context loss, the run is rebuilt from that ref. Details: `docs/research.md`.

Phase 0, Phase 1 and Phase 3 stay gated. Facilitate-don't-generate is suspended only for the Phase 2 loop, and the specialist announces that before the Phase 1 gate.

## Key artifacts (under `experiments/`)

| File | Purpose |
|---|---|
| `research_brief.md` | The steering document. You can edit it mid-loop, and the specialist re-reads it every iteration. |
| `history.jsonl` | Iteration-by-iteration log: hypothesis, change, metric, decision. |
| `results.json` | Summary state: best candidate, convergence record, cost, budget remaining. |
| per-iteration markdown | One file per iteration: hypothesis, changes, metrics, auto-decision, reviewer note or self-assessment. |
| research summary | Written in Phase 3 after the loop exits. |

## Steering mid-loop

Edit `experiments/research_brief.md` while the loop runs. The next iteration reads the updated brief and adjusts. This is the "let it run but keep a hand on the wheel" control.

## Unattended loops: the `plan` gate policy

Goal mode is the `plan` gate policy. At the Phase 1 gate the specialist offers an unattended Phase 2. It presents the plan and budget (iterations, wall-clock minutes, metric, target, floor). If you choose unattended, the specialist marks its Phase 1 gate as the plan approval for this run, and you confirm it. The loop then runs without prompts: each iteration's evidence is recorded in `results.json` and the git checkpoint, not gated, and any mid-loop gate is a notice. It stops on a failure, an anomaly or budget exhaustion, and then the next gate waits for you again. An approval covers one run: the next run asks again. The Phase 3 adoption gate always waits for you: it is requested with `requires_human`, which no policy can turn into a notice. When the plan approval and the AR run share a run id, the runtime raises the plan's gate budget to cover the AR budget. On an unattended run, a reviewer retro-revert or pause and a metric floor breach do not stop the loop. The specialist records them with `ar_defer`, the loop continues from a safe state, and the Phase 3 gate lists them for you to confirm. To run overnight, drive a headless host from a shell loop until `shards research status --json` reports `done` (see `docs/research.md`, "Running overnight"). Without plan approval, the default `phase` policy still lets the loop run. Convergence and safety rails are the same either way. See [Gate Pattern](gate-pattern.md).

## Reviewer cadence

- **Every iteration**: the specialist's own self-assessment (metric direction, cost).
- **Periodic**: a reviewer (Researcher, ML Engineer and others, depending on the agent) reviews convergence evidence and methodology. A reviewer can also trigger a retroactive revert.

## Convergence detection

Convergence checks start only after an activation floor of `max(10, budget * 0.2)` iterations, so a hard problem is not stopped early. The loop stops on:

- **Plateau**: no GREEN in the last W iterations (default 5).
- **Diminishing returns**: the best-so-far metric gained less than the threshold (default 2 × epsilon) over the last 2W iterations.
- **Budget exhausted** or **cost ceiling** reached.
- **Consecutive failures** (default 3), after a reviewer consult that may redirect.
- **Metric floor breach** on a full evaluation. This check is always live.
- You pausing via the steering document.

## AR fan-out (DIVERGE composition)

When the approach space itself is unclear, AR can fan out: parallel approach families, each running its own AR loop on its own branch, compared by the Syn Arbiter at the end. This is decided at AR session start only, never mid-loop. See [DIVERGE](diverge.md).

## Studio

The Studio `experiment-dashboard` panel type displays experiment and AR results (see the [Studio](../04-studio/overview.md) section).

## See also

- [DIVERGE](diverge.md)
- [Experiment Versioning](experiment-versioning.md)
- [Gate Pattern](gate-pattern.md)
- Source: `core/protocols/autonomous_research.md`, `core/protocols/goal_mode.md`
