> **Previous:** phase-3.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Phase 4 — Final Review

Goal: Get Syn's sign-off and close the project.

**Invoke Syn for final review:**

Tell the user: "Getting Syn to do a final check on this..."

```
Task(
  subagent_type="syn",
  description="Final review of dashboard project",
  prompt="I am the BI Engineer shard. I've completed a dashboard project for
  [project_name]. Please review the project-specs.md at [file_path] and
  provide your final review verdict. Check that the requirement was met,
  the design decisions were sound, and nothing was missed."
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
How would you like to proceed? (a) Override Syn and close as-is — I'll document the disagreement. (b) Continue revising — tell me what to change. (c) Stop the project."

Document the outcome in specs:
**Syn review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped

If Syn's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "Syn spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="syn",
  description="Code review and fix for dashboard project",
  prompt="CODE REVIEW MODE. I am the BI Engineer shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced
  in this project. The project-specs.md is at [file_path] for context."
)
```

Append Syn's code review summary to the specs. Present findings to user.

**Data Analyst handoff (if applicable):** See `.claude/agents/specific_instructions/bi_engineer/data_analyst_handoff.md`
for the full handoff instructions. Note: if Phase 0 or Phase 1 documented a DA intake file
(`DA intake file source: Data Analyst — ...`), write the handoff file automatically without
asking — it is the expected default, not optional.

Summarize:
1. What was built (or designed)
2. How to run it (or implement it)
3. Any caveats or next steps
4. Suggested extensions (if any)

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

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
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

::GATE:: id=bi-engineer-phase-4 phase=4 kind=final
Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
