> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Phase 4 — Model Design

Goal: Choose the model architecture, baselines, and candidate approaches.

**If productionization from study:** The Data Scientist has already validated the
model design from a statistical perspective. Start by reading the study's Phase 4
(Modeling Approach) and Phase 6 (Build Log) from the study's `project-specs.md`.
The study's candidate model is the starting point, not a blank slate. Focus this phase on:
- Can the study's best model meet serving constraints (latency, memory, size)?
- If not, what production-friendly alternatives achieve acceptable performance?
- What's the production baseline? (the study's baseline may differ from a production baseline)
Still consult the Data Scientist via Task, but frame the review as "production adaptation
review" rather than full methodology review.

**Otherwise (greenfield or iteration):** proceed as below.

Ask about:
- **Model type preferences:** Any organizational preferences or existing frameworks?
  (scikit-learn, XGBoost, LightGBM, PyTorch, TensorFlow, etc.)
- **Interpretability vs. performance trade-off:** Where does this sit?
- **Ensemble acceptable?** Or must it be a single model for serving simplicity?
- **Online learning needed?** Or batch retrain is sufficient?

**Feature Registry check.** If `.shards/knowledge/features/` exists, scan for features
whose domain tags overlap with this project's data domain (from Phase 3). For each
relevant feature, present to the user with its SQL snippet, grain, and verification
metadata. Ask: "Would you like to import any of these into your feature candidates?"

If imported, note in feature candidates list: `(imported from Knowledge Ledger —
verified by <agent> in <source_project>)`

**Consult the Data Scientist** for methodology review:

Tell the user: "Asking the Data Scientist to review the modeling approach. Statistical rigor isn't optional."


```
Task(
  subagent_type="data-scientist",
  description="Review ML model design for [project]",
  prompt="I am the ML Engineer shard designing an ML system for [purpose].
  Here is the model design:
  - Task: [classification/regression/ranking/etc.]
  - Target: [definition]
  - Features: [summary of feature groups]
  - Baseline: [proposed baseline]
  - Candidates: [proposed candidate models]
  - Evaluation: [proposed metrics]
  Please review from a statistical and methodological perspective:
  1. Is the target definition sound? Any leakage risk?
  2. Are the evaluation metrics appropriate for the business problem?
  3. Are there methodological concerns (confounding, bias, train/test contamination)?
  4. Would you suggest a different approach or additional baselines?
  Keep the review focused — I'll handle the systems/infrastructure side."
)
```

**Consult the Applied ML Scientist** for methodology review. This is the default —
AMS reviews the ML science of the proposed design (problem formulation, inductive
bias alignment, loss function choice, evaluation metric soundness) in every Build
project. Skip ONLY if ALL of the following hold:
- Pure tabular data with standard feature types
- Standard sklearn/XGBoost/LightGBM model family
- Standard loss (MSE, log loss, cross-entropy)
- Standard evaluation metrics (AUC, RMSE, accuracy, precision/recall)
- No custom objectives, no architecture search, no self-supervised components

If any of those criteria fail — or you're unsure — consult AMS. Non-tabular data
structures (sequences, graphs, point clouds, images), custom objectives,
architecture search, self-supervised pretraining, multi-task learning, or user
requests for novel approaches all require AMS review.

Tell the user: "Pulling in the Applied ML Scientist to review the methodology —
problem formulation, inductive bias, objective alignment. Science review before
we commit to this design."

If skipping, state explicitly: "Skipping Applied ML Scientist review — this is
standard tabular <problem type> with <model family> and <metric>. No cutting-edge
methodology in scope." Document the skip rationale in the phase output.

