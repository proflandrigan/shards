> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Execute

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to trim or reset your context before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** {{protocol knowledge_checkpoint}} before building.

Goal: Build the prompts, evaluation harness, integration code, and safety layer.

### Incremental testing — checkpoint gates between components

{{protocol incremental_testing}} during this build. Each component below is a checkpoint seam — after you write and execute a component, call `gate_request` with a `kind=checkpoint` gate (macro below) before starting the next component. Do not leave run-all until the end: test each component in isolation as you build it.

Checkpoint gate — pass `evidence={status: pass|fail, checks: [...]}`: put the component name, the exact test command you ran, and the measured facts (e.g. `df.shape = (48211, 47)`, `null rate on join key = 0.00%`, `sample head matches expected schema`) in `checks`. Under the default `phase` policy a passing checkpoint is recorded automatically and blocks only on fail/anomaly. Never confirm your own gate.

{{gate kind=checkpoint name=component-slug}}

Expected checkpoint names for this phase (use as `name`, in order as you build):

- `prompts` — each prompt executes against a 3-5 example smoke subset; outputs parse correctly; no runaway token usage.
- `scoring` — automated scoring cell computes metrics on a sample; values are in a plausible range (not all-zero, not all-one).
- `cost` — per-request cost measured; monthly projection at target volume within budget.
- `safety` — adversarial / prompt-injection test subset runs; pass rate computed.
- `integration` — integration code (if applicable) round-trips one real request end-to-end.

If a checkpoint fails, diagnose, fix, and call `gate_request` again with updated evidence before advancing.

**Build artifacts:**

1. **Prompt files** — Write to:
   - Greenfield: `services/<name>/prompts/`
   - Iteration: `<existing_service_dir>/prompts/`
   - Each prompt file includes a metadata header:
     ```
     # Prompt: <name>
     # Version: <version>
     # Purpose: <what this prompt does>
     # Model: <target model and provider>
     # Date: <date>
     # Evaluation score: <metric: value on test set>
     # Cost per call: ~$<X>
     ```

2. **Evaluation test set** — Write to:
   - Greenfield: `services/<name>/eval/`
   - Iteration: `<existing_service_dir>/eval/`
   - Include: input-output pairs with ground truth, edge cases, adversarial examples,
     safety test cases (prompt injection attempts, boundary cases)

3. **Evaluation notebook** — Write using NotebookEdit to:
   - Greenfield: `services/<name>/notebooks/`
   - Iteration: `<existing_service_dir>/notebooks/`
   Structure:
   - **Overview** (markdown): business problem, AI approach, key decisions
   - **Setup**: imports, config, API keys, test set loading
   - **Prompt Execution**: run prompts against test set, collect outputs
   - **Automated Scoring**: compute metrics, compare to thresholds
   - **Quality Analysis**: error categorization, failure mode analysis
   - **Cost Analysis**: per-request cost, projected monthly cost at scale
   - **Safety Analysis**: adversarial test results, safety check pass rate
   - **Results Summary**: pass/fail against quality gates, recommendation

4. **Configuration** — model selection, temperature, max tokens, retry logic, cost limits

5. **Integration code** (if applicable) — API wrappers, RAG pipeline, agent orchestration

6. **Requirements file** — `requirements.txt` with all dependencies

7. **Eval results JSON** — After running the evaluation notebook, write structured
   results to the project's `eval-results.json`:
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

   Write the file initially with `status: "running"` and null values. Update it
   as each dimension is evaluated — the UI file watcher pushes live updates.
   When all dimensions are complete, set `status: "complete"`, compute
   `summary.passed`, `summary.failed`, and `summary.overallVerdict`
   (PASS if all pass, FAIL if any fail, PARTIAL if mixed).

   Always emit the eval dashboard panel (emit once; the file is rewritten as
   dimensions complete):

   {{artifact.emit type=eval-dashboard path=<path_to>/eval-results.json meta="title=Eval: <project_name> panel_id=eval-<project_name>"}}

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
```

{{gate kind=phase validates=ai-engineer}}

---

## When this gate is confirmed

{{phase 7}} in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
