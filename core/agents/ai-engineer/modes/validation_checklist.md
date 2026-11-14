# AI Engineer Validation Checklist

Applied at the end of any phase that creates or modifies an LLM-powered service, RAG pipeline, agent, or prompt chain. Results render into the `## Validation` section of `project-specs.md` per `shared/validation_protocol.md`.

Check IDs (AI-01 through AI-12) are stable. AI validation is eval-set-centric: most checks are different lenses on the same representative prompt set. Maintain that eval set as a first-class artifact — it is the single largest determinant of whether validation is meaningful.

## Eval & Quality

### AI-01 — Eval Set Coverage

A representative eval set exists on disk, and its composition is deliberate — not a happy-path cherry-pick.

- Minimum coverage: golden path (typical queries), edge cases (empty, very long, adversarial-adjacent), known-hard cases (things the system gets wrong), and a factual-correctness subset with known answers.
- Set size: at least 50 items for a new service; 20 for iteration on an existing one with known-good regression set.
- Composition documented: count per category, how items were collected, refresh policy.

**Observed format:** `eval set: evals/v3/cases.jsonl — 128 items | golden=60, edge=28, hard=22, factual=18 | composition: evals/v3/README.md`

### AI-02 — Headline Eval Metric

A primary metric is measured on the full eval set, and it clears the spec threshold.

- Primary metric matches the problem: accuracy/F1 for classification-like tasks, win rate vs baseline for open-ended generation, pass@k for code, relevance@k for retrieval.
- LLM-as-judge scores must be accompanied by a human spot-check agreement rate on a sample (≥20 items) — judge drift is real.
- Numeric value, threshold, and pass/fail status recorded.

**Observed format:** `primary: win_rate vs baseline_v2 = 68% (n=128, 95% CI 60-76%) | judge: claude-sonnet-4-6, human agreement 92% on 25-sample spot-check | spec threshold ≥60% ✓ | full: results/eval_v3.json`

### AI-03 — Regression Comparison

Changes to prompts, models, or retrieval do not regress any item the prior version passed — or regressions are catalogued and accepted.

- Run the current version and the prior version against the same eval set.
- Diff: items that flipped pass→fail (regressions) and fail→pass (improvements).
- Any regression on the golden-path subset is a stop condition unless explicitly accepted and documented.

**Observed format:** `vs v2 on evals/v3: +14 improved, -2 regressed | regressions: case_47 (tone), case_102 (length) — both accepted, not golden-path | diff: results/regression_v2_v3.md`

Skip with `n/a` only for truly new services with no prior version.

### AI-04 — Hallucination / Factuality Rate

For any subset where the correct answer is knowable, the rate of fabricated content is measured and bounded.

- Apply to the factual-correctness subset defined in AI-01.
- Score each output: correct / partially correct / hallucinated / refused.
- Bound the hallucination rate per spec (e.g., <5% on factual subset).

**Observed format:** `factual subset n=18: correct=15, partial=2, hallucinated=1 (5.6% — at spec limit of 5%, flagged in Open Issues) | scoring: results/factuality_scoring.md`

Skip with `n/a` (+ reason) for services where factuality is not a success criterion (e.g., creative generation tasks).

### AI-05 — Slice Performance

Performance holds across meaningful input slices, not just in aggregate.

- Slices come from the spec: input length buckets, language, domain, difficulty, user segment.
- Report headline metric per slice. Flag any slice where performance degrades materially (>15% relative drop vs aggregate).

**Observed format:** `4 slices | worst: long_input (>2k tokens) win_rate=52% vs aggregate 68% (-16pp, above tolerance) — mitigation: added summarization step in preprocessing | per-slice: results/slice_metrics.json`

## Safety & Robustness

### AI-06 — Guardrails

Safety behaviors (PII handling, content policy, refusal behavior on out-of-scope or adversarial inputs) are tested against a dedicated adversarial set.

- Adversarial set (≥20 items) covers: PII exfiltration attempts, jailbreak patterns from public lists, content-policy probes, and off-scope queries the service should refuse.
- Report: pass rate (behaved correctly), escapes (produced disallowed content).
- Any escape on critical categories (PII leak, policy violation) is a stop condition.

**Observed format:** `adversarial set n=32 | passes=31, escapes=1 (case: partial PII echo in paraphrased input) — fix: added redaction layer, re-tested passes=32 ✓ | report: results/guardrails_audit.md`

### AI-07 — Prompt Injection Robustness

The service resists injection attempts in its input channels (user messages, retrieved documents, tool outputs).

- Test prompt injection through each input channel: user prompt, RAG-retrieved document, tool-call result.
- Injection patterns from known vector lists (e.g., "ignore prior instructions", delimiter confusion, embedded role-play).
- Any injection that causes tool misuse, secret leak, or instruction override is a stop condition.

**Observed format:** `injection tests: 15 vectors × 3 channels = 45 attempts | 43 resisted, 2 partial bypasses via retrieved-doc channel (no secret leak, but tone shift) — fix: retrieved-doc quoting, re-tested 45/45 ✓ | details: results/injection_audit.md`

### AI-08 — RAG Retrieval Quality

When retrieval is part of the pipeline, retrieval accuracy is measured separately from end-to-end quality.

- Known-answer queries where the correct document is labeled.
- Metrics: recall@k (correct doc in top-k), MRR, or nDCG per problem.
- Retrieval failure cascades — a bad retriever guarantees a bad generation, so diagnose retrieval independently.