```
Task(
  subagent_type="applied-ml-scientist",
  description="ML methodology review for <system type>",
  prompt="I am the ML Engineer shard designing a <system>. The proposed approach is:
  - Task type: <classification | regression | ranking | etc.>
  - Data: <modality, scale, key characteristics>
  - Proposed model: <architecture or approach>
  - Objective: <loss function / evaluation metric>
  - Constraints: <latency, memory, compute budget, interpretability>
  - Business goal: <what the model output drives>

  Please review and flag:
  1. Is the problem formulated correctly as an ML problem?
  2. Is there a significant mismatch between the architecture and data structure?
  3. Are there methods from recent literature that would clearly outperform the
     proposed approach for this specific problem?
  4. Any red flags on the loss function or evaluation metric?

  Context: <key constraints and goals from Phases 1-3>."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `applied-ml-scientist` row).

**If the candidate model involves deep learning** — neural networks for image,
text, audio, point cloud, or graph data, transformer variants, CNNs, RNNs, or any
multi-layer neural approach — consult the Deep Learning Engineer:

Tell the user: "This involves deep learning — I'm asking the Deep Learning Engineer
shard to review architecture–data alignment, memory footprint, and inference
feasibility..."

```
Task(
  subagent_type="deep-learning-engineer",
  description="DL architecture and production feasibility review for <project>",
  prompt="I am the ML Engineer shard designing an ML system. I need a deep learning
  architecture and production feasibility review.

  - Task type: <classification | regression | ranking | generation | etc.>
  - Data modality: <image | text | audio | point cloud | graph | tabular | multi-modal>
  - Proposed architecture: <name or description>
  - Input/output shapes: <input tensor shape> → <output tensor shape>
  - Data scale: <N training examples, sequence length or spatial dims>
  - Hardware: <GPU, VRAM, inference latency budget>
  - Model size budget: <parameter ceiling or 'unconstrained'>
  - Business goal: <what the model output drives>

  Please review:
  1. Is there a mismatch between the proposed architecture and the data structure
     (inductive bias argument)?
  2. Does the architecture fit the stated hardware constraints (VRAM, latency)?
  3. Are there implementation concerns (numerical instability, known failure modes
     for this architecture class at this data scale)?
  4. Are there superior architectures from recent literature for this exact
     problem type that would be worth considering before committing?

  Context: <key constraints and goals from Phases 1-3>."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `deep-learning-engineer` row).

**If Interpretability is High — consult the Data Analyst:**

Tell the user: "Looping in the Data Analyst — they need to validate that these features make business sense before we serve them."

```
Task(
  subagent_type="data-analyst",
  description="Review feature candidates for business sense and interpretability",
  prompt="I am the ML Engineer shard building an ML system for [purpose]. High
  interpretability has been flagged as a requirement. Please review the feature
  candidates to confirm they make business sense for this problem.

  Feature candidates: [summary of feature groups from Phase 3]
  Target variable: [name and definition]
  End users of model outputs: [from Phase 1 — internal system | customer-facing | analyst | API consumer]
  Business problem: [from Phase 1]
  Cost of wrong predictions: [false positive / false negative impact, from Phase 1]

  Please review:
  1. Do these features align with how the business understands this problem?
  2. Are there features that are technically valid but hard to explain to [end users]?
  3. Are there obvious business-meaningful features that appear missing?
  4. Any features that could undermine trust in the model if surfaced via SHAP or
     feature importance to stakeholders?
  Focus on interpretability and business alignment — I'll handle the systems side."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `data-analyst` row).

**If the evaluation involves statistical inference** — A/B testing, confidence
intervals, power analysis, significance testing, or experiment design for
online evaluation — consult the Researcher:

Tell the user: "The evaluation plan involves statistical inference — I'm asking
the Researcher shard to validate the methodology before we commit to it."

```
Task(
  subagent_type="researcher",
  description="Review statistical inference methodology for ML evaluation",
  prompt="I am the ML Engineer shard designing the evaluation strategy for an
  ML system: [description].
  Here is the proposed evaluation approach:
  - Task: [what the model does]
  - Offline metrics: [list]
  - Online evaluation plan: [A/B test design, shadow mode, etc.]
  - Sample size / traffic split: [N or %]
  - Statistical test planned: [t-test, chi-squared, bootstrap, etc. or 'TBD']
  - Confidence level: [95%, 99%, etc. or 'TBD']
  Please review from a statistical methodology perspective:
  1. Is the proposed statistical test appropriate for this metric type?
  2. Is the sample size / traffic split adequate for the expected effect size?
  3. Is the experiment design sound (randomization, control, duration)?
  4. Are there multiple comparison issues or other statistical pitfalls?
  5. What power analysis would you recommend?
  Keep the review focused on statistical inference methodology."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `researcher` row).

Define:
- **Baseline model:** Simple, fast, interpretable. The floor to beat.
  (logistic regression, decision tree, popularity-based, rule-based)
- **Candidate model(s):** What to try if baseline isn't sufficient.
- **Evaluation strategy:**
  - Offline metrics: the model metrics (AUC, RMSE, NDCG, MAP, precision@k, etc.)
  - Online metrics: the business metrics (conversion, engagement, revenue)
  - Validation approach: temporal split, k-fold, stratified, group-aware
- **Model size estimate:** Approximate parameter count, serialized size
- **Inference cost estimate:** CPU/GPU time per prediction, batch throughput

### Document Phase 4

```markdown
---

## Phase 4: Model Design (ML Engineer)
- **Data Scientist review:**
  - Verdict: Approved | Concerns raised
  - Tier: Proceed | Proceed with caveats
  - Notes: <summary of methodology review>
  - Reviewer resolution: Approved | User override — <rationale>
- **Applied ML Scientist review:** <summary if consulted> | Skipped — <skip rationale per the criteria above>
  - Verdict: Sound | Consider Alternatives | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Deep Learning Engineer review:** N/A — not a DL approach | <summary if consulted>
  - Verdict: DEPLOY | OPTIMIZE | REDESIGN
  - Tier: Proceed | Proceed with caveats | Halt
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Data Analyst feature review:** N/A — Interpretability not High | <summary>
  - Verdict: Aligned | Concerns raised
  - Tier: Proceed | Proceed with caveats
  - Reviewer resolution: Approved | User override — <rationale>
- **Researcher review:** N/A — no statistical inference in evaluation | <summary if consulted>
  - Verdict: Sound | Concerns | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Baseline model:**
  - Type: <model type>
  - Rationale: <why this baseline>
  - Expected performance: <rough estimate>
- **Candidate model(s):**
  - <model 1>: <type, rationale, trade-offs>
  - <model 2>: <type, rationale, trade-offs>
- **Evaluation strategy:**
  - Offline metrics: <list with business interpretation>
  - Online metrics: <list — what to measure post-deploy>
  - Validation: <temporal split | k-fold | stratified | group-aware — rationale>
  - Minimum threshold: <metric > value — business justification>
- **Interpretability approach:** <SHAP | LIME | feature importance | N/A>
- **Model size estimate:** ~<N> parameters, ~<X>MB serialized
- **Inference cost:** ~<X>ms per prediction on <CPU/GPU>
- **Ensemble:** Yes — <strategy> | No — single model
- **Online learning:** Yes — <strategy> | No — batch retrain
- **Feature Registry check:** <N> relevant features found | No features found | N/A — no features directory
  - Imported: <title(s)> | None
```

::GATE:: id=ml-engineer-phase-4 phase=4 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/ml_engineer/phases/phase-5.md` in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
