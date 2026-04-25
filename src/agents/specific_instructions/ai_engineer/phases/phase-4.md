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
- **Minimum eval set size:** <N examples — minimum 100 for production; 50 for prototype>
- **Required metrics for this task type:**
  - Classification/routing: accuracy, precision, recall, F1 per class
  - Generation: ROUGE/BERTScore + human eval rubric (1-5 scale on [quality dimensions])
  - RAG retrieval: precision@k, recall@k, MRR
  - Agentic: task completion rate, error recovery rate, hallucination rate
- **Golden eval format:** `eval/golden_evals.jsonl` — `{"input": ..., "expected": ..., "tags": [...]}`
- **Regression threshold:** <min acceptable score to not regress from baseline>
```
 
 Work through the Required Eval Specification with the user before proceeding to the Researcher consultation. Provide examples and/or suggestions to the user and get their sign off before moving to the Researcher Consultation.

---

**Consult the Researcher** for evaluation methodology rigor:

Tell the user: "I'm bringing in the Researcher shard to review the evaluation methodology. If we can't measure this properly, we can't know if it's working. Or if it's broken."

```
Task(
  subagent_type="researcher",
  description="Review AI evaluation framework design",
  prompt="I am the AI Engineer shard designing an evaluation framework for an
  AI/LLM system: [description].
  Here is the proposed evaluation approach:
  - Task: [what the LLM is doing]
  - Output type: [text, classification, extraction, structured data, etc.]
  - Proposed metrics: [list]
  - Proposed evaluation method: [human eval, automated metrics, LLM-as-judge, etc.]
  - Sample size for evaluation: [N]
  Please review from a methodology perspective:
  1. Are the metrics appropriate for this task type?
  2. Is the evaluation method statistically sound?
  3. Is the sample size adequate for the claimed precision?
  4. Are there biases in the evaluation approach?
  5. How should we establish inter-rater reliability if using human eval?
  6. Is LLM-as-judge valid here, or do we need human ground truth?
  Keep the review focused on evaluation methodology rigor."
)
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
- A test set with ground truth or human-annotated expected outputs (minimum 50-100
  examples for prototype, more for production)
- An automated scoring pipeline that can run on every prompt change
- A quality threshold below which the system should not deploy
- A regression test suite that catches known failure modes
- Safety test cases (prompt injection attempts, edge cases, adversarial inputs)

### Document Phase 4

```markdown
---

## Phase 4: Evaluation Framework Design (AI Engineer)
- **Researcher review:**
  - Verdict: Sound | Concerns | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Notes: <summary of methodology review>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
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
```

::GATE:: id=ai-engineer-phase-4 phase=4 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ai_engineer/phases/phase-5.md` in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
