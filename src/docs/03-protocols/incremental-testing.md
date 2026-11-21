# Incremental Testing

The build-time evidence contract for specialists that produce notebooks, pipelines or long scripts. Each task in the task list is one tested component. Its acceptance command is run, the result is recorded as an evidence row, and the lead verifies it before the next dependent component is built.

Used by the ML Engineer, Data Scientist, AI Engineer, Applied ML Scientist, Deep Learning Engineer, Data Engineer, Analytics Engineer and MLOps Engineer during their build phases.

## The problem it solves

Agents used to write a whole notebook or pipeline in one pass and then run it end to end. A silent failure in cell 2 surfaced at the end, often disguised as a hang, with no record of which parts had passed. The protocol enforces a tighter loop: component written, executed in isolation, evidence recorded, lead verification, next component.

## The contract

1. **One tested component per task.** Do not start a task that depends on a component whose evidence is not verified.
2. **A visible acceptance command.** It appears in the task card and the evidence row.
3. **Evidence, not assertion.** Shape, row count, loss value, status code: a measured fact.
4. **Lead verification.** The lead re-runs or independently checks the command and writes the evidence row (Check, Expected, Observed, Pass/Fail) into the `## Validation` evidence table of `project-specs.md`. A task is not done on the worker's word.

The mechanics (task list, dispatch, `task_verify`) are in [Delegated Build](delegated-build.md). Components can also punctuate a build with `kind=checkpoint` gates (see [Gate Pattern](gate-pattern.md)). Under the default `phase` policy a checkpoint is recorded automatically when it carries `evidence.status: "pass"`, and a failure or missing evidence leaves it pending for you. Checkpoints never advance the phase and never carry `validates`.

## What counts as a component

The smallest unit you could debug in isolation: a data load plus sanity print, one dbt model with its tests, one pipeline step, one endpoint handler. A tight group of 2 to 5 notebook cells is one component, one line is not. Too fine defeats the point, too coarse recreates run-all.

## Techniques per artifact type

- **Notebooks:** execute cells programmatically with a per-cell timeout, print shapes and heads after every load or transform, and never add a cell that depends on an unverified predecessor. An output that is empty without raising is a failure, so assert row count. Keep outputs clean (no secrets, summaries over full dumps), install with `%pip` or `%conda`, and never overwrite raw data in place.
- **SQL:** develop with `LIMIT 100`, run `EXPLAIN` on any join of 3 or more tables, check count before and after every join ([Join-Path](join-path.md)), and interrupt dev queries after 60 seconds.
- **ML training:** smoke-fit on 1% of data or less for 1 to 2 epochs, forward-pass one batch first, and overfit a tiny batch on purpose as a sanity check.
- **Transforms:** assert shape, dtype and non-null invariants after every transform.
- **Pipelines and services:** dry-run each step in isolation and hit each new endpoint once before wiring it up.

## Restart and Run All: the final check

Per-task evidence proves each component in isolation, not that the notebook runs clean on a fresh kernel. The lead runs a fresh-kernel full run once, after every task is verified. In Notebook Walkthrough mode that is the `notebook_run_all` tool (restarts the kernel, runs every code cell in order, stops at the first failure and reports it). Standalone, use `jupyter nbconvert --execute --to notebook --inplace <notebook>` and confirm a zero exit code. Set seeds so results reproduce. For the Data Scientist this is check DS-11. Run-all is never a development technique.

## Composition

- With [Validation](validation.md): per-task evidence rows are the phase gate's Evidence table. The validation section is still required at the gate.
- With [Join-Path](join-path.md): the acceptance check runs after the join has been traced and verified.
- With [Experiment Versioning](experiment-versioning.md): task evidence logs the build, experiment checkpoints log results. In experiment and `[AR]` modes both apply.
- With [Knowledge](knowledge.md): cite a pattern found mid-phase in the evidence block.

## Failure modes

Whole-notebook-then-run-all, unbounded SELECT in development, full-data training before a smoke fit, bare `try/except` that hides failures, skipping a check because it is "obviously fine" (merge trivial components into a neighbour instead), and recording evidence without actually running the check.

## See also

- [Delegated Build](delegated-build.md)
- [Gate Pattern](gate-pattern.md)
- Source: `core/protocols/incremental_testing.md`
