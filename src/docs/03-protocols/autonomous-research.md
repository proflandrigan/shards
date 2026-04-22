# Autonomous Research (AR)

A budget-bounded, self-steering research loop. The specialist proposes a change, evaluates it against a metric, auto-keeps or auto-reverts based on the result, and continues until the budget is exhausted or the metric converges.

Available on: Data Scientist, ML Engineer, AI Engineer, Applied ML Scientist, Deep Learning Engineer. Activated via `[AR]` on each agent's menu.

## The core loop

1. **Setup** — user defines the metric, the budget (iterations or wall clock), and the starting point.
2. **Hypothesis** — the specialist adapts a hypothesis based on prior iterations and the steering document.
3. **Implement** — small, reversible change to the current candidate.
4. **Evaluate** — run the eval, record the metric.
5. **Auto-keep / auto-revert** — if the metric improved, keep the change; if not, revert.
6. **Log** — append to `history.jsonl` and `results.json`.
7. **Check** — budget exhausted? Converged? Steering document updated? If not, go back to step 2.

## Key artifacts

| File | Purpose |
|---|---|
| `research_brief.md` | The steering document. The user can edit it mid-loop; the specialist reads it each iteration. |
| `history.jsonl` | Iteration-by-iteration log: hypothesis, change, metric, decision. |
| `results.json` | Summary state — best candidate so far, convergence estimate, budget remaining. |
| `report.md` | Phase 3 research summary written after the loop exits. |

## Steering mid-loop

The user can edit `.shards/research_brief.md` while the loop is running. The next iteration reads the updated brief and adjusts hypothesis generation accordingly. This is Shards' answer to "I want to let it run but keep a hand on the wheel."

## Dual reviewer cadence

The AR loop invokes two review cadences:

- **Every iteration** — the specialist's own self-assessment (metric direction, cost).
- **Periodic** — a reviewer (Researcher, ML Engineer, etc.) reviews convergence evidence and methodology. Cadence varies per agent.

## Convergence detection

The loop auto-stops if:

- Budget exhausted.
- Metric has plateaued for N iterations.
- Specialist has produced N consecutive auto-reverts.
- User explicitly pauses via the steering document.

## AR fan-out (DIVERGE composition)

Section H of the protocol covers AR fan-out: multiple parallel approach families, each running its own AR loop. Used when the approach space itself is unclear — each DIVERGE branch runs AR, and Syn Arbiter compares the best candidates across branches at the end.

## UI integration

On Tier-1 agents (ML/AI/DS), AR mode pushes structured output to the UI's `experiment-dashboard` panel. The renderer detects `mode: "autonomous-research"` in `results.json` and renders AR enrichments: auto-decision color coding, cost strip, convergence badge.

## See also

- [DIVERGE](diverge.md)
- [Experiment Versioning](experiment-versioning.md)
- [UI Panels](../04-ui/panels.md) — experiment-dashboard
- Source: `src/agents/specific_instructions/shared/autonomous_research.md`
