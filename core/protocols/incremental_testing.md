---
name: incremental-testing
description: Shared protocol — task evidence guide: each task is one tested component, checked by its acceptance command and verified by the lead
type: reference
---

# Task Evidence Protocol (incremental testing)

When building notebooks, pipelines, or multi-step scripts, each task in the task list is one tested component. The task's acceptance command is run, the result is recorded as a per-task evidence row in the `## Validation` Evidence table of `project-specs.md`, and the lead verifies it (see {{protocol delegated_build}} and {{protocol validation}}). No more than one component is built ahead of verified evidence.

This stops a notebook from "hanging" in cell 12 when it actually died silently in cell 2, and prevents a bad join from running for ten minutes before anyone notices it needs a `LIMIT`. Run-all is not a development technique. It is the last step, after every task has passed in isolation.

## The Contract

1. **One tested component per task.** Do not start a task that depends on a component whose evidence has not been verified.
2. **A visible acceptance command.** The exact command that exercises the component is in the task card and in its evidence row. No "I tested it in my head."
3. **Evidence, not assertion.** Shape, row count, loss value, returned status code, sample output: a measured fact, not a claim. (Mirrors the discipline in {{protocol validation}}.)
4. **Lead verification.** The lead re-runs or independently checks the acceptance command and writes the evidence row (Check, Expected, Observed, Pass/Fail). A task is not done on the worker's word.

If any of the four is missing, the work is write-then-run, which is the failure mode this protocol exists to prevent.

## What Counts as a Component

A component is the smallest self-contained unit whose correctness you can check independently. Examples:

| Artifact | Component examples |
|---|---|
| Jupyter notebook | Data load + sanity-print; EDA cell group; feature transform; baseline fit + eval; candidate fit + eval |
| SQL pipeline | One staging model; one intermediate model; one mart model; a join between two CTEs |
| Training script | Dataset loader; model forward pass; single-batch training step; multi-epoch loop |
| Serving code | One endpoint handler; one auth path; one monitoring hook |
| dbt project | One model + its tests; one seed; one snapshot |

A component is not "one line of code" or "one cell". A tight group of 2-5 cells that share a purpose (load data, describe, assert shape) is one component. Too fine defeats the point; too coarse produces the run-all pathology. When in doubt: if this piece fails, what would I need to debug in isolation? That is the component, and so one task.

## How to Test — Techniques by Artifact Type

### Notebook cells

- **Execute cells programmatically** via Bash rather than eyeballing a run-all. Use `jupyter execute <notebook> --inplace --kernel-name=<kernel>` with a per-cell timeout (`--ExecutePreprocessor.timeout=60`). Inspect the resulting `.ipynb` outputs or check the exit code.
- **Print shapes and heads** immediately after every data load or transform: `print(df.shape); df.head()`. If the shape isn't what Phase 3 predicted, stop.
- **Never introduce a new cell that depends on an unverified cell.** If cell 3 hasn't been exercised, do not write cell 4.
- **Watch for the silent-fail pattern.** A cell that runs without raising but whose output is empty (`df` with 0 rows, a plot with no data) counts as a failure — assert row count `> 0` explicitly.
- **Keep cell outputs clean.** Never print secrets, API keys, tokens, or passwords into a cell — load them from the environment (`os.environ` / a `.env` file) and never echo them; they get committed into the `.ipynb` and, in walkthrough mode, streamed into agent context. Prefer summaries (`df.head()`, `df.shape`, `df.describe()`, `.value_counts().head()`) over dumping a full DataFrame — a full dump bloats the notebook and, because the kernel writes outputs back into the `.ipynb` *and* into the agent's context, is a token cost paid on every state read.
- **Install with `%pip` / `%conda`, not `!pip`.** The magics install into the running kernel's own environment; `!pip` shells out and may target a different interpreter, leaving imports silently failing on the live kernel.
- **Never modify or delete raw data in place.** Read source/raw data read-only; write every derived or cleaned artifact to a separate path (`data/derived/`, `results/`). A transform that overwrites its own input is unrecoverable and destroys reproducibility.

### SQL

- **Develop with `LIMIT 100`.** Every query in development carries a limit. Only remove it after the shape, sample, and `EXPLAIN` plan all look right.
- **Run `EXPLAIN` / `EXPLAIN ANALYZE` on any join of 3+ tables** before running the real query. If the plan shows a cross-join or an unbounded scan, stop.
- **Check count-before vs count-after** at every join (see `protocols/join_path.md`). A 10x fan-out that you didn't predict is a component failure, not a "the query took a while."
- **Time out long-running queries.** If a dev query hasn't returned in 60 seconds, interrupt it and diagnose — don't assume it will "finish eventually."

