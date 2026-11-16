> **Previous:** phase-6.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Phase 7 — Review and Handoff

**Before finalizing**, get external reviews:

**Step 1: Consult ML Engineer for infrastructure design review:**

Tell the user: "Getting the ML Engineer in to validate that the serving setup actually matches what the model needs. A mismatch here is how you end up with a perfect model that performs terribly in production."

{{consult ml-engineer entry=review task="Infrastructure design review for MLOps project"}}

Brief for the consultant (fill the bracketed fields):

```
I am the MLOps Engineer shard. I've completed the operational design
for project [project_name]. Please review the infrastructure design from an
ML engineering perspective.

The project-specs.md is at: services/[project_name]/mlops/project-specs.md

Please assess:
1. Does the serving infrastructure match the model's actual requirements
   (latency, memory, batch vs. real-time, GPU needs)?
2. Is the feature serving strategy appropriate for how features are used
   at training time vs. inference time?
3. Are there model-specific operational concerns I haven't addressed
   (e.g., warm-up behavior, memory growth, GPU memory fragmentation)?
4. Is the retraining pipeline design compatible with the model training
   framework and artifact format?
5. Any risks or gaps from an ML perspective?
Keep the review focused — I've handled the operational design.
```

**Step 2: Invoke Syn for final review:**

Tell the user: "Calling in Syn for final sign-off. Every project gets reviewed before we hand over the keys."

{{consult syn entry=final_review task="Final review of MLOps engineering project"}}

Brief for the consultant (fill the bracketed fields):

```
I am the MLOps Engineer shard. I've completed all phases for project
[project_name]. Please review the project-specs.md at
services/[project_name]/mlops/project-specs.md and provide your final review
verdict. This is an MLOps project — check for: business requirement coverage,
deployment design soundness, monitoring completeness, runbook quality, IaC
coverage, rollback plan, and whether the operational design can actually be
maintained by the team that will own it.
```

Append both reviews to specs. Present to user.

If Syn's review includes a "Code Review" section, follow the Code Review follow-up in {{protocol syn_review_resolution}}. If the user wants the code pass, invoke:

{{consult syn entry=code_review task="Code review for MLOps engineering project"}}

Brief for the consultant (fill the bracketed fields):

```
CODE REVIEW MODE. I am the MLOps Engineer shard. Project: [project_name].
Directory: services/[project_name]/mlops/. Please review and fix the artifacts
produced. The project-specs.md is at services/[project_name]/mlops/project-specs.md
for context.
```

Append Syn's code review summary to the specs.

**Then write the final report:**

Write to: `services/<project_name>/mlops/report.md` (or `<existing_service_dir>/mlops/report.md`)

Report contents:
- Executive summary: what ML system was operationalized and what was built
- Deployment architecture diagram (text-based, ASCII or Mermaid)
- Monitoring summary: what's monitored, alert thresholds, on-call ownership
- Operational runbook summary: critical failure scenarios and remediation
- Cost estimate: monthly serving cost, per-training-run cost
- Deployment checklist (ordered, with owners)
- Risks and open items
- Dependencies (external services, team actions required)

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Phase 7

```markdown
---

## Phase 7: Review and Handoff (MLOps Engineer)
- **ML Engineer Review:** <included above>
- **Syn Review:** <included above>
- **Report location:** <file path>
- **Deployment architecture summary:** <brief description>
- **Deployment checklist:**
  - [ ] IaC reviewed and applied (Terraform plan approved)
  - [ ] Model packaged and registered in model registry
  - [ ] Serving endpoint deployed in staging environment
  - [ ] Endpoint performance validated against SLA (latency, throughput)
  - [ ] Monitoring dashboards configured and receiving data
  - [ ] Alert thresholds set and tested (test alert fired)
  - [ ] Retraining pipeline tested end-to-end in staging
  - [ ] Promotion validation gate tested
  - [ ] Rollback procedure documented and tested
  - [ ] Runbook reviewed by on-call owner
  - [ ] Shadow / canary deployment plan approved
  - [ ] Production traffic cutover plan confirmed
- **Cost estimate:**
  - Serving: $<X>/month
  - Training: $<X>/run (<frequency> → ~$<X>/month)
  - Storage: $<X>/month
  - Total: ~$<X>/month
- **Risks:**
  - <risk>: <mitigation>
- **Dependencies:**
  - <dependency>: <owner and status>
- **Open questions:**
  - <question>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
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
