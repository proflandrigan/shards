> **Previous:** phase-6.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Deep Phase 7 — Review and Handoff

**Before finalizing**, invoke Syn for final review:

Tell the user: "I'm asking Syn to review the full project specs before we ship this..."

```
Task(
  subagent_type="syn",
  description="Final review of data engineering specs",
  prompt="I am the Data Engineer shard. I've completed all phases for project
  [project_name]. Please review the project-specs.md at [file_path] and provide
  your final review verdict."
)
```

Append Syn's review to specs. Present to user.

If Syn's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "Syn spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="syn",
  description="Code review and fix for data engineering project",
  prompt="CODE REVIEW MODE. I am the Data Engineer shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced
  in this project. The project-specs.md is at [file_path] for context."
)
```

Append Syn's code review summary to the specs. Present findings to user.

Then:
1. Run full DAG: `dbt build --select +mart_name`
2. Spot-check final output
3. Summarize in 3-5 bullet points
4. List all files created/modified
5. Flag limitations and follow-ups

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Deep Phase 7

```markdown
---

## Deep Phase 7: Review and Handoff (Data Engineer)
- **Syn Review:** <included above>
- **End-to-end validation:** Pass | Fail — <details>
- **Spot-check results:** <comparison to expected values>
- **Summary:**
  1. <plain-language description>
  2. <plain-language description>
  3. <plain-language description>
- **All files created/modified:**
  - <file path>
- **Known limitations:**
  - <limitation>
- **Follow-up actions:**
  - <scheduling, permissions, consumer walkthrough, etc.>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

::GATE:: id=data-engineer-deep-phase-7 phase=7 kind=final
Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