**Observed format:** `retrieval eval n=50 | recall@5=0.84, MRR=0.71 | failure mode: long queries split across chunks — added query reformulation | results/retrieval_eval.json`

Skip with `n/a` (+ reason) for non-RAG services.

## Operational

### AI-09 — Latency Budget

End-to-end latency fits the deployment budget, measured on representative inputs.

- Measure p50 and p99 on the eval set (not synthetic 1-token requests).
- Include all stages: retrieval, prompt assembly, LLM call, post-processing.
- Note token-weighted latency if input length varies materially.

**Observed format:** `p50=1.8s, p99=6.4s (budget <10s) ✓ | breakdown: retrieval 280ms, LLM 1.4s, post 120ms | token-weighted p50: 1.2ms/output-token`

### AI-10 — Cost Budget

Per-request token and dollar cost fits the budget.

- Tokens per request (input + output, averaged over eval set).
- Dollar cost per request and per 1K requests at current provider pricing.
- Caching rate (if applicable) and its cost impact.

**Observed format:** `per request: 1,240 input + 380 output tokens | cost: $0.0094/request ≈ $9.40/1K | cache hit rate 42% → effective $5.45/1K | budget <$15/1K ✓`

### AI-11 — Reproducibility

Given the same input and the same provider/model/seed/temperature, the service produces the same output (or bounded variance).

- Record: model ID, temperature, seed where supported, system prompt version.
- Re-run a sample (≥10 eval items) and confirm output stability.
- For temperature>0 services, characterize variance (e.g., agreement rate across 3 runs).

**Observed format:** `model=claude-sonnet-4-6, temp=0.0, seed unsupported | 10-sample re-run: 10/10 identical outputs ✓` or `model=claude-opus-4-7, temp=0.7 | 10-sample 3×-run: 87% agreement (LLM-judge equivalence) — expected for creative-gen mode`

### AI-12 — Component Tests

Non-LLM components have unit tests exercising them on known inputs.

- Minimum coverage: parsers, formatters, retrieval adapters, tool-call handlers, fallback logic, eval scorers.
- Tests live on disk (`tests/`) and exit zero.
- LLM calls in tests are mocked or use recorded responses — don't burn tokens on every test run.

**Observed format:** `tests/: 23 tests, 23 passed | coverage: parser 100%, retriever 92%, tools 88%, scorer 100% | LLM calls mocked via fixtures/`

---

## Track Calibration

Rows are indexed by `(Track, Mode)` per `shared/validation_protocol.md`.

| Track | Mode | Required | Recommended | Skippable |
|-------|------|----------|-------------|-----------|
| **deep** | `greenfield` | AI-01, AI-02, AI-04, AI-05, AI-06, AI-07, AI-09, AI-10, AI-12 | AI-03 (no prior), AI-08, AI-11 | — |
| **deep** | `iteration` | AI-01, AI-02, AI-03, AI-05, AI-09, AI-10, AI-12 | AI-04, AI-06, AI-08, AI-11 | AI-07 (if input-channel schema unchanged) |
| **quick** | `experiment` (kept `[X]` iteration) | AI-02 + AI-03 diff | AI-04 | most |
| **quick** | `prompt_lab` | AI-02 + AI-03 per version | AI-04, AI-11 | most |
| **fixer** | (Mode omitted) | AI-12 + AI-02 diff if the fix touches prompt/model logic | — | rest |

Any skipped or inapplicable check must still appear as a row with `Pass/Fail: n/a` and a Notes cell giving the reason. See `shared/validation_protocol.md` for the n/a convention.

## Artifacts Expected

For deep-track validation, the `### Artifacts` section should name at least:

- `evals/<version>/cases.jsonl` + `README.md` — AI-01
- `results/eval_<version>.json` — AI-02
- `results/regression_<prev>_<curr>.md` — AI-03 (iteration only)
- `results/guardrails_audit.md` — AI-06
- `results/injection_audit.md` — AI-07
- `tests/` directory — AI-12
- Prompt template versioning artifact (git commit or `prompts/<version>/` directory) — reproducibility context

## Downstream Impact — What to Cover

- **Service consumers:** product surfaces, downstream services, or agent pipelines that call this service. Contract changes (output schema, tool interface) need coordinated release.
- **Eval set consumers:** other AI features that reference this eval set — if items are added/removed, note it.
- **Cost impact:** if per-request cost changed materially, who consumes this at scale and what does the delta mean monthly.
- **Safety review:** if guardrails or injection handling changed, flag for Academic review via Task.

## When to Escalate

Stop validation and escalate rather than proceeding if:

- **AI-06 escapes on critical categories** (PII leak, content policy violation) — do not ship. Fix the guardrail before re-testing.
- **AI-07 injection causes tool misuse or secret exfiltration** — do not ship. Redesign the input channel.
- **AI-03 regresses on golden-path items** without explicit acceptance — return to prompt engineering; do not ship a worse version.
- **AI-04 hallucination rate exceeds spec limit** on factual subset — investigate root cause (retrieval, prompt, model) before shipping.
- **AI-11 variance is higher than the user experience can tolerate** — either reduce temperature, or redesign the contract so variance is acceptable (e.g., structured output constraints).
- **Any check produces a result the agent cannot explain.** Record as `✗` and surface in Open Issues.
