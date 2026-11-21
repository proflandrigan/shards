> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Deep Phase 6 — Build

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

### Component specifications

Each task in `shards/<project_name>/tasks.yaml` cites one of these specifications through its `plan_ref`. The former layer checkpoints are now dependency-ordered tasks, each with an evidence row:

1. `sources` — source definitions compile; `dbt source freshness` (or equivalent) passes.
2. `staging` — staging models (one task per model or small group); each builds green, schema tests pass, row counts match source expectations. Depends on `sources`.
3. `intermediate` — intermediate models; build green, join fan-out verification queries match Phase 3 predictions. Depends on the staging tasks they read.
4. `marts` — mart models; build green, grain-uniqueness tests pass, sample output inspected. Depends on the intermediate tasks they read.
5. Schema files with tests and docs, and custom data tests, belong to the task of the model they describe.

Every model component comprises its SQL, its .yml, and a `dbt build --select +model_name` run; failures are fixed within the task before it reports.

**Post-build join verification:** After each model that includes joins builds
successfully, run the Tier 2+ verification queries from the join path protocol
(row count before/after join). If actual fan-out diverges from the predicted
fan-out in Phase 3, the task fails and the deviation is reported rather than worked around.

**Auto-verify mode**: when a layer has 3+ models with joins, the sweep of
count-before / count-after queries is the bulk read-only verification pattern
auto-verify is for. Open `{{auto_verify start tool_budget=20 ttl=600}}` before
the sweep, `{{auto_verify end}}` after (read-only only; gates always win). See
[`protocols/auto_verify_mode.md`](../../../protocols/auto_verify_mode.md).

Task acceptance commands name the exact test command and measured facts expected (e.g. "df.shape = (48211, 47)", "null rate on join key = 0.00%", "sample head matches expected schema").

### Lead loop

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

Follow {{protocol delegated_build}}. You are the lead: you dispatch, verify and record; you do not write build code yourself except for `delegate: inline` tasks.

1. **Load the task list.** Load `shards/<project_name>/tasks.yaml` (approved at the plan gate) with `tasks_set`. Fix any rejection (cycle, overlapping owned paths, missing acceptance) with the user before building.
2. **Dispatch.** `task_dispatch` the ready tasks (all `depends_on` done), in parallel up to `max_parallel=3`. Each task card cites its `plan_ref`, so workers see only the Component specifications they need.
3. **Collect.** Each worker returns a result through `task_report`.
4. **Lead verifies every report before it counts.** Re-run (or independently check) the task's acceptance command and compare the outcome with the cited `plan_ref`. Then write a per-task evidence row to the `## Validation` Evidence table (Check = task id + component, Expected, Observed, Pass/Fail). Never mark a task done on the worker's word alone. {{protocol incremental_testing}} is task evidence guidance.
5. **Failures.** Re-dispatch with the failure output as feedback, at most 2 retries; then stop and ask the user with a summary of what failed.
6. **Deviations.** If a worker reports a deviation, or the plan cannot be met, pause dependent tasks and follow {{protocol plan_drift}}; amend the plan only through a confirmed gate.
7. **Unblock.** After each verified task, dispatch the tasks it unblocks.
8. **Final integration check.** When all tasks are done, the lead runs the full `dbt build` and records the result as an evidence row before the gate.

**SQL loading rule (Python scripts only)** — dbt model files are `.sql` by nature.
If any Python scripts are produced (e.g., data loaders, custom macros, orchestration
helpers), **do NOT embed SQL as Python strings.** Write the SQL to a separate `.sql`
file and read it with `Path.read_text()`:
```python
from pathlib import Path
sql = Path("models/marts/mart_name.sql").read_text()
```

### Document Deep Phase 6

```markdown
---

## Deep Phase 6: Build Log (Data Engineer)
- **Files created:**
  - <file path>: <description>
- **Files modified:**
  - <file path>: <what changed>
- **Build validation:**
  - `dbt build` result: Pass | Fail — <details>
  - Tests passing: <N> / <N>
- **Task evidence:** one row per task in the `## Validation` Evidence table (task id, expected, observed, pass/fail)
- **Deviations from design:** <changes and why, or "none">
- **Performance notes:** <run time, row counts, anything notable>
```

{{gate kind=phase validates=data-engineer}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Deep Phase 7.
