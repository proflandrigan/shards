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
