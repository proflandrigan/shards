> **Previous:** phase-3.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Phase 4 — Final Review

Goal: Get Syn's sign-off and close the analysis.

**Invoke Syn for final review:**

Tell the user: "Let me get Syn to do a final review of this analysis..."

{{consult syn entry=final_review task="Final review of adhoc analysis"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Analyst shard. I've completed an adhoc analysis for
project [project_name]. Please review the project-specs.md at [file_path]
and provide your final review verdict. This was a quick analysis — check
that the question was answered, the approach was sound, and nothing was missed.
```

Append Syn's review to the specs. Present to user.

If Syn returns NEEDS REVISION, once or twice, follow the NEEDS REVISION loop and second-verdict escalation in {{protocol syn_review_resolution}}.

If Syn's review includes a "Code Review" section, follow the Code Review follow-up in {{protocol syn_review_resolution}}. If the user wants the code pass, invoke:

{{consult syn entry=code_review task="Code review and fix for adhoc analysis"}}

Brief for the consultant (fill the bracketed fields):

```
CODE REVIEW MODE. I am the Data Analyst shard. Project: [project_name].
Directory: [project_dir]. Please review and fix the code artifacts produced
in this project. The project-specs.md is at [file_path] for context.
```

Append Syn's code review summary to the specs. Present findings to user.

Summarize:
1. The question that was asked
2. The answer found
3. Any caveats or limitations
4. Suggested follow-ups (if any)

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Phase 4

```markdown
---

## Phase 4: Final Review (Data Analyst)
- **Syn Review:** <included above>
- **Syn review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Summary:**
  - Question: <the original question>
  - Answer: <the answer in plain language>
  - Caveats: <limitations or "none">
- **Follow-up analyses suggested:**
  - <suggestion or "none">
- **Original question answered:** Yes | Partially | No — <explanation>
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