### ML training

- **Smoke-fit on ≤1% of data for 1-2 epochs** before touching the full dataset. Confirm loss decreases. If loss is flat or NaN, stop.
- **Forward-pass one batch** before starting any training loop: feed a single batch through the untrained model, confirm the output shape and dtype match expectation.
- **Overfit a tiny batch on purpose** as a sanity check — if the model cannot memorize 8 examples, the setup is broken and full training will waste hours.
- **Record each smoke test as task evidence.** The evidence row is separate from `experiment_versioning.md` DVC/git snapshots: one logs the build, the other logs experiment results.

### Transforms / feature engineering

- **Assert invariants after every transform.** Shape, dtype, non-null rate, unique-key count — whatever the transform should preserve. One line of `assert` costs nothing and catches silent drops.
- **Materialize intermediate outputs** for the first pass. You can stream through at the end; while building, write each stage's output to disk and inspect it.

### Pipeline / service code

- **Dry-run each step in isolation** before chaining. A pipeline that works end-to-end only works if each step works in isolation.
- **Hit new endpoints with `curl` / `httpie` once each** before wiring them into client code.

## Composition with Other Protocols

- **Delegated build** ({{protocol delegated_build}}): defines the task list, the lead loop and who writes the evidence row.
- **Validation protocol** ({{protocol validation}}): still required at the phase gate. Per-task evidence rows are the `## Validation` Evidence table.
- **Join path protocol** (`protocols/join_path.md`): still required before writing any join. The acceptance check runs after the join has been executed and verified.
- **Experiment versioning** (`experiment_versioning.md`): task evidence is build-time; experiment snapshots are result-time. In `[X]` or `[AR]` modes both apply.
- **Sources** ({{protocol sources}}): if a mid-phase search surfaces a pattern (known bad distribution, known grain issue), cite it in the Evidence block.

## Restart & Run All — the Final Reproducibility Check

Per-task evidence proves each component works *in isolation*. It does **not** prove the notebook runs clean top-to-bottom on a fresh kernel — cells can pass out of order, depend on state left by a since-edited cell, or rely on a variable that no longer exists after a restart. A notebook only truly works if **"Restart Kernel & Run All" completes without error**.

The lead runs this check **once, at the end** — after every task is done and its evidence verified. It is the final step, never the first execution (see the "Run-all is not a development technique" framing above and the failure mode below).

- **In Notebook Walkthrough mode**, run it with the `notebook_run_all` tool (`session` = the walkthrough session id). The tool restarts the kernel, executes every code cell in order against the fresh kernel, stops at the first failing cell, and returns a per-cell pass/fail roll-up with the first error (`firstError`). Surface the result to the user; on a failure, stop and diagnose — do not declare the notebook done.
- **Standalone** (no walkthrough session), run `jupyter nbconvert --execute --to notebook --inplace <notebook>` (or `jupyter execute <notebook> --inplace`) and confirm a zero exit code.
- **Set seeds** (`numpy`, `random`, and any framework — `sklearn`, `torch`) so the fresh run is deterministic and headline metrics reproduce. A run-all that "works" but produces different numbers each time is not reproducible.

For the Data Scientist this is the **DS-11** validation check (`Restart & Run All: N cells, no errors | seed=42 | log: results/notebook_rerun.log`); the `run-all` subcommand is how that evidence is produced. Other notebook-producing agents apply the same check at their final notebook validation.

## Failure Modes to Avoid

- **Whole-notebook-then-run-all.** If the first execution of the notebook is `Restart & Run All`, the hanging-on-cell-12 behavior will return.
- **Unbounded SELECT in development.** A query without `LIMIT` during dev is a time bomb. Keep the limit on until the shape is confirmed.
- **Training on full data before a smoke fit.** "It'll probably work" is how you discover at hour three that the loss has been NaN since step 1.
- **Swallowing exceptions with bare `try/except`.** A cell that catches everything and prints "done" is indistinguishable from a cell that silently failed. Let errors propagate during development.
- **Skipping a task's acceptance check because "this one's obviously fine."** The check that feels unnecessary is often the one that catches the bug. If a component is truly trivial, merge it into a neighbouring task rather than skipping its check.
- **Recording evidence without running the check.** The evidence row must reflect a real execution. "Evidence: looks good" is theater.
