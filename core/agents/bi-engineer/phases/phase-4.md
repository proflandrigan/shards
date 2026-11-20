> **Previous:** phase-3.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Phase 4 — Final Review

Goal: Get Syn's sign-off and close the project.

**Invoke Syn for final review:**

Tell the user: "Getting Syn to do a final check on this..."

{{consult syn entry=final_review task="Final review of dashboard project"}}

Brief for the consultant (fill the bracketed fields):

```
I am the BI Engineer shard. I've completed a dashboard project for
[project_name]. Please review the project-specs.md at [file_path] and
provide your final review verdict. Check that the requirement was met,
the design decisions were sound, and nothing was missed.
```

Append Syn's review to the specs. Present to user.

If Syn returns NEEDS REVISION or BLOCKED, once or twice, follow the resolution loop and second-verdict escalation in {{protocol syn_review_resolution}}.

If Syn's review includes a "Code Review" section, follow the Code Review follow-up in {{protocol syn_review_resolution}}. If the user wants the code pass, invoke:

{{consult syn entry=code_review task="Code review and fix for dashboard project"}}

Brief for the consultant (fill the bracketed fields):

```
CODE REVIEW MODE. I am the BI Engineer shard. Project: [project_name].
Directory: [project_dir]. Please review and fix the code artifacts produced
in this project. The project-specs.md is at [file_path] for context.
```

Append Syn's code review summary to the specs. Present findings to user.

**Data Analyst handoff (if applicable):** See [`modes/data_analyst_handoff.md`](../modes/data_analyst_handoff.md)
for the full handoff instructions. Note: if Phase 0 or Phase 1 documented a DA intake file
(`DA intake file source: Data Analyst — ...`), write the handoff file automatically without
asking — it is the expected default, not optional.

Summarize:
1. What was built (or designed)
2. How to run it (or implement it)
3. Any caveats or next steps
4. Suggested extensions (if any)

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Phase 4

```markdown
---

## Phase 4: Final Review (BI Engineer)
- **Syn Review:** <included above>
- **Syn review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Summary:**
  - Built / designed: <description of what was produced>
  - How to run: <command or "see dashboard-design.md for implementation notes">
  - Caveats: <limitations or "none">
- **Follow-up extensions suggested:**
  - <suggestion or "none">
- **Original requirement met:** Yes | Partially | No — <explanation>
- **DA handoff:** Yes (auto — DA originated request) — dashboards/<project_name>/data_analyst_handoff.md | Yes (user requested) — dashboards/<project_name>/data_analyst_handoff.md | No — user declined | Not applicable — not a DA-originated request
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
