> **Previous:** phase-3.md confirmed
> **Next:** phase-5.md (read only after this phase's gate is confirmed)

---

## Phase 4 — Modeling Approach (ML tasks only)

Goal: Define the ML task and evaluation strategy.

**Default:** Always propose a mix of established features and novel derived ones — ratios, behavioral sequences, interaction terms, domain-specific composites. Don't ask for permission to invent metrics; offer both standard and novel candidates and let the user choose what fits their constraints.

Ask about (and provide examples):
- Task type: classification, regression, survival/time-to-event, clustering?
- Target variable and its definition (e.g., "churned within 90 days")
- Feature candidates and their availability at prediction time
- Any domains or feature types that are off-limits for this use case?
- Class imbalance, censoring, or distribution shift concerns
- Primary evaluation metric and its business interpretation
- Minimum acceptable performance threshold
- Interpretability requirements (SHAP, LIME, partial dependence)
- One-off analysis or deployed, retrainable model?
- How important is model explainability?

Suggest a model family with justification. Propose a baseline model before anything complex.

**Feature Registry check.** If `.shards/knowledge/features/` exists, scan for features
whose domain tags overlap with this project's data domain (from Phase 2). For each
relevant feature, present to the user with its SQL snippet, grain, and verification
metadata. Ask: "Would you like to import any of these into your feature candidates?"

If imported, note in feature candidates list: `(imported from Knowledge Ledger —
verified by <agent> in <source_project>)`

**Request ML Engineer review of the modeling approach:**

Tell the user: "I'm asking the ML Engineer to review the modeling approach. Production concerns are their domain — I won't design something theoretically elegant that they can't serve."

```
Task(
  subagent_type="ml-engineer",
  description="Review modeling approach for [study]",
  prompt="I am the Data Scientist shard designing the ML component of study [name].
  Here is the proposed modeling approach:
  - Task type: [classification | regression | survival | clustering]
  - Target variable: [name and definition]
  - Prediction window: [e.g., 90 days from observation date]
  - Feature candidates: [summary list of feature groups]
  - Known data challenges: [imbalance, censoring, drift, etc.]
  - Primary metric: [metric and business interpretation]
  - Baseline model: [model type and rationale]
  - Candidate model(s): [model types and rationale]
  - Interpretability requirement: [High | Medium | Low]
  - Deployment intent: [One-off | Productionized]
  Please review: Is the model family appropriate for this task and data profile?
  Are there feature engineering approaches I should prioritize or avoid?
  Is the evaluation strategy sound? Any known pitfalls or gotchas for this
  model type on this kind of data? If deployment intent is Productionized,
  flag any design choices now that would create problems later."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `ml-engineer` row).

**If Interpretability requirement is High — consult the Data Analyst:**

Tell the user: "High interpretability required. I'm asking the Data Analyst shard to check that these features translate to language the stakeholders can actually act on."

```
Task(
  subagent_type="data-analyst",
  description="Review feature candidates for business sense and interpretability",
  prompt="I am the Data Scientist shard designing a predictive model for study [name].
  High interpretability has been flagged as a requirement. Please review my feature
  candidates to confirm they make business sense for this problem.

  Feature candidates: [summary of feature groups from Phase 4]
  Target variable: [name and definition]
  Primary audience: [who will use or act on model outputs, from Phase 1]
  Business context: [the decision this analysis supports, from Phase 1]

  Please review:
  1. Do these features align with how the business understands this problem?
  2. Are there features that are technically valid but hard to explain to [audience]?
  3. Are there obvious business-meaningful features that appear missing?
  4. Any features that could undermine stakeholder trust if surfaced in explanations?
  Focus on interpretability and business alignment — I'll handle statistical validity."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `data-analyst` row).

### Document Phase 4

```markdown
---

## Phase 4: Modeling Approach (Data Scientist)
- **Task type:** Classification | Regression | Survival | Clustering
- **Target variable:** <name and definition>
- **Prediction window:** <e.g., "90 days from observation date">
- **Feature candidates:** <summary list of feature groups>
- **Known data challenges:** <imbalance, censoring, drift, etc.>
- **Primary metric:** <metric and business interpretation>
- **Minimum threshold:** <concrete number, e.g., "AUC > 0.75">
- **Interpretability requirement:** High | Medium | Low — <rationale>
- **Deployment intent:** One-off | Productionized
- **Baseline model:** <model type and why>
- **Candidate model(s):** <model type(s) and why>
- **Explainability approach:** <SHAP | LIME | PDP | N/A>
- **ML Engineer review:**
  - Verdict: Sound | Concerns | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Notes: <summary of modeling approach review>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Data Analyst feature review:** N/A — Interpretability not High | <summary>
  - Verdict: Aligned | Concerns raised
  - Tier: Proceed | Proceed with caveats
  - Reviewer resolution: Approved | User override — <rationale>
- **Feature Registry check:** <N> relevant features found | No features found | N/A — no features directory
  - Imported: <title(s)> | None
```

**If Deployment intent is "Productionized":**
Tell the user: "Since you want this model productionized, here's how this works:
I'll finish the study first — the scientific work has standalone value and will serve
as the foundation for the production system. Once we complete Phase 7, I'll prepare
a handoff summary for the ML Engineer shard, who handles production ML systems
(serving, pipelines, monitoring, retraining). That's the natural next step after
this study wraps."

This is informational only — do not pause or redirect. Continue to Phase 5.

**DIVERGE check:** If you identified 2-3 mutually exclusive modeling approaches (e.g., different model families, fundamentally different feature engineering strategies) that are genuinely equally viable, you MAY propose a DIVERGE fork. Read `.claude/agents/specific_instructions/shared/diverge_protocol.md` and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 5. If declined or not applicable, continue normally.

::GATE:: id=data-scientist-phase-4 phase=4 kind=phase
Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

---

## When this gate is confirmed

Read `.claude/agents/specific_instructions/data_scientist/phases/phase-5.md` in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
