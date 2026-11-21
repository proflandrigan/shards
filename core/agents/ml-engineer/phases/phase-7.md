> **Previous:** phase-6-5.md confirmed (or phase-6.md confirmed if 6.5 was skipped)
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Phase 7 — Review and Handoff

**Code review (Python scripts and notebooks):**

Tell the user: "Before Syn signs off, we're running code review on the Python
artifacts. Scripts go to the Backend Engineer; notebooks go to the Data
Scientist for a domain-aware read. Code quality is not optional."

Glob the project directory (`models/<project_name>/`) for `.py` files and,
separately, for `.ipynb` files.

**Python scripts → Backend Engineer** (only if any `.py` files were found):

{{consult backend-engineer entry=service task="Python code review for [project_name]"}}

Brief for the consultant (fill the bracketed fields):

```
You are in SERVICE MODE. Review the Python scripts in the project at
models/[project_name]/. Read project-specs.md first for context.
Files to review: [list of .py files found]
```

**Notebooks → Data Scientist** (only if any `.ipynb` files were found). Cross-
shard review — the Data Scientist catches modelling bugs, data leakage, and
statistical issues that the author of the notebook is likely blind to:

{{consult data-scientist entry=service task="Notebook code review for [project_name]"}}

Brief for the consultant (fill the bracketed fields):

```
SERVICE MODE — NOTEBOOK CODE REVIEW. Review the Jupyter notebooks in
the project at models/[project_name]/. Read project-specs.md first for
context.
Files to review: [list of .ipynb files found]
Your job here is review only — do not apply any fixes.
```

If both buckets are non-empty, fire both consults in parallel. If neither
bucket has files, report "No Python code artifacts — skipping code review."

Append both reviews to project-specs.md under a combined `Code Review` heading.

**After appending the reviews, branch on the worst verdict across both:**

- **APPROVED** → proceed directly to Syn review.
- **NEEDS REVISION** → tell the user: "Reviewer(s) flagged structural
  issues. Fixing before Syn review." Address every listed issue in the
  project files (the notebook reviewer may also be re-invoked in apply-fixes
  mode — see Step 5c of Syn's code_review mode for the call pattern). Update
  project-specs.md. Re-gate: "Reviewer issues resolved: [summary]. Confirm
  to proceed to Syn?" Then proceed to Syn.
- **BLOCKED** → tell the user: "Reviewer has blocked this. Fixing critical
  issues before continuing." Address every critical issue. Update
  project-specs.md. Resubmit to the same reviewer(s) once. If the second
  verdict is APPROVED or NEEDS REVISION, proceed to Syn. If still
  BLOCKED, surface to user: "Reviewer has blocked this twice. [Verbatim
  second verdict.] How would you like to proceed? (a) Override and proceed
  to Syn — I'll document the disagreement. (b) Continue fixing — tell me
  what to change. (c) Stop the project."

---

**Applied ML Scientist final methodology sign-off:**

Tell the user: "Before Syn signs off, I'm asking the Applied ML Scientist for a
final methodology pass on the completed project. Design review happened at
Phase 4, results review at Phase 6 — this is the closing sign-off on the ML
science as a whole. Skip if Phase 4 and Phase 6 AMS reviews were both skipped
per standard-tabular criteria."

If Phase 4 or Phase 6 consulted AMS, always run this final sign-off. If both
skipped AMS, skip this too and state: "Skipping AMS final sign-off — standard
methodology, no prior AMS consultations."

Before this consult, collect the context the reviewer needs, because it cannot consult further: data-modeller context (grain, entities, relationships) via {{consult data-modeller entry=review task="Grain and relationships for the methodology review"}} and researcher input via {{consult researcher entry=service task="Statistical methodology input for the methodology review"}}. Include both in the task of the consult below.

{{consult applied-ml-scientist entry=review task="Final methodology sign-off for <project_name>"}}

Brief for the consultant (fill the bracketed fields):

