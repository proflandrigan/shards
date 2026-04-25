# Experiment Versioning

Experiment mode (`[EX]` or `[EXP]` on ML/AI/DS agents) runs fixed-N experiments with versioned checkpoints. Unlike Autonomous Research, experiment mode is human-planned: you decide what to try; the specialist runs each variant and records results.

## Checkpoint mechanism

After each experiment result, the protocol creates a checkpoint. Detection order:

1. **DVC** — if `dvc` is available and the project uses it, the checkpoint is a DVC-tracked snapshot.
2. **Git** — otherwise, the protocol creates a git commit tagged with the experiment name.
3. **None** — if neither is available, the protocol warns and skips checkpointing.

## Artifacts

| File | Purpose |
|---|---|
| `experiments/<project>/runs.jsonl` | One line per experiment: config, metrics, checkpoint ref. |
| `experiments/<project>/<run-id>/` | Per-run directory: config, outputs, logs. |
| `project-specs.md` | Phase documentation as usual; experiment results summarized in the execute phase. |

## UI integration

On ML/AI agents, experiment mode pushes structured output to the UI's `experiment-dashboard` panel: runs table, metric trends, side-by-side config comparison. See [Panels](../04-ui/panels.md).

## Experiment vs. AR

| | Experiment mode | Autonomous Research |
|---|---|---|
| Planning | Human-planned (you list variants) | Specialist adapts hypotheses |
| Stop condition | N runs complete | Budget or convergence |
| Decision-making | Reported to user for decision | Auto-keep/revert |
| Steering | Per-run conversation | `research_brief.md` |

## See also

- [Autonomous Research](autonomous-research.md)
- [DIVERGE](diverge.md)
- Source: `src/agents/specific_instructions/shared/experiment_versioning.md`
