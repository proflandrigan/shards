> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Execute

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before dispatching any task.

**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.

Goal: Build the prompts, evaluation harness, integration code, and safety layer as tested components, one task each, under a lead loop.

### Component specifications

Each task in `<output_dir>/tasks.yaml` cites one of these specifications through `plan_ref`. Workers see only the referenced sections, so keep each self-contained. Output locations: greenfield `services/<name>/`, iteration `<existing_service_dir>/`.

**Spec A. Prompt files** (one task per prompt) in `<output_dir>/prompts/`. Each prompt file includes a metadata header:
   ```
   # Prompt: <name>
   # Version: <version>
   # Purpose: <what this prompt does>
   # Model: <target model and provider>
   # Date: <date>
   # Evaluation score: <metric: value on test set>
   # Cost per call: ~$<X>
   ```
   Acceptance: the prompt executes against a 3-5 example smoke subset; outputs parse correctly; no runaway token usage.

**Spec B. Evaluation test set** in `<output_dir>/eval/`. Include: input-output pairs with ground truth, edge cases, adversarial examples, safety test cases (prompt injection attempts, boundary cases).

**Spec C. Evaluation notebook** in `<output_dir>/notebooks/`, built with NotebookEdit. It is one file, so notebook tasks are chained with `depends_on` (never parallel) and split by section group (execution and scoring; cost; safety; results). Structure:
   - **Overview** (markdown): business problem, AI approach, key decisions
   - **Setup**: imports, config, API keys, test set loading
   - **Prompt Execution**: run prompts against test set, collect outputs
   - **Automated Scoring**: compute metrics, compare to thresholds
   - **Quality Analysis**: error categorization, failure mode analysis
   - **Cost Analysis**: per-request cost, projected monthly cost at scale
   - **Safety Analysis**: adversarial test results, safety check pass rate
   - **Results Summary**: pass/fail against quality gates, recommendation

   Acceptance per group:
   - scoring: the automated scoring cell computes metrics on a sample; values are in a plausible range (not all-zero, not all-one).
   - cost: per-request cost measured; monthly projection at target volume within budget.
   - safety: the adversarial / prompt-injection subset runs; pass rate computed.

**Spec D. Configuration.** Model selection, temperature, max tokens, retry logic, cost limits.

**Spec E. Integration code** (if applicable). API wrappers, RAG pipeline, agent orchestration. Acceptance: round-trips one real request end-to-end.

**Spec F. Requirements file.** `requirements.txt` with all dependencies.

**Spec G. Eval results JSON.** After the evaluation notebook runs, the evaluation tasks record structured
   results in the project's `eval-results.json` (owned by a single sequential chain of tasks, never parallel ones):
   - Greenfield: `services/<name>/eval-results.json`
   - Iteration: `<existing_service_dir>/eval-results.json`

   The JSON must follow this schema:
   ```json
   {
     "variant": "ai-engineer",
     "projectName": "<project_name>",
     "status": "running",
     "timestamp": "<ISO-8601>",
     "summary": {
       "totalDimensions": 6,
       "passed": 0,
       "failed": 0,
       "overallVerdict": "PENDING"
     },
     "dimensions": [
       { "dimension": "Correctness", "metric": "<metric>", "target": 0.95, "actual": null, "unit": "ratio", "verdict": null }
     ],
     "cost": {
       "perRequest": null,
       "per1kTokens": null,
       "monthlyProjected": null,
       "budget": null,
       "currency": "USD"
     },
     "prompts": [
       {
         "name": "<prompt_name>", "version": "<version>", "model": "<model>",
         "dimensions": [
           { "dimension": "Correctness", "metric": "<metric>", "target": 0.95, "actual": null, "verdict": null }
         ],
         "costPerCall": null, "costPer1kTokens": null, "latencyP95ms": null
       }
     ],
     "safety": {
       "promptInjection": { "passRate": null, "total": 0 },
       "adversarialInputs": { "passRate": null, "total": 0 }
     }
   }
   ```

   The file is created initially with `status: "running"` and null values. Update it
   as each dimension is evaluated (Studio, if open, shows each update live).
   When all dimensions are complete, set `status: "complete"`, compute
   `summary.passed`, `summary.failed`, and `summary.overallVerdict`
   (PASS if all pass, FAIL if any fail, PARTIAL if mixed).

   The lead always emits the eval dashboard panel (emit once; the file is updated as
   dimensions complete):

   {{artifact.emit type=eval-dashboard path=<path_to>/eval-results.json meta="title=Eval: <project_name> panel_id=eval-<project_name>"}}

