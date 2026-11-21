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

{{protocol delegated_build}}

You are the lead of this build. The prototype is built as delegated tasks, one
tested component each; you dispatch, verify and record.

### Component specifications

Task cards cite these sections via `plan_ref`; workers only see the sections a
card references. Components, in build order (each is one task, or a short chain
of tasks):

- `data` — data / synthetic-data cell produces expected shape; a sample inspection confirms structure.
- `components` — each framework component forward-passes on dummy input with correct output shape and dtype.
- `smoke-train` — training loop runs for 10-50 steps on a tiny batch; loss decreases (not flat, not NaN).
- `full-train` — full training completes; loss curve plotted; convergence direction matches prediction.
- `eval` — evaluation vs baselines runs; metric table coherent; ablation (if feasible) logged.

**Notebook `shards/<project_name>/notebooks/framework_prototype.ipynb`**,
assembled section by section (one task per section group, chained by
`depends_on` since they share the notebook file):
1. **Setup** — imports, configuration, device setup, seed setting
2. **Data** — data loading (real) or synthetic data generation; EDA/visualization
   of a sample to confirm structure
3. **Framework Implementation** — implement each core component cell by cell,
   with markdown explaining each component's role and design choices
4. **Training Loop** — training loop with logging; run for enough steps to
   verify gradient flow and loss convergence direction
5. **Evaluation** — run against baselines; produce metric table; ablation runs
   if feasible in the prototype
6. **Visualization** — loss curves, learned representations (t-SNE/UMAP if
   applicable), attention maps, or whatever is diagnostic for this architecture

**Modules `shards/<project_name>/src/`:** extract reusable components from
the notebook into proper Python modules. Each module should be importable and
have clean interfaces. Prefer explicit over clever.

**`shards/<project_name>/requirements.txt`**

**Task evidence guidance:** {{protocol incremental_testing}} Test each
component in isolation when its task completes; do not leave run-all until the
end.

### Lead loop

{{delegate tasks=shards/<project_name>/tasks.yaml max_parallel=3}}

Dispatch only tasks with `phase: 4` from the single `tasks.yaml` written
by the plan phase (the other phase's tasks are not dispatched here).

1. **Load** the task list approved at the plan gate (call `tasks_set`; fix and
   re-validate if it is rejected).
2. **Dispatch** ready `phase: 4` tasks (`task_dispatch`) in parallel up to
   `max_parallel=3`. Tasks that write to the same file (for example the
   notebook) must be ordered by `depends_on`.
3. **Collect** each worker's result via `task_report`.
4. **Verify before counting.** For every report, re-run (or independently
   check) the acceptance command and compare the output with the `plan_ref`
   spec. Then write a per-task evidence row to the `## Validation` Evidence
   table (Check = task id + component, Expected, Observed, Pass/Fail), with the
   exact command and measured facts (for example `df.shape = (48211, 47)`,
   output shapes, loss values). Never mark a task done on the worker's word
   alone.
5. **On failure** re-dispatch with the failure output as feedback, at most 2
   retries; then stop and ask the user with a summary.
6. **Deviations** or a plan that cannot be met: pause dependent tasks and follow
   {{protocol plan_drift}}; amend the plan only via a confirmed gate.
7. **Dispatch** tasks unblocked by done tasks until all `phase: 4` tasks
   are done.
8. You write no build code yourself except for `delegate: inline` tasks.

**Final integration check (lead, after all tasks are done):** restart the kernel and run the notebook top to bottom, confirm the modules import cleanly and results match the training run summary you will document. Record
the result as an evidence row before the gate.

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
