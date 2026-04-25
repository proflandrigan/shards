> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 4: Execute (Gated)

Goal: Build the prototype.

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

### Incremental testing — checkpoint gates between components

Follow `.claude/agents/specific_instructions/shared/incremental_testing.md` during this build. Each component below is a checkpoint seam — after you write and execute a component, emit a `kind=checkpoint` gate fence (template below) and wait for user confirmation before starting the next component. Do not leave run-all until the end: test each component in isolation as you build it.

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

- `applied-ml-scientist-phase-4-checkpoint-data` — data / synthetic-data cell produces expected shape; a sample inspection confirms structure.
- `applied-ml-scientist-phase-4-checkpoint-components` — each framework component forward-passes on dummy input with correct output shape and dtype.
- `applied-ml-scientist-phase-4-checkpoint-smoke-train` — training loop runs for 10-50 steps on a tiny batch; loss decreases (not flat, not NaN).
- `applied-ml-scientist-phase-4-checkpoint-full-train` — full training completes; loss curve plotted; convergence direction matches prediction.
- `applied-ml-scientist-phase-4-checkpoint-eval` — evaluation vs baselines runs; metric table coherent; ablation (if feasible) logged.

The hook blocks all non-read tools while a checkpoint is open. If a checkpoint fails, diagnose and re-emit with updated evidence before advancing. Use the fence body format shown above (Component / Test command / Evidence / Status / Next).

**Create `research/<project_name>/notebooks/framework_prototype.ipynb`:**

Structure the notebook with these sections:
1. **Setup** — imports, configuration, device setup, seed setting
2. **Data** — data loading (real) or synthetic data generation; EDA/visualization
   of a sample to confirm structure
3. **Framework Implementation** — implement each core component cell by cell,
   with markdown explaining each component's role and design choices
4. **Training Loop** — full training loop with logging; run for enough steps to
   verify gradient flow and loss convergence direction
5. **Evaluation** — run against baselines; produce metric table; ablation runs
   if feasible in the prototype
6. **Visualization** — loss curves, learned representations (t-SNE/UMAP if
   applicable), attention maps, or whatever is diagnostic for this architecture

**Create `research/<project_name>/src/` module files:**

Extract reusable components from the notebook into proper Python modules.
Each module should be importable and have clean interfaces. Prefer explicit
over clever.

**Create `research/<project_name>/requirements.txt`**

### Document Phase 4

Append to `project-specs.md`:

```markdown
## Phase 4: Build Log

- **Notebook:** `notebooks/framework_prototype.ipynb`
- **Modules created:** <list of src/ files>
- **Training run summary:**
  - Steps / epochs: <N>
  - Hardware: <GPU/CPU>
  - Training loss trajectory: <converged | diverged | oscillating — describe>
  - Validation metric: <value>
- **Baseline comparison:**
  | Method | Metric | Notes |
  |--------|--------|-------|
  | <baseline> | <value> | — |
  | **Ours** | <value> | — |
- **Known limitations:** <what the prototype doesn't handle yet>
- **Ablation results (if run):** <summary>
```

::GATE:: id=applied-ml-scientist-phase-4 phase=4 kind=phase validates=applied_ml_scientist
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/applied_ml_scientist/phases/phase-5.md` in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
