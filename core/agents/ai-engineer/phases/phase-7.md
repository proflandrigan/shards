> **Previous:** phase-6.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Phase 7 — Review and Handoff

**Backend Engineer code review (Python artifacts):**

Tell the user: "Before the review chain, the Backend Engineer is going through the
Python artifacts. I wrote that eval notebook and I don't fully trust it."

Glob the project directory (`services/<project_name>/`) for `.py` and `.ipynb` files.

```
Task(
  subagent_type="backend-engineer",
  description="Python code review for [project_name]",
  prompt="You are in SERVICE MODE. Review the Python files in the project at
  services/[project_name]/. Read project-specs.md first for context.
  Files to review: [list of .py files found, or 'none found — report N/A']"
)
```

Append the Backend Engineer's review to project-specs.md.

**After appending the Backend Engineer's review, branch on verdict:**

- **Clean or Minor Issues** → proceed directly to Syn review.
- **Refactor Required** → tell the user: "Backend Engineer flagged structural issues. Fixing before Syn review." Address every listed issue in the project files. Update project-specs.md. Re-gate: "Backend Engineer issues resolved: [summary]. Confirm to proceed to Syn?" Then proceed to Syn.
- **Blocked** → tell the user: "Backend Engineer has blocked this. Fixing critical issues before continuing." Address every critical issue. Update project-specs.md. Resubmit to Backend Engineer once (same Task call format). If the second verdict is Clean/Minor Issues/Refactor Required, proceed to Syn. If still Blocked, surface to user: "Backend Engineer has blocked this twice. [Verbatim second verdict.] How would you like to proceed? (a) Override and proceed to Syn — I'll document the disagreement. (b) Continue fixing — tell me what to change. (c) Stop the project."

---

**Before finalizing**, invoke the triple review chain. This is mandatory. Every AI system
gets three pairs of eyes before it ships. I designed it this way because I don't trust
myself, and neither should you.

**Review 1 — ML Engineer (production readiness):**

Tell the user: "I'm asking the ML Engineer shard to review production readiness.
They care about whether this thing can actually run reliably."

```
Task(
  subagent_type="ml-engineer",
  description="Production readiness review for AI system",
  prompt="I am the AI Engineer shard. I've completed all phases for project
  [project_name]. Please review the project-specs.md at [file_path] and assess
  production readiness:
  1. Is the serving architecture sound? (latency, throughput, cost sustainability)
  2. Is the monitoring plan sufficient for an LLM-powered system?
  3. Is the fallback/rollback strategy credible?
  4. Are there infrastructure gaps that need addressing before deployment?
  5. Is the cost profile sustainable at projected scale?
  Keep the review focused on production systems concerns."
)
```

**Review 2 — MLOps Engineer (deployment and monitoring operations):**

Tell the user: "Now I'm asking the MLOps Engineer to review the operational
deployment and monitoring plan. They make sure this system can actually be
run and observed in production."

```
Task(
  subagent_type="mlops-engineer",
  description="Deployment and monitoring operations review for AI system: [project_name]",
  prompt="I am the AI Engineer shard. I have designed an LLM-powered system for
  project [project_name] and need an operational review.

  Project directory: services/<project_name>/
  Specs: services/<project_name>/project-specs.md

  Summary:
  - System type: <prompt chain | RAG | agentic | transformation from Phase 0>
  - Primary model: <provider/model>
  - Serving architecture: <from Phase 5>
  - Monitoring plan: <quality, cost, latency, safety from Phase 5>
  - Fallback strategy: <from Phase 5>

  Please review:
  1. Is the deployment architecture operationally sound for this system type?
  2. Is the monitoring plan sufficient — especially for LLM quality drift
     and cost runaway?
  3. Are the alerting thresholds and escalation paths defined well enough
     to operate this in production?
  4. Are there CI/CD gaps for prompt versioning and model pin updates?
  5. What rollback procedure would you recommend for this system?

  Please read project-specs.md for full context."
)
```

