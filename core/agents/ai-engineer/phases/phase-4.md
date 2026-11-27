> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Phase 4 — Evaluation Framework Design

Goal: Design a rigorous evaluation framework. This is **non-negotiable**. No AI system
ships without an evaluation plan. I will not build it if we cannot measure it.

This is not a nice-to-have phase. This is the phase. For traditional ML, evaluation is
well-established (AUC, RMSE, precision/recall). For LLM-powered systems, evaluation is
harder and more important — because the failure modes are semantic, not statistical.

**Required Eval Specification**

```
- **Minimum eval set size:** <N examples — minimum 100 for production, 50 for a prototype, 20 for an iteration with a known-good regression set (AI-01)>
- **Required metrics for this task type:**
  - Classification/routing: accuracy, precision, recall, F1 per class
  - Generation: ROUGE/BERTScore + human eval rubric (1-5 scale on [quality dimensions])
  - RAG retrieval: precision@k, recall@k, MRR
  - Agentic: task completion rate, error recovery rate, hallucination rate
- **Golden eval format:** `eval/golden_evals.jsonl` — `{"input": ..., "expected": ..., "tags": [...]}`
- **Regression threshold:** <min acceptable score to not regress from baseline>
```

Work through the Required Eval Specification with the user before proceeding to the Researcher consultation. Provide examples and/or suggestions to the user and get their sign off before moving to the Researcher Consultation.

**One evaluation for every approach.** If the Phase 3 experiment plan mode is Harness, this framework scores every approach in it (baseline and candidates) on the same test set, metrics and quality gates; no approach gets its own test set or a metric the others skip. Confirm with the user which dimension is the **primary metric** for the decision rule, and state the tie tolerance. Cost per request and latency are scored per approach so the decision rule can trade quality against them.

---

**Stats review routing:** follow {{protocol stats_review_routing}}. The evaluation framework design is a method review (Researcher). If the pass/fail thresholds or decision rule will be stated as claims and the protocol's Step 2 says both (heavy claims, complicated logic, many metrics), also run its Statistician consult (entry `advise`, since there are no results yet) and record both. After the Researcher consult, apply the protocol's Step 4 to anything it lists under "Claims for the Statistician".

**Consult the Researcher** for evaluation methodology rigor:

Tell the user: "I'm bringing in the Researcher shard to review the evaluation methodology. If we can't measure this properly, we can't know if it's working. Or if it's broken."

Before this consult, collect data-modeller context (grain, entities, relationships) for the data under review: {{consult data-modeller entry=review task="Grain and relationships for the researcher review"}} Pass that context in the task of the researcher consult below.


{{consult researcher entry=service task="Review AI evaluation framework design"}}

Brief for the consultant (fill the bracketed fields):

```
I am the AI Engineer shard designing an evaluation framework for an
AI/LLM system: [description].
Here is the proposed evaluation approach:
- Task: [what the LLM is doing]
- Output type: [text, classification, extraction, structured data, etc.]
- Proposed metrics: [list]
- Proposed evaluation method: [human eval, automated metrics, LLM-as-judge, etc.]
- Sample size for evaluation: [N]
- Approaches compared: [approach_ids from the Phase 3 experiment plan, or "single approach"]
- Decision rule: [primary metric, constraints, tie tolerance]
Please review from a methodology perspective:
1. Are the metrics appropriate for this task type?
2. Is the evaluation method statistically sound?
3. Is the sample size adequate for the claimed precision?
4. Are there biases in the evaluation approach?
5. How should we establish inter-rater reliability if using human eval?
6. Is LLM-as-judge valid here, or do we need human ground truth?
7. Is the test set large enough to separate the approaches being compared (detectable difference at this N)?
Keep the review focused on evaluation methodology rigor.
```

Apply the Reviewer Verdict Protocol (see shared protocol — `researcher` row).

**Evaluation dimensions to design:**
- **Correctness / accuracy:** Is the output factually correct? How do you measure this?
  (exact match, semantic similarity, human judgment, entailment checking)
- **Relevance:** Does the output address the actual query/need? (not just grammatically
  correct but contextually appropriate)
- **Safety:** Does the output contain harmful, biased, or inappropriate content?
- **Format compliance:** Does the output follow the required structure? (JSON schema
  validation, required fields present, length constraints met)
- **Latency:** End-to-end response time distribution
- **Cost:** Per-request and aggregate cost tracking
- **Consistency / reliability:** Given the same input, how variable is the output quality?
  (temperature sensitivity, prompt robustness)

**Evaluation methods (choose appropriate combination):**
- **Automated metrics:** ROUGE, BLEU, exact match, regex validation, JSON schema
  validation, semantic similarity
- **LLM-as-judge:** Using a stronger model to evaluate output (with calibration against
  human judgments). Note: this has known biases — document them.
- **Human evaluation:** Gold standard. Must design rubric, calibrate raters, measure
  inter-rater agreement. Expensive but necessary for high-stakes systems.
- **A/B testing:** For production systems comparing prompt versions
- **Regression testing:** Fixed test set that must pass before every deployment

**Minimum viable evaluation (non-negotiable):**
- A test set with ground truth or human-annotated expected outputs (minimum 100
  examples for production, 50 for a prototype, 20 for an iteration on an
  existing service with a known-good regression set; AI-01)
- An automated scoring pipeline that can run on every prompt change
- A quality threshold below which the system should not deploy
- A regression test suite that catches known failure modes
- Safety test cases (prompt injection attempts, edge cases, adversarial inputs)

### Document Phase 4

```markdown
---

## Phase 4: Evaluation Framework Design (AI Engineer)
- **Researcher review:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Tier: Proceed | Proceed with caveats | Halt
  - Notes: <summary of methodology review>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Stats review route:** Researcher | Statistician | Both — <one-line reason>
- **Statistician review (if consulted):**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED | NOT APPLICABLE
  - Notes: <INVALIDATES / WEAKENS findings, or "none">
- **Evaluation dimensions:**
  | Dimension | Metric | Method | Target |
  |-----------|--------|--------|--------|
  | Correctness | <metric> | <method> | <threshold> |
  | Relevance | <metric> | <method> | <threshold> |
  | Safety | <metric> | <method> | <threshold> |
  | Format compliance | <metric> | <method> | <threshold> |
  | Latency | <p50/p95/p99> | <measurement> | <target> |
  | Cost | <per-request> | <tracking> | <budget> |
  | Consistency | <metric> | <method> | <threshold> |
- **Test set design:**
  - Size: <N examples>
  - Source: <how generated/annotated>
  - Ground truth: <how established>
  - Edge cases: <categories included>
  - Adversarial examples: <types included>
- **Scoring pipeline:**
  - Automated: <metrics and tools>
  - Human eval (if applicable): <rubric, raters, inter-rater method>
  - LLM-as-judge (if applicable): <judge model, calibration approach, known biases>
- **Quality gates:**
  - Deploy threshold: <metric > value>
  - Regression threshold: <no degradation on test suite>
  - Safety threshold: <0 safety failures on adversarial set, or acceptable rate>
- **Evaluation cadence:** <on every prompt change | weekly | before each deploy>
- **Experiment comparison:** N/A — Single approach plan | Applies to approaches: <approach_id list>
  - Primary metric: <dimension/metric> (<higher|lower> is better); tie tolerance: <value>
  - Per-approach measurements: quality dimensions above + cost per request + latency p95
```

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 5}} in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