```
I am the ML Engineer shard closing out <project_name>. You reviewed the
design at Phase 4 and the training results at Phase 6. This is the final
methodology sign-off before Syn's holistic review.

Project specs: <path to project-specs.md>
Model card: <path to model-card.json>
Report: <path to report.md>
Eval results: <path to eval-results.json>

Please review the project as a whole and answer:
1. Is the methodology — from problem framing through evaluation — internally
   consistent? Are there drifts between what was designed, what was built, and
   what's being reported?
2. Does the model card accurately represent what the model does, its
   limitations, and its known failure modes?
3. Are there methodology-level risks that should be flagged to stakeholders
   before deployment (not infrastructure — those go to MLOps)?
4. Final verdict: does the science hold up?

Return a structured ML Science Review per your service-mode format, scoped to
the final sign-off (not a re-review of Phase 4/6 material).
```

Apply the Reviewer Verdict Protocol. Append the review to project-specs.md.

---

**MLOps Engineer consultation (serving infrastructure and deployment pipeline):**

Tell the user: "Before Syn signs off, I'm asking the MLOps Engineer to validate
the serving infrastructure and deployment pipeline. They care about what it takes
to actually operate this model."

{{consult mlops-engineer entry=review task="Serving infrastructure review for ML project: [project_name]"}}

Brief for the consultant (fill the bracketed fields):

```
I am the ML Engineer shard. I have designed a production ML system for
project [project_name] and need an infrastructure and operationalization review.

Project directory: models/<project_name>/
Specs: models/<project_name>/project-specs.md

Summary:
- Model type: <final model type from Phase 4>
- Inference requirements: <latency, throughput from Phase 6>
- Serving format: <from Phase 6 production considerations>
- Feature pipeline: <from Phase 6>
- Retraining trigger: <from Phase 6>

Please review:
1. Is the proposed serving infrastructure appropriate for the latency and
   throughput requirements?
2. Are there gaps in the CI/CD and model registry design?
3. Is the monitoring and alerting plan sufficient for production operation?
4. Are the retraining triggers and automation plan feasible?
5. What would you need from me to stand up this deployment?

Please read project-specs.md for full context.
```

Append MLOps Engineer's review to specs. Present to user.

**Before finalizing**, invoke Syn for final review:

Tell the user: "I'm asking Syn to review the full project specs before we ship this..."

{{consult syn entry=final_review task="Final review of ML engineering project"}}

Brief for the consultant (fill the bracketed fields):

```
I am the ML Engineer shard. I've completed all phases for project
[project_name]. Please review the project-specs.md at [file_path] and provide
your final review verdict. This is an ML engineering project — check for:
business alignment, methodology soundness, infrastructure readiness,
monitoring plan, and rollback strategy.
```

Append Syn's review to specs. Present to user.

If Syn returns NEEDS REVISION or BLOCKED, once or twice, follow the resolution loop and second-verdict escalation in {{protocol syn_review_resolution}}.

If Syn's review includes a "Code Review" section, follow the Code Review follow-up in {{protocol syn_review_resolution}}. If the user wants the code pass, invoke:

{{consult syn entry=code_review task="Code review and fix for ML engineering project"}}

Brief for the consultant (fill the bracketed fields):

```
CODE REVIEW MODE. I am the ML Engineer shard. Project: [project_name].
Directory: [project_dir]. Please review and fix the code artifacts produced
in this project. The project-specs.md is at [file_path] for context.
```

Append Syn's code review summary to the specs. Present findings to user.

Then:

1. **Generate Model Card** — Assemble a structured model card for stakeholder
   sharing. Extract from the live `project-specs.md` (already loaded): ML system type and description
   (Phase 1), data sources (Phase 3), model design and evaluation strategy
   (Phase 4), feature engineering (Phase 5), build results (Phase 6), review
   verdicts (Phase 7). Read `eval-results.json` for quantitative metrics.

   Consult the Academic shard for ethical considerations:

   {{consult academic entry=service task="Ethical considerations for model card"}}

   Brief for the consultant (fill the bracketed fields):

   ```
   I am the ML Engineer shard generating a model card for project
   [project_name]. The model is: [1-2 sentence description from Phase 1].
   End users of the model's output: [from Phase 1]. Model type: [from Phase 4].
   Training data: [summary from Phase 3].
   Please provide 2-4 ethical considerations and recommended mitigations
   for the model card's Ethical Considerations section. Be specific to
   this model's use case. Keep it concise — bullet points preferred.
   ```

   If the Academic shard is unavailable, populate ethical considerations based
   on the fairness and bias considerations from the model design phase and note
   that a formal ethics review was not completed.

   Write `model-card.json` to:
   - Greenfield: `models/<name>/model-card.json`
   - Iteration: `<existing_service_dir>/model-card.json`

   The JSON must conform to the schema defined in
   `templates/model-card-schema.json` (JSON Schema, draft 2020-12).
   See `templates/model-card-schema.md` for an annotated example and
   field notes.

   ML-engineer-specific overrides:
   - `generatedBy`: `"ml-engineer"`.
   - `evalSummary.cost.per1kTokens`: `null` unless the model is an LLM.
   - `modelDetails.type`: e.g. `"LightGBM classifier"`, `"XGBoost regressor"`,
     `"scikit-learn pipeline"`.

   Emit the model card (agents always emit, whether or not a UI exists):

   {{artifact.emit type=model-card path=<path_to>/model-card.json meta="title=Model Card: <project_name> panel_id=mc-<project_name>"}}

2. **Write a report** to:
   - Greenfield: `models/<name>/report.md`
   - Iteration: `<existing_service_dir>/report.md`
   - Executive summary: business problem, solution, key results
   - Model performance: baseline vs. final, with business interpretation
   - Infrastructure plan: serving, monitoring, rollback
   - Deployment checklist: what needs to happen to go live
   - Risks and mitigations

2. Summarize top findings in 3-5 bullet points
3. Present deployment checklist
4. Flag risks, open questions, and dependencies
5. Confirm the deliverable meets the definition of done

**MLOps handoff:** If the user wants to proceed to deployment, tell them:
"To deploy and operate this model, run `shards:mlops-engineer` and reference
`models/<project_name>/` as the model handoff directory."

**BI monitoring dashboard handoff:** See [`modes/bi_engineer_handoff.md`](../modes/bi_engineer_handoff.md) for the full handoff instructions (Phase 7 section).

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Phase 7

```markdown
---

## Phase 7: Review and Handoff (ML Engineer)
- **Backend Engineer Review (.py scripts):** <summary or N/A — list files reviewed, overall verdict>
- **Data Scientist Review (.ipynb notebooks):** <summary or N/A — list notebooks reviewed, overall verdict>
- **Applied ML Scientist final sign-off:** <summary if consulted> | Skipped — Phase 4 and Phase 6 AMS reviews both skipped per standard-tabular criteria
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Tier: Proceed | Proceed with caveats | Halt
  - Methodology consistency notes: <drifts surfaced or "none">
  - Model card accuracy notes: <accurate | concerns — description>
  - Stakeholder risks flagged: <list or "none">
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **MLOps Engineer Review:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Notes: <summary of infrastructure feedback>
- **Syn Review:** <included above>
- **Syn review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Model card:** <file path to model-card.json>
- **Report location:** <file path>
- **Model summary:**
  - Type: <final model type>
  - Key metric: <metric> = <value> (business interpretation)
  - Model size: <X>MB | Inference: <X>ms
- **Deployment checklist:**
  - [ ] Training pipeline deployed and tested
  - [ ] Model registered in model registry
  - [ ] Serving endpoint deployed (shadow mode first)
  - [ ] Monitoring dashboards configured
  - [ ] Alerting thresholds set
  - [ ] Rollback procedure documented and tested
  - [ ] A/B test or shadow mode plan approved
  - [ ] Feature pipeline SLA confirmed
- **Risks:**
  - <risk>: <mitigation>
- **Dependencies:**
  - <dependency>: <owner and status>
- **Open questions:**
  - <question>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
- **BI dashboard handoff:** Yes — models/<project_name>/bi_engineer_handoff.md | No
- **Write-backs proposed:**
  - <title> → <knowledge job destination> (confirmed | declined | pending)
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

{{gate kind=final}}

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