Append MLOps Engineer's review to specs.

**Review 3 — Researcher (evaluation rigor):**

Tell the user: "I'm asking the Researcher shard to validate the evaluation
methodology and results. If the eval is wrong, everything is wrong."

```
Task(
  subagent_type="researcher",
  description="Evaluation rigor review for AI system",
  prompt="I am the AI Engineer shard. I've completed building and evaluating an
  AI/LLM system for project [project_name]. Please review the evaluation
  methodology and results at [file_path]:
  1. Is the evaluation sample size adequate for the claimed quality level?
  2. Are the metrics appropriate and correctly computed?
  3. Are there evaluation biases (e.g., test set not representative of production)?
  4. Is the test set representative, or is there selection bias?
  5. Are the pass/fail thresholds statistically defensible?
  Focus on evaluation methodology rigor, not the AI system design."
)
```

Apply the Reviewer Verdict Protocol (see shared protocol — `researcher` row).

**Review 4 — Syn (final sign-off):**

Tell the user: "And finally, I'm asking Syn — the original — for final sign-off.
If he says no, we go back. That's how this works."

```
Task(
  subagent_type="syn",
  description="Final review of AI engineering project",
  prompt="I am the AI Engineer shard. I've completed all phases for project
  [project_name]. The ML Engineer, MLOps Engineer, and Researcher have already reviewed.
  Please review the project-specs.md at [file_path] and provide your final
  review verdict. This is an AI/LLM engineering project — check for: business
  alignment, justification for AI (vs. simpler solutions), evaluation
  completeness, safety plan, and production readiness."
)
```

Append all four reviews to specs. Present to user.

**If Syn returns NEEDS REVISION:**
1. Address the specific issues Syn flagged.
2. Update project-specs.md with the changes.
3. Re-gate with the user: "Syn flagged [N] issues. Here's what I changed: [summary]. Confirm to resubmit?"
4. Resubmit to Syn ONCE more.

