> **Previous:** phase-5.md confirmed
> **Next:** phase-7.md (read only after this phase's gate is confirmed)

---

## Phase 6 — Execute

**Context checkpoint:** Before building, prompt the user:

"Planning's locked — good moment to run `/compact` or `/clear` before we start
executing. I'll be working from project-specs.md from here. Say the word when
you're ready."

Wait for any signal from the user before beginning build steps.

**Knowledge re-check:** Follow `.claude/agents/specific_instructions/shared/knowledge_checkpoint.md` before building.

Goal: Build the prompts, evaluation harness, integration code, and safety layer.

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

- `ai-engineer-phase-6-checkpoint-prompts` — each prompt executes against a 3-5 example smoke subset; outputs parse correctly; no runaway token usage.
- `ai-engineer-phase-6-checkpoint-scoring` — automated scoring cell computes metrics on a sample; values are in a plausible range (not all-zero, not all-one).
- `ai-engineer-phase-6-checkpoint-cost` — per-request cost measured; monthly projection at target volume within budget.
- `ai-engineer-phase-6-checkpoint-safety` — adversarial / prompt-injection test subset runs; pass rate computed.
- `ai-engineer-phase-6-checkpoint-integration` — integration code (if applicable) round-trips one real request end-to-end.

The hook blocks all non-read tools while a checkpoint is open. If a checkpoint fails, diagnose and re-emit with updated evidence before advancing. Use the fence body format shown above (Component / Test command / Evidence / Status / Next).

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

   If the Shards UI is active (`.shards/ui.port` file exists), push the eval
   dashboard panel:
   ```bash
   node .shards/ui/ui-push.js eval-dashboard \
     --title "Eval: <project_name>" \
     --agent "ai-engineer" \
     --panel-id "eval-<project_name>" \
     --source "<path_to>/eval-results.json"
   ```

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

::GATE:: id=ai-engineer-phase-6 phase=6 kind=phase validates=ai_engineer
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ai_engineer/phases/phase-7.md` in full and follow its instructions starting from Phase 7. Do not pre-read further phase files.
