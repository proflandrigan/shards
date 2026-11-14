---
name: incremental-testing
description: Shared protocol — test each component as you build it and emit a checkpoint gate before writing the next one
type: reference
---

# Incremental Testing Protocol

When building notebooks, pipelines, or multi-step scripts, you do not write more than one component ahead of your last passing test. After each component, you execute it in isolation, record the evidence (shape, row count, error or success), and record the result with a **checkpoint gate** (`gate_request(kind=checkpoint, evidence={status, checks})`) before you write the next component.

This is what stops a notebook from "hanging" in cell 12 when it actually died silently in cell 2, and what prevents a bad join from running for ten minutes before you realize it needs a `LIMIT`. Run-all is not a development technique — it is the last step after every component has already passed in isolation.

## The Contract

Every build phase eligible for this protocol produces:

1. **One tested component at a time.** You do not write component N+1 until component N has been executed, produced observable evidence, and been recorded at a checkpoint gate.
2. **A visible test command.** The exact command you ran to exercise the component is recorded in the checkpoint evidence. No "I tested it in my head."
3. **Evidence, not assertion.** Shape, row count, loss value, returned status code, sample output — a measured fact, not a claim. (Mirrors the evidence discipline in `validation_protocol.md`.)
4. **A `gate_request(kind=checkpoint, ...)` call.** Under the default `phase` policy a passing checkpoint is recorded automatically and you continue; a `fail` status or an anomaly blocks until a human confirms. Under the `strict` policy a human confirms every checkpoint, so STOP and wait each time.

If any of the four is missing, you are not following the protocol — you are writing-then-running, which is the failure mode this protocol exists to prevent.

## What Counts as a Component

A component is the smallest self-contained unit whose correctness you can check independently. Examples:

| Artifact | Component examples |
|---|---|
| Jupyter notebook | Data load + sanity-print; EDA cell group; feature transform; baseline fit + eval; candidate fit + eval |
| SQL pipeline | One staging model; one intermediate model; one mart model; a join between two CTEs |
| Training script | Dataset loader; model forward pass; single-batch training step; multi-epoch loop |
| Serving code | One endpoint handler; one auth path; one monitoring hook |
| dbt project | One model + its tests; one seed; one snapshot |

A component is **not** the same as "one line of code" or "one cell." A tight group of 2-5 cells that share a single purpose (load data + describe + assert shape) is one component. Breaking too fine defeats the point; leaving too coarse produces the run-all pathology.

When in doubt: **if this piece fails, what would I need to debug in isolation?** That is the component.

## How to Test — Techniques by Artifact Type

### Notebook cells

- **Execute cells programmatically** via Bash rather than eyeballing a run-all. Use `jupyter execute <notebook> --inplace --kernel-name=<kernel>` with a per-cell timeout (`--ExecutePreprocessor.timeout=60`). Inspect the resulting `.ipynb` outputs or check the exit code.
- **Print shapes and heads** immediately after every data load or transform: `print(df.shape); df.head()`. If the shape isn't what Phase 3 predicted, stop.
- **Never introduce a new cell that depends on an untested cell.** If cell 3 hasn't been exercised, do not write cell 4.
- **Watch for the silent-fail pattern.** A cell that runs without raising but whose output is empty (`df` with 0 rows, a plot with no data) counts as a failure — assert row count `> 0` explicitly.
- **Keep cell outputs clean.** Never print secrets, API keys, tokens, or passwords into a cell — load them from the environment (`os.environ` / a `.env` file) and never echo them; they get committed into the `.ipynb` and, in walkthrough mode, streamed into agent context. Prefer summaries (`df.head()`, `df.shape`, `df.describe()`, `.value_counts().head()`) over dumping a full DataFrame — a full dump bloats the notebook and, because the kernel writes outputs back into the `.ipynb` *and* into the agent's context, is a token cost paid on every state read.
- **Install with `%pip` / `%conda`, not `!pip`.** The magics install into the running kernel's own environment; `!pip` shells out and may target a different interpreter, leaving imports silently failing on the live kernel.
- **Never modify or delete raw data in place.** Read source/raw data read-only; write every derived or cleaned artifact to a separate path (`data/derived/`, `results/`). A transform that overwrites its own input is unrecoverable and destroys reproducibility.

### SQL

- **Develop with `LIMIT 100`.** Every query in development carries a limit. Only remove it after the shape, sample, and `EXPLAIN` plan all look right.
- **Run `EXPLAIN` / `EXPLAIN ANALYZE` on any join of 3+ tables** before running the real query. If the plan shows a cross-join or an unbounded scan, stop.
- **Check count-before vs count-after** at every join (see `join_path_protocol.md`). A 10x fan-out that you didn't predict is a component failure, not a "the query took a while."
- **Time out long-running queries.** If a dev query hasn't returned in 60 seconds, interrupt it and diagnose — don't assume it will "finish eventually."

### ML training

- **Smoke-fit on ≤1% of data for 1-2 epochs** before touching the full dataset. Confirm loss decreases. If loss is flat or NaN, stop.
- **Forward-pass one batch** before starting any training loop: feed a single batch through the untrained model, confirm the output shape and dtype match expectation.
- **Overfit a tiny batch on purpose** as a sanity check — if the model cannot memorize 8 examples, the setup is broken and full training will waste hours.
- **Checkpoint after each smoke test passes.** The checkpoint gate is separate from `experiment_versioning.md` DVC/git snapshots — one logs the incremental build, the other logs experiment results.

### Transforms / feature engineering

- **Assert invariants after every transform.** Shape, dtype, non-null rate, unique-key count — whatever the transform should preserve. One line of `assert` costs nothing and catches silent drops.
- **Materialize intermediate outputs** for the first pass. You can stream through at the end; while building, write each stage's output to disk and inspect it.

