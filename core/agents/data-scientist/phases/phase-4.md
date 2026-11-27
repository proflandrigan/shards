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

**Experiment plan.** Do not settle on a single model. Apply Section A of the experiment framework. {{protocol experiment_framework}} Propose a baseline plus 2-4 candidate approaches, each with a one-line hypothesis. Define one shared evaluation (the same split, and the primary metric and minimum threshold above), a decision rule, and a recommended lead. Then ask the user the single-approach opt-out question from Section A.2, and do not take the opt-out on their behalf.

**Feature search.** Run `{{knowledge.search query="reusable features for <domain>"}}` (domain from Phase 2) and look for
features whose domain tags overlap with this project's data. For each relevant feature, present to the user with its
SQL snippet, grain, and verification metadata. Ask: "Would you like to import any of these into your feature candidates?"
Skip if no knowledge source is reachable.

If imported, note in feature candidates list: `(imported from knowledge source —
verified by <agent> in <source_project>)`

**Request ML Engineer review of the modeling approach:**

Tell the user: "I'm asking the ML Engineer to review the modeling approach. Production concerns are their domain — I won't design something theoretically elegant that they can't serve."

Before this consult, collect the context the reviewer needs, because it cannot consult further: data-modeller context (grain, entities, relationships) via {{consult data-modeller entry=review task="Grain and relationships for the ml-engineer review"}}. Include it in the task of the consult below.

{{consult ml-engineer entry=review task="Review modeling approach for [study]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Scientist shard designing the ML component of study [name].
Here is the proposed modeling approach:
- Task type: [classification | regression | survival | clustering]
- Target variable: [name and definition]
- Prediction window: [e.g., 90 days from observation date]
- Feature candidates: [summary list of feature groups]
- Known data challenges: [imbalance, censoring, drift, etc.]
- Primary metric: [metric and business interpretation]
- Baseline model: [model type and rationale]
- Candidate approaches: [approach_id: description and hypothesis, one per line]
- Shared evaluation and decision rule: [split, primary metric, constraints, tie-break]
- Experiment mode: [Harness | Single approach (user opted out)]
- Interpretability requirement: [High | Medium | Low]
- Deployment intent: [One-off | Productionized]
Please review: Is the model family appropriate for this task and data profile?
Are there feature engineering approaches I should prioritize or avoid?
Is the evaluation strategy sound? Any known pitfalls or gotchas for this
model type on this kind of data? Is any candidate redundant, or is an obviously
stronger approach missing from the comparison? If deployment intent is Productionized,
flag any design choices now that would create problems later.
```

Apply {{protocol reviewer_verdict}}.

**If Interpretability requirement is High — consult the Data Analyst:**

Tell the user: "High interpretability required. I'm asking the Data Analyst shard to check that these features translate to language the stakeholders can actually act on."

{{consult data-analyst entry=review task="Review feature candidates for business sense and interpretability"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Scientist shard designing a predictive model for study [name].
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
Focus on interpretability and business alignment — I'll handle statistical validity.
```

Apply {{protocol reviewer_verdict}}.

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
- **Experiment plan:**
  - Mode: Harness | Single approach (opted out — <user's reason>)
  - Baseline: <approach> — <why it is the floor>
  - Candidates:
    - <approach_id>: <description> — hypothesis: <why it might win, at what cost>
    - <approach_id>: <description> — hypothesis: <...>
  - Recommended lead: <approach_id> — <why>
  - Shared evaluation: <split or test set>; primary metric <metric> (<higher|lower> is better); secondary: <metrics>; constraints: <latency/memory/cost/interpretability budgets>
  - Decision rule: <best primary metric among constraint-passing approaches; ties within <tolerance> go to the simpler approach>
- **Explainability approach:** <SHAP | LIME | PDP | N/A>
- **ML Engineer review:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Tier: Proceed | Proceed with caveats | Halt
  - Notes: <summary of modeling approach review>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Data Analyst feature review:** N/A — Interpretability not High | <summary>
  - Verdict: APPROVED | NEEDS REVISION
  - Tier: Proceed | Proceed with caveats
  - Reviewer resolution: Approved | User override — <rationale>
- **Feature search:** <N> relevant features found | No features found | N/A — no knowledge source reachable
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

**DIVERGE check:** Approaches that share the same data, evaluation and deliverable belong in the experiment harness, not a fork (protocol Section A.4). Only if you identified 2-3 mutually exclusive modeling approaches that would change the project's shape (different data sources, deliverables or downstream phases) and are genuinely equally viable, you MAY propose a DIVERGE fork. {{protocol diverge}} and follow its DIVERGE Proposal Gate. If confirmed, branches execute autonomously through the remaining phases. After convergence and promotion, resume at Phase 5. If declined or not applicable, continue normally.

{{gate kind=phase}}

---

## When this gate is confirmed

{{phase 5}} in full and follow its instructions starting from Phase 5. Do not pre-read further phase files.
