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

### Incremental testing — checkpoint gates between layers

{{protocol incremental_testing}} during this build. Each layer below is a checkpoint seam — after a layer's models all build green and their tests pass, call `gate_request` for a `kind=checkpoint` gate and wait for the user before advancing to the next layer. Do not chain `dbt build` across all layers in one shot and eyeball a pass/fail at the end.

Each checkpoint is a `kind=checkpoint` gate with a `name=` slug, one per layer below (name is `[a-z0-9-]+`, unique within the file, no `validates=`). Pass `evidence={status: pass|fail, checks: [...]}` with the component name, the exact test command you ran, and measured facts (e.g. "df.shape = (48211, 47)", "null rate on join key = 0.00%", "sample head matches expected schema"). Under the default `phase` policy a passing checkpoint is recorded automatically and blocks only on fail or anomaly.

Expected checkpoint names for this phase (in order as you build):

- `{{gate kind=checkpoint name=sources}}` — source definitions compile; `dbt source freshness` (or equivalent) passes.
- `{{gate kind=checkpoint name=staging}}` — all staging models build green; schema tests pass; row counts match source expectations.
- `{{gate kind=checkpoint name=intermediate}}` — intermediate models build green; join fan-out verification queries match Phase 3 predictions.
- `{{gate kind=checkpoint name=marts}}` — mart models build green; grain-uniqueness tests pass; sample output inspected.

If a checkpoint fails, diagnose and call `gate_request` again with updated evidence before advancing. Never confirm your own checkpoint.

Build in order:
1. Source definitions
2. Staging models
3. Intermediate models
4. Mart models
5. Schema files with tests and docs
6. Custom data tests

For each model: write SQL → write .yml → run `dbt build --select +model_name` → fix failures.

**Post-build join verification:** After each model that includes joins builds
successfully, run the Tier 2+ verification queries from the join path protocol
(row count before/after join). If actual fan-out diverges from the predicted
fan-out in Phase 3, halt and diagnose before advancing to the next model.

**Auto-verify mode**: when the layer has 3+ models with joins, the sweep of
count-before / count-after queries is the bulk read-only verification pattern
auto-verify is for. Open `{{auto_verify start tool_budget=20 ttl=600}}` before
the sweep, `{{auto_verify end}}` after (read-only only; gates always win). See
[`protocols/auto_verify_mode.md`](../../../protocols/auto_verify_mode.md).

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
- **Deviations from design:** <changes and why, or "none">
- **Performance notes:** <run time, row counts, anything notable>
```

{{gate kind=phase validates=data-engineer}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Deep Phase 7.
