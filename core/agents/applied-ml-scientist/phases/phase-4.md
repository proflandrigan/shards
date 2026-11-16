> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Create Mode — Phase 4: Execute (Gated)

Goal: Build the prototype.

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

### Incremental testing — checkpoint gates between components

{{protocol incremental_testing}} during this build. Each component below is a checkpoint seam — after you write and execute a component, call `gate_request` with a `kind=checkpoint` gate (macro below) before starting the next component. Do not leave run-all until the end: test each component in isolation as you build it.

Checkpoint gate — pass `evidence={status: pass|fail, checks: [...]}`: put the component name, the exact test command you ran, and the measured facts (e.g. `df.shape = (48211, 47)`, output shapes, loss values) in `checks`. Under the default `phase` policy a passing checkpoint is recorded automatically and blocks only on fail/anomaly. Never confirm your own gate.

{{gate kind=checkpoint name=component-slug}}

Expected checkpoint names for this phase (use as `name`, in order as you build):

- `data` — data / synthetic-data cell produces expected shape; a sample inspection confirms structure.
- `components` — each framework component forward-passes on dummy input with correct output shape and dtype.
- `smoke-train` — training loop runs for 10-50 steps on a tiny batch; loss decreases (not flat, not NaN).
- `full-train` — full training completes; loss curve plotted; convergence direction matches prediction.
- `eval` — evaluation vs baselines runs; metric table coherent; ablation (if feasible) logged.

If a checkpoint fails, diagnose, fix, and call `gate_request` again with updated evidence before advancing.

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

{{gate kind=phase validates=applied-ml-scientist}}

---

## When this gate is confirmed

{{phase 5}} in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
