> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Deep Phase 6 — Build

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

### Incremental testing — checkpoint gates between layers

Follow `.claude/agents/specific_instructions/shared/incremental_testing.md` during this build. Each layer below is a checkpoint seam — after a layer's models all build green and their tests pass, emit a `kind=checkpoint` gate fence (template below) and wait for user confirmation before advancing to the next layer. Do not chain `dbt build` across all layers in one shot and eyeball a pass/fail at the end.

Checkpoint gate fence — emit exactly this shape. Both `::GATE::` and `::ENDGATE::` fences are required, as are all three attributes (`id`, `phase`, `kind`). No prose outside the fence.

```
::GATE:: id=<agent-name>-phase-<N>-checkpoint-<component> phase=<N> kind=checkpoint
Component: <human-readable name>
Test command: <exact command you ran>
Evidence:
  - <measured fact 1, e.g. "df.shape = (48211, 47)">
  - <measured fact 2, e.g. "null rate on join key = 0.00%">
  - <measured fact 3, e.g. "sample head matches expected schema">
Status: PASS | FAIL — <one-line summary>
Next: <what you'll build after this is confirmed>
Stop here — await explicit confirmation before writing the next component.
::ENDGATE::
```

Expected checkpoint gate IDs for this phase (emit in order as you build):

- `data-engineer-deep-phase-6-checkpoint-sources` — source definitions compile; `dbt source freshness` (or equivalent) passes.
- `data-engineer-deep-phase-6-checkpoint-staging` — all staging models build green; schema tests pass; row counts match source expectations.
- `data-engineer-deep-phase-6-checkpoint-intermediate` — intermediate models build green; join fan-out verification queries match Phase 3 predictions.
- `data-engineer-deep-phase-6-checkpoint-marts` — mart models build green; grain-uniqueness tests pass; sample output inspected.

The hook blocks all non-read tools while a checkpoint is open. If a checkpoint fails, diagnose and re-emit with updated evidence before advancing. Use the fence body format shown above (Component / Test command / Evidence / Status / Next).

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
auto-verify is for. Open `::AUTO-VERIFY:: agent=data-engineer phase=6` before
the sweep, `::ENDAUTO::` after. See
`specific_instructions/shared/auto_verify_mode.md`.

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

::GATE:: id=data-engineer-deep-phase-6 phase=6 kind=phase validates=data_engineer
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_engineer/phases_deep/phase-7.md` in full and follow its instructions starting from Deep Phase 7.
