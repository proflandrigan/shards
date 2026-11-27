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

Each task in `shards/<project_name>/tasks.yaml` cites one of these specifications through its `plan_ref`. Components are dependency-ordered tasks, each with an evidence row:

1. `sources` — source definitions compile; `dbt source freshness` (or equivalent) passes.
2. `staging` — staging models (one task per model or small group); each builds green, schema tests pass, row counts match source expectations. Depends on `sources`.
3. Pipeline components (ingestion, orchestration, incremental config) as designed in Phase 3; each with its own acceptance check.
4. Schema files with tests and docs, and custom data tests, belong to the task of the model they describe.

Intermediate and mart models are not built on this track (Analytics Engineer). Every model component comprises its SQL, its .yml, and a `dbt build --select +model_name` run; failures are fixed within the task before it reports.

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

Run the protocol's lead loop on `shards/<project_name>/tasks.yaml` (approved at the plan gate), dispatching up to `max_parallel=3`; each task card cites its `plan_ref`, so workers see only the Component specifications they need. {{protocol incremental_testing}} is task evidence guidance. In addition:

- **Final integration check.** When all tasks are done, the lead runs the full `dbt build` and records the result as an evidence row before the gate.

**SQL loading rule (Python scripts only)** — dbt model files are `.sql` by nature.
If any Python scripts are produced (e.g., data loaders, custom macros, orchestration
helpers), **do NOT embed SQL as Python strings.** Write the SQL to a separate `.sql`
file and read it with `Path.read_text()`:
```python
from pathlib import Path
sql = Path("models/staging/stg_source__table.sql").read_text()
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