### Lead loop

{{protocol delegated_build}} governs this phase. Task evidence guidance: {{protocol incremental_testing}} (test each component in isolation as its task completes; do not leave run-all until the end).

{{delegate tasks=services/<name>/tasks.yaml max_parallel=3}}

1. **Load the task list** approved at the plan gate (`<output_dir>/tasks.yaml`) and validate it with `tasks_set`. Each task cites a specification above through `plan_ref`.
2. **Dispatch** ready tasks with `task_dispatch`, in parallel up to the cap of 3. Prompt and test-set tasks can run in parallel; notebook and integration tasks follow their `depends_on` order.
3. **Receive** each worker's result via `task_report`.
4. **Verify before it counts.** Re-run (or independently check) the acceptance command, compare with the `plan_ref` specification, then write an evidence row to the `## Validation` Evidence table (Check = task id + component, Expected, Observed, Pass/Fail), with measured facts (for example `df.shape = (48211, 47)`, `pass rate = 0.96`). Never mark a task done on the worker's word alone.
5. **On failure**, re-dispatch the task with the failure output as feedback, at most 2 retries; then stop and ask the user with a summary.
6. **Deviations.** If a worker reports a deviation or the plan cannot be met, pause dependent tasks and follow {{protocol plan_drift}}; amend the plan or task list only through a confirmed gate.
7. **Continue** dispatching tasks unblocked by tasks you have verified as done.
8. You write no build code yourself unless a task is marked `delegate: inline`.

When all tasks are verified done, finalize `eval-results.json` (status `complete`, passed/failed counts and overall verdict computed), record the final integration evidence row in `## Validation`, then document the phase and raise the gate.

### Document Phase 6

```markdown
---

## Phase 6: Build Log (AI Engineer)
- **Prompt files:**
  - <file path>: <description, version, model>
- **Evaluation test set:**
  - Location: <file path>
  - Size: <N examples>
  - Edge cases: <N>
  - Adversarial cases: <N>
- **Evaluation notebook:** <file path>
- **Requirements file:** <file path>
- **Config file:** <file path or "N/A">
- **Evaluation results:**
  | Dimension | Metric | Target | Actual | Pass/Fail |
  |-----------|--------|--------|--------|-----------|
  | Correctness | <metric> | <target> | <value> | Pass/Fail |
  | Relevance | <metric> | <target> | <value> | Pass/Fail |
  | Safety | <metric> | <target> | <value> | Pass/Fail |
  | Format | <metric> | <target> | <value> | Pass/Fail |
  | Latency | <p95> | <target> | <value> | Pass/Fail |
  | Cost | <per-request> | <budget> | <actual> | Pass/Fail |
- **Cost projection:**
  - Per request: $<X>
  - Monthly at projected volume: $<X>
- **Safety test results:**
  - Prompt injection: <pass rate>
  - Adversarial inputs: <pass rate>
  - Content filtering: <pass rate>
- **Deviations from plan:** <changes and why, or "none">
- **Failure modes discovered:** <categories and frequency>
- **Surprising findings:** <anything unexpected>

### Validation

| Check | Expected | Observed | Pass/Fail |
|---|---|---|---|
| <task id> <component> | <acceptance expected> | <measured facts> | PASS \| FAIL |
```

{{gate kind=phase validates=ai-engineer}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
