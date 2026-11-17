# Autonomous Research (AR)

A budget-bounded, self-steering research loop. The specialist proposes a change, evaluates it against a metric, auto-keeps or auto-reverts based on the result, and continues until the budget is exhausted or the metric converges.

Available on: Data Scientist, ML Engineer, AI Engineer, Applied ML Scientist, Deep Learning Engineer. Activated via `[AR]` on each agent's menu.

Use AR when you have a metric and a budget, cannot enumerate the experiments ahead of time, and want adaptive hypotheses. Use `[EX]` experiment mode instead when you have 2 to 3 specific things to try. AR needs a single primary metric and changes that can be reverted with git.

## The core loop

1. **Setup**: you define the metric, the budget (iterations, cost ceiling, optional metric floor) and the starting point. The specialist first checks the knowledge source for prior runs (see [Knowledge](knowledge.md)).
2. **Hypothesis**: the specialist adapts a hypothesis based on prior iterations and the steering document.
3. **Implement**: a small, reversible change to the current candidate.
4. **Evaluate**: run the eval and record the metric.
5. **Auto-keep or auto-revert**: if the metric improved, keep the change, otherwise revert.
6. **Log**: an iteration file, `history.jsonl` and `results.json` are updated, and an experiment checkpoint is made (see [Experiment Versioning](experiment-versioning.md)).
7. **Check**: budget exhausted, converged, or steering updated? If not, go back to step 2.

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

Goal mode is the `plan` gate policy. At the Phase 1 gate the specialist offers an unattended Phase 2. It presents the plan and budget (iterations, cost ceiling, metric, target, floor) and requests a `plan-approval` gate, which you confirm. After that every later gate (`confirm`, `checkpoint`, `execute`) is a notice and the loop keeps running. It stops on a failure, an anomaly or budget exhaustion, and then the next gate waits for you again. Without it, the default `phase` policy still lets the loop run, with checkpoint and confirm gates auto-recorded when evidence passes. Convergence and safety rails are the same either way. See [Gate Pattern](gate-pattern.md).

## Reviewer cadence

- **Every iteration**: the specialist's own self-assessment (metric direction, cost).
- **Periodic**: a reviewer (Researcher, ML Engineer and others, depending on the agent) reviews convergence evidence and methodology. A reviewer can also trigger a retroactive revert.

## Convergence detection

Convergence checks start only after an activation floor of `max(10, budget * 0.2)` iterations, so a hard problem is not stopped early. The loop stops on:

- **Plateau**: no improvement over several iterations and diminishing returns together.
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
