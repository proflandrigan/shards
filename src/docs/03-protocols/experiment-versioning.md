# Experiment Versioning

Experiment mode (`[EX]` on ML Engineer, AI Engineer and Data Scientist) runs fixed-N experiments with versioned checkpoints. Unlike [Autonomous Research](autonomous-research.md), it is human-planned: you decide what to try, and the specialist runs each variant and records results. The same checkpoint protocol is used by the AR loop.

## Detection

Once during setup the specialist picks a versioning mode and tells you which:

1. **dvc**: `dvc version` succeeds and `.dvc/` exists at the repository root.
2. **git**: otherwise, if the directory is inside a git work tree.
3. **none**: neither is available. Results are tracked in markdown and JSON only.

If uncommitted changes exist outside the experiment directory, the specialist warns you. Checkpoints commit experiment files only.

## Checkpoints

After each experiment's results are written (and before the reviewer is consulted), the specialist stages `experiments/` plus any files it changed, commits with `experiment: <N> <name> - <metric> delta: <delta>`, and creates an annotated tag `exp/<project_name>/<N>-<name>` carrying the metrics. In dvc mode, large artifacts are added with `dvc add` first and `dvc push` is attempted afterwards (skipped with a note if no remote exists). In none mode the step is skipped silently.

If a git or dvc command fails, the specialist warns, records the failure in the experiment file and in `results.json`, and continues the loop without retrying. A failed checkpoint never stops the run.

## Artifacts

| File | Purpose |
|---|---|
| `experiments/results.json` | Top-level `versioningMode`, and per experiment a `checkpoint` object with `type`, `tag` and `commit`. |
| `experiments/experiment_<N>_<name>.md` | The per-experiment result file. |
| `experiments/experiment_summary.md` | Phase 3 summary. With versioning on it ends with a Versioning section: mode, checkpoints created, failures, tag prefix, and the commands to restore (`git checkout exp/<project_name>/<N>-<name>`) or list tags. |

## Parallel branches

When DIVERGE branches or AR fan-out run in parallel they share one repository, so each branch picks a git strategy at spawn time: `branch-local` (its own git branch and namespaced tags, the AR fan-out default), `lockfile` (serialized git operations on a shared ref), or `no-vcs`. See [DIVERGE](diverge.md).

## Experiment versus AR

| | Experiment mode | Autonomous Research |
|---|---|---|
| Planning | Human-planned (you list variants) | Specialist adapts hypotheses |
| Stop condition | N runs complete | Budget or convergence |
| Decision-making | Reported to you for decision | Auto-keep or revert |
| Steering | Per-run conversation | `research_brief.md` |

## Relation to build evidence

Experiment checkpoints log results. Task evidence logs the build (see [Incremental Testing](incremental-testing.md)). In experiment and AR modes both apply.

## See also

- [Autonomous Research](autonomous-research.md)
- [DIVERGE](diverge.md)
- Source: `core/protocols/experiment_versioning.md`