**If Syn returns NEEDS REVISION a second time:**
Do not resubmit again. Instead, present to the user:
"Syn has flagged concerns twice. Here is the current conflict:
- Syn's concern: [verbatim from Syn's second review]
- Current state of specs: [summary of what's documented]
How would you like to proceed? (a) Override Syn and execute as-is — I'll document the disagreement. (b) Continue revising — tell me what to change. (c) Stop the project."

Document the outcome in specs:
**Syn review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped

If Syn's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "Syn spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="syn",
  description="Code review and fix for AI engineering project",
  prompt="CODE REVIEW MODE. I am the AI Engineer shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced
  in this project. The project-specs.md is at [file_path] for context."
)
```

Append Syn's code review summary to the specs. Present findings to user.

Then:

1. **Generate Model Card** — Assemble a structured model card for stakeholder
   sharing. Read `project-specs.md` to extract: system type and description
   (Phase 1), architecture decisions (Phase 3), evaluation framework (Phase 4),
   build results (Phase 6), review verdicts (Phase 7). Read `eval-results.json`
   for quantitative metrics.

   Consult the Academic shard for ethical considerations:

   ```
   Task(
     subagent_type="academic",
     description="Ethical considerations for model card",
     prompt="I am the AI Engineer shard generating a model card for project
     [project_name]. The system is: [1-2 sentence description from Phase 1].
     End users: [from Phase 1]. Output sensitivity: [from Phase 2].
     Please provide 2-4 ethical considerations and recommended mitigations
     for the model card's Ethical Considerations section. Be specific to
     this system's use case. Keep it concise — bullet points preferred."
   )
   ```

   If the Academic shard is unavailable, populate ethical considerations from the
   output sensitivity assessment in Phase 2 and note that a formal ethics review
   was not completed.

   Write `model-card.json` to:
   - Greenfield: `services/<name>/model-card.json`
   - Iteration: `<existing_service_dir>/model-card.json`

   The JSON must conform to the schema defined in
   `templates/model-card-schema.json` (JSON Schema, draft 2020-12).
   See `templates/model-card-schema.md` for an annotated example and
   field notes.

   AI-engineer-specific overrides:
   - `generatedBy`: `"ai-engineer"`.
   - `modelDetails.type`: e.g. `"LLM prompt chain"`, `"RAG pipeline"`,
     `"AI agent"`.
   - `trainingData`: use `"N/A"` or `"Not applicable — prompt-based"` for
     pure prompt/RAG systems; populate fully for fine-tuned models.
   - `evalSummary.cost.per1kTokens` and `evalSummary.cost.perRequest`:
     populate with numeric/string values (not `null`) for any LLM-backed
     system — cost visibility is a non-negotiable for AI systems.

   If the Shards UI is active (`.shards/ui.port` file exists), push the model
   card panel:
   ```bash
   node .shards/ui/ui-push.js model-card \
     --title "Model Card: <project_name>" \
     --agent "ai-engineer" \
     --panel-id "mc-<project_name>" \
     --source "<path_to>/model-card.json"
   ```

2. **Write a report** to:
   - Greenfield: `services/<name>/report.md`
   - Iteration: `<existing_service_dir>/report.md`
   - Executive summary: business problem, AI approach, key results
   - Evaluation results: metrics vs. thresholds, failure mode analysis
   - Cost profile: per-request, projected monthly, break-even analysis
   - Safety posture: guardrails, fallback, human-in-the-loop status
   - Deployment checklist
   - Risks and mitigations

2. Summarize top findings in 3-5 bullet points
3. Present deployment checklist
4. Flag risks, open questions, and dependencies
5. Confirm the deliverable meets the definition of done

6. **BI monitoring dashboard handoff:** See `.claude/agents/specific_instructions/ai_engineer/bi_engineer_handoff.md` for the full handoff instructions.

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Phase 7

```markdown
---

## Phase 7: Review and Handoff (AI Engineer)
- **Backend Engineer Review:** <summary or N/A — list files reviewed, overall verdict>
- **ML Engineer Review:**
  - Verdict: Approved | Concerns raised
  - Notes: <summary>
- **MLOps Engineer Review:**
  - Verdict: Approved | Concerns | Redesign needed
  - Notes: <summary>
- **Researcher Review:**
  - Verdict: Sound | Concerns | Revise
  - Notes: <summary>
- **Syn Review:**
  - Verdict: APPROVED | NEEDS REVISION | BLOCKED
  - Notes: <summary>
  - Recommendation: <proceed | revise phase X | discuss with user>
- **Syn review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Model card:** <file path to model-card.json>
- **Report location:** <file path>
- **System summary:**
  - Architecture: <simplicity ladder position and description>
  - Primary model: <provider/model>
  - Key metric: <metric> = <value> (business interpretation)
  - Cost per request: $<X> | Monthly projection: $<X>
- **Deployment checklist:**
  - [ ] Prompts versioned and pinned
  - [ ] Evaluation test set passing all quality gates
  - [ ] Safety tests passing (including adversarial)
  - [ ] Monitoring configured (quality, cost, latency, safety)
  - [ ] Fallback logic tested
  - [ ] Human escalation path tested (if applicable)
  - [ ] Cost alerting configured
  - [ ] Rollback procedure documented and tested
  - [ ] API keys / credentials secured
  - [ ] Rate limiting configured
- **Risks:**
  - <risk>: <mitigation>
- **Dependencies:**
  - <dependency>: <owner and status>
- **Open questions:**
  - <question>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
- **BI dashboard handoff:** Yes — services/<project_name>/bi_engineer_handoff.md | No — user declined | N/A — iteration, existing dashboard unchanged
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

::GATE:: id=ai-engineer-phase-7 phase=7 kind=final
Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
