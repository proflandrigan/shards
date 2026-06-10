# Incremental Testing

A mid-build contract for specialists that produce notebooks, pipelines, or long scripts. Instead of writing the full artifact and hitting *Run All*, the agent tests each component as it is written and emits a machine-enforced checkpoint gate before starting the next one.

Referenced by ML Engineer, Data Scientist, AI Engineer, Applied ML Scientist, Deep Learning Engineer, Data Engineer, Analytics Engineer, and MLOps Engineer during their build phases.

## The problem it solves

Agents that build Jupyter notebooks and multi-step pipelines used to write the whole artifact in one pass, then run it end-to-end. When cell 2 failed silently or a bad join stalled for minutes, the failure surfaced only at the end — often disguised as a "hang." There was no record of which components had passed before the failure point, and no way to narrow the blast radius.

The incremental testing protocol enforces a tighter loop: **component written → component executed in isolation → evidence recorded → checkpoint gate → user confirms → next component**.

## The check

Between each component, the specialist emits a `kind=checkpoint` gate fence:

```
::GATE:: id=<agent-name>-phase-<N>-checkpoint-<component> phase=<N> kind=checkpoint
Component: <human-readable name>
Test command: <exact command that was run>
Evidence:
  - <measured fact 1>
  - <measured fact 2>
Status: PASS | FAIL — <one-line summary>
Next: <what will be built after confirmation>
Stop here — await explicit confirmation before writing the next component.
::ENDGATE::
```

The `kind=checkpoint` attribute distinguishes these from phase-transition gates: a checkpoint closes without advancing the phase, and never carries `validates=<agent>` — validation evidence is a phase-gate concern that still runs at the end of the build.

While a checkpoint is open, the gate hook blocks all non-read tools (Read/Glob/Grep only). The user confirms with any affirmative ("ok", "yes", "proceed") or explicitly via `::GATE-CONFIRM:: <id>`.

## What counts as a component

One notebook cell or a tight group of cells with a shared purpose, one dbt model, one pipeline step, one endpoint handler — whatever is the smallest unit you could debug in isolation. Usually 2–5 checkpoints per build phase. Fewer and you rediscover run-all; more and you're checkpointing individual lines.

## Techniques per artifact type

- **Notebooks** — execute cells via `jupyter execute … --inplace` with a per-cell timeout; print shapes and heads after every load/transform; never add a cell that depends on an untested predecessor. Keep outputs clean: never print secrets/tokens, prefer `.head()`/`.shape`/summaries over full DataFrame dumps (they bloat the `.ipynb` and, in walkthrough mode, burn agent context), install with `%pip`/`%conda` not `!pip` so it targets the live kernel, and never overwrite raw data in place — write derived artifacts to a separate path.
- **SQL** — develop with `LIMIT 100`; run `EXPLAIN` on any 3+ table join; check count-before vs count-after at every join; time out dev queries at 60s.
- **ML training** — smoke-fit on ≤1% of data for 1–2 epochs before touching the full set; forward-pass a single batch before starting the training loop; overfit a tiny batch on purpose as a sanity check.
- **Transforms** — `assert` shape/dtype/non-null invariants after every transform.
- **Pipeline / service code** — dry-run each step in isolation before chaining; `curl` each new endpoint before wiring it up.

## Restart & Run All — the final reproducibility check

Incremental testing proves each component in isolation; it does not prove the notebook runs clean top-to-bottom on a fresh kernel. The closing check — run **once, after every component has passed** — is a fresh-kernel full run. In Notebook Walkthrough mode this is `notebook-kernel.py run-all <session_id>` (restarts the kernel, runs every cell in order, stops at the first failure, returns a per-cell roll-up with the first error); standalone it's `jupyter nbconvert --execute --to notebook --inplace`. Set seeds so the run is deterministic. This is the evidence the Data Scientist's DS-11 check records. Run-all is never a *development* technique — only the final step.

## Composition

- Still runs **with** the validation protocol — checkpoint evidence feeds the final phase-gate evidence table but does not replace it.
- Still runs **with** the join-path protocol — the checkpoint fires after a join has been executed and verified.
- Separate from **experiment versioning** — DVC/git checkpoints snapshot *results*; this protocol checkpoints *build steps*. In `[X]` and `[AR]` modes both apply.

## Escape hatches

- `SHARDS_CHECKPOINT_ENFORCE=0` — downgrades checkpoint gates to advisory. They're still logged; they don't block tools.
- `SHARDS_GATE_ENFORCE=0` — disables all gate enforcement (phase and checkpoint).

Neither should be a default. They exist for harness issues, not time pressure — skipping incremental testing is exactly how you end up debugging at 2am.

## See also

- [The Gate Pattern](gate-pattern.md)
- [Validation Protocol](validation.md)
- [Join-Path Protocol](join-path.md)
- Source: `src/agents/specific_instructions/shared/incremental_testing.md`
