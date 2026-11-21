# test/golden

Five reference sessions (`sessions/`) plus a scorer (`score.js`), a headless runner (`run-legacy.sh`),
and synthetic fixtures for session 01 (`fixtures/`). See `SCORING_GUIDE.md` for the rubric and formats.

**Status of the E0.4 exit criterion: OPEN.** "The legacy build scores >= 90% on its own guide across 3 runs"
has not been measured. It needs live runs, which cost API budget and require the E0.7 test infrastructure.
The scorer and fixtures are tested offline (`npx vitest run test/golden.test.js`); the fixtures are synthetic,
not real model output.

Run it for real:

```
SHARDS_GOLDEN_LIVE=1 bash test/golden/run-legacy.sh --session 04-data-science-deep-study --runs 3 --project <dir with shards installed>
```

Without `SHARDS_GOLDEN_LIVE=1` the runner prints its plan and exits 0. Live output goes to `test/golden/runs/` (do not commit it).

## Delegated-build harness (E12.9)

`test/golden/delegated-build/` holds a tiny analytics-engineer-style fixture (4 tasks, one dependency diamond-free chain, disjoint
`owned_paths`), `score.js` (scores a finished project dir from `.shards/state/sessions/*/tasks.json` + `project-specs.md`) and `run.sh`.

```
bash test/golden/delegated-build/run.sh --dry-run          # real runtime tools in-process -> synthetic state -> score.js
bash test/golden/delegated-build/run.sh --check-only DIR   # score an existing dir
SHARDS_GOLDEN_LIVE=1 bash test/golden/delegated-build/run.sh --mode parallel|sequential|inline   # ONE live sample
```

Offline coverage: `npx vitest run test/delegated-build-golden.test.js`. A live run is ONE SAMPLE, NEVER A PASS RATE.
Status: OPEN: "3/3 per host" (live-run budget); OPEN: context ratio vs legacy (needs a legacy run, never computed);
OPEN: Codex / other hosts (external, TODO(owner: proflandrigan)); owned-path violations are only measured when a stream transcript exists.
