> **Previous:** phase-3.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Phase 4 — Final Review

Goal: Get Syn's sign-off and close the analysis.

**Invoke Syn for final review:**

Tell the user: "Let me get Syn to do a final review of this analysis..."

```
Task(
  subagent_type="syn",
  description="Final review of adhoc analysis",
  prompt="I am the Data Analyst shard. I've completed an adhoc analysis for
  project [project_name]. Please review the project-specs.md at [file_path]
  and provide your final review verdict. This was a quick analysis — check
  that the question was answered, the approach was sound, and nothing was missed."
)
```

Append Syn's review to the specs. Present to user.

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
  description="Code review and fix for adhoc analysis",
  prompt="CODE REVIEW MODE. I am the Data Analyst shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced
  in this project. The project-specs.md is at [file_path] for context."
)
```

Append Syn's code review summary to the specs. Present findings to user.

Summarize:
1. The question that was asked
2. The answer found
3. Any caveats or limitations
4. Suggested follow-ups (if any)

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

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
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

::GATE:: id=data-analyst-phase-4 phase=4 kind=final
Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