### Pipeline / service code

- **Dry-run each step in isolation** before chaining. A pipeline that works end-to-end only works if each step works in isolation.
- **Hit new endpoints with `curl` / `httpie` once each** before wiring them into client code.

## Checkpoint Gate Usage

After every component passes its test, call `gate_request` with `kind=checkpoint`. Use a gate name that is kebab-case, agent name + phase number + short component slug (for example `ml-engineer-phase-6-checkpoint-data`, `analytics-engineer-phase-7-checkpoint-staging`, `deep-learning-engineer-phase-4-checkpoint-smoke-fit`).

The call carries an `evidence` object:

```
evidence = {
  status: "pass" | "fail",
  checks: [
    { check: "<what you measured>", observed: "<measured value>", pass: true|false },
    ...
  ]
}
```

Include in `checks` the component name, the exact test command you ran, and the measured facts (for example `df.shape = (48211, 47)`, `null rate on join key = 0.00%`, `sample head matches expected schema`). Also state in the summary what you will build next.

The checkpoint lives *within* a phase and does not advance it. `kind=checkpoint` is what distinguishes it from the `kind=phase` transition gate.

**What happens next depends on the gate policy.**

- `phase` (default): a checkpoint with `evidence.status: "pass"` is recorded automatically and you continue to the next component. A `fail` status or an anomaly opens a pending gate: STOP and wait for the user.
- `strict`: every checkpoint opens a pending gate. STOP and wait for the user each time. Never confirm your own gate; the user confirms via the in-host prompt or by replying in chat.
- `plan`: after the user approved the plan, checkpoints are notices; the loop stops on failure, anomaly, or budget.

**When a checkpoint fails.** If `evidence.status` is `fail`, do not write the next component. Diagnose, fix, re-run the test, and call `gate_request(kind=checkpoint)` again with the updated evidence. A `fail` checkpoint is a stopping point, not a formality to announce before pressing on.

**How many checkpoints per phase.** Usually 2-5. Fewer than 2 means you are batching too much and will rediscover the run-all pathology. More than 5 usually means you are checkpointing individual cells rather than components — combine them.

## Composition with Other Protocols

- **Validation protocol** (`validation_protocol.md`) — still required at the phase gate. Checkpoint evidence feeds the final `## Validation` evidence table but does not replace it.
- **Join path protocol** (`join_path_protocol.md`) — still required *before* writing any join. The checkpoint fires *after* the join has been executed and verified.
- **Experiment versioning** (`experiment_versioning.md`) — checkpoints are build-time; experiment snapshots are result-time. In `[X]` or `[AR]` modes both apply: snapshot after each experiment result, checkpoint after each component within each experiment.
- **Gate pattern** — the phase-level `kind=phase` gate still fires at the end of the phase. Checkpoints do not replace it; they punctuate the build leading up to it.
- **Knowledge checkpoint** (`knowledge_checkpoint.md`) — if a checkpoint surfaces a pattern (known bad distribution, known grain issue), cite it in the Evidence block.

## Restart & Run All — the Final Reproducibility Check

Incremental testing proves each component works *in isolation*. It does **not** prove the notebook runs clean top-to-bottom on a fresh kernel — cells can pass out of order, depend on state left by a since-edited cell, or rely on a variable that no longer exists after a restart. A notebook only truly works if **"Restart Kernel & Run All" completes without error**.

This check runs **once, at the end** — after every component has already passed its checkpoint. It is the final step, never the first execution (see the "Run-all is not a development technique" framing above and the failure mode below).

- **In Notebook Walkthrough mode**, run it with the `notebook_run_all` tool (`session` = the walkthrough session id). The tool restarts the kernel, executes every code cell in order against the fresh kernel, stops at the first failing cell, and returns a per-cell pass/fail roll-up with the first error (`firstError`). Surface the result to the user; on a failure, stop and diagnose — do not declare the notebook done.
- **Standalone** (no walkthrough session), run `jupyter nbconvert --execute --to notebook --inplace <notebook>` (or `jupyter execute <notebook> --inplace`) and confirm a zero exit code.
- **Set seeds** (`numpy`, `random`, and any framework — `sklearn`, `torch`) so the fresh run is deterministic and headline metrics reproduce. A run-all that "works" but produces different numbers each time is not reproducible.

For the Data Scientist this is the **DS-11** validation check (`Restart & Run All: N cells, no errors | seed=42 | log: results/notebook_rerun.log`); the `run-all` subcommand is how that evidence is produced. Other notebook-producing agents apply the same check at their final notebook validation.

## Failure Modes to Avoid

- **Write-whole-notebook-then-run-all.** The pathology this protocol exists to prevent. If your first execution of the notebook is `Restart & Run All`, you are doing it wrong — the hanging-on-cell-12 behavior will return.
- **Unbounded SELECT in development.** A query without `LIMIT` during dev is a time bomb. Keep the limit on until the shape is confirmed.
- **Training on full data before a smoke fit.** "It'll probably work" is how you discover at hour three that the loss has been NaN since step 1.
- **Swallowing exceptions with bare `try/except`.** A cell that catches everything and prints "done" is indistinguishable from a cell that silently failed. Let errors propagate during development.
- **Skipping checkpoints because "this one's obviously fine."** The checkpoint that feels unnecessary is often the one that catches the bug. If it's truly trivial, combine it with the next component — don't skip it.
- **Requesting a checkpoint without running the test.** The `evidence` must reflect a real execution. Writing "Evidence: looks good" makes the checkpoint theater.

## Escape Hatch

Under the `phase` policy passing checkpoints already cost the user nothing. Do not skip checkpoints under time pressure; skipping is exactly how you end up debugging at 2am. Operators who need different behavior change `gates.policy` in `shards.config.yaml`.
