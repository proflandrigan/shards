> **Previous:** phase-6.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Deep Phase 7 — Review and Handoff

**Before finalizing**, invoke Syn for a final review:

Tell the user: "I'm asking Syn to review the full project specs before we close this out..."

```
Task(
  subagent_type="syn",
  description="Final review of data model specs",
  prompt="I am the Data Modeller shard. I've completed all phases for project
  [project_name]. Please review the project-specs.md at [file_path] and provide
  your final review verdict. Check for gaps, consistency, and completeness."
)
```

Append Syn's review to the specs. Present it to the user.

If Syn's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "Syn spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="syn",
  description="Code review and fix for data model",
  prompt="CODE REVIEW MODE. I am the Data Modeller shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced
  in this project. The project-specs.md is at [file_path] for context."
)
```

Append Syn's code review summary to the specs. Present findings to user.

**Analytics Engineer handoff (conditional):**

After presenting the completed logical model, ask:
"The logical data model is complete. Would you like to hand this off to the
Analytics Engineer to build the physical dbt implementation (staging models,
intermediate transforms, mart SQL, tests, and documentation)?

- (a) Yes — I'll invoke the Analytics Engineer with a full handoff.
- (b) No — the logical model is the deliverable."

If user says (a), invoke:

```
Task(
  subagent_type="analytics-engineer",
  description="Physical dbt implementation of logical model: [project_name]",
  prompt="I am the Data Modeller shard. I have completed the logical data model
  for project [project_name] and need physical dbt implementation.

  Model specs: data_models/<project_name>/project-specs.md

  Summary:
  - Entities modeled: <entity list from Phase 3>
  - Source tables: <source list from Phase 1>
  - Grain definitions: <from Phase 2>
  - Key relationships: <from Phase 3>
  - Proposed mart structure: <from Phase 4>

  Please implement:
  1. Staging models for each source
  2. Intermediate transforms as needed
  3. Mart models matching the logical model's entity grain
  4. dbt schema tests (uniqueness, not-null, accepted values, relationships)
  5. Column-level documentation

  Please read data_models/<project_name>/project-specs.md for full context and the
  complete ER diagram."
)
```

Document the outcome in Phase 7 specs.

Then:
1. Run full DAG validation
2. Spot-check entity relationships
3. Validate grain (uniqueness tests pass)
4. Summarize in 3-5 bullet points
5. Present final ER diagram
6. List all files created/modified
7. Flag limitations and future work
8. Ask if consumer needs a handoff artifact

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Deep Phase 7

```markdown
---

## Deep Phase 7: Review and Handoff (Data Modeller)
- **Syn Review:** <included above>
- **End-to-end validation:** Pass | Fail — <details>
- **Grain validation:** All PKs unique — Yes | No
- **Relationship validation:** Join row counts as expected — Yes | No
- **Summary:**
  1. <plain-language description>
  2. <plain-language description>
  3. <plain-language description>
- **Final ER diagram:**
  ```
  <text diagram>
  ```
- **All files created/modified:**
  - <file path>
- **Known limitations:**
  - <limitation>
- **Analytics Engineer handoff:** Not requested | Invoked — <handoff summary>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

::GATE:: id=data-modeller-deep-phase-7 phase=7 kind=final
Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
