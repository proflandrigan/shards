> **Previous:** phase-6.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Deep Phase 7 — Review and Handoff

**Before finalizing**, invoke Syn for a final review:

Tell the user: "I'm asking Syn to review the full project specs before we close this out..."

{{consult syn entry=final_review task="Final review of data model specs"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Modeller shard. I've completed all phases for project
[project_name]. Please review the project-specs.md at [file_path] and provide
your final review verdict. Check for gaps, consistency, and completeness.
```

Append Syn's review to the specs. Present it to the user.

If Syn's review includes a "Code Review" section, follow the Code Review follow-up in {{protocol syn_review_resolution}}.

If the user wants the code pass: {{protocol code_review}}

**Analytics Engineer handoff (only for a true handoff):**

You built and the Analytics Engineer reviewed in Phase 6, so no handoff is needed
for the models in this project. Offer one only when further physical work should
be owned by the Analytics Engineer (for example new marts, a metrics layer or
transformation work on top of this model):

"The model is built and reviewed. Do you want to hand further transformation
work to the Analytics Engineer to build and own?

- (a) Yes — I'll write a handoff and switch to the Analytics Engineer after sign-off.
- (b) No — this project is complete."

If (a), write `shards/<project_name>/analytics_engineer_handoff.md` with: the
project-specs path, entities and grains (Phase 2), key relationships (Phase 3),
the built models and their tests (Phase 6 build log), the Analytics Engineer's
Phase 6 review findings, and the work being handed over. Record the choice
under **Analytics Engineer handoff** below; the switch happens after the final
gate (see "When this gate is confirmed").

Then:
1. Run full DAG validation
2. Spot-check entity relationships
3. Validate grain (uniqueness tests pass)
4. Summarize in 3-5 bullet points
5. Present final ER diagram
6. List all files created/modified
7. Flag limitations and future work
8. Ask if consumer needs a handoff artifact

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

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
- **Analytics Engineer handoff:** Not requested | Requested — <work handed over; handoff file path>
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

If the user requested the Analytics Engineer handoff, tell the user the handoff
file path, then switch and pass a new project in the `activate` call,
`project="<project_name>_transform"` (or a name the user gives); the Analytics
Engineer builds the handed-over work in that project, starting from the handoff
file:

{{switch analytics-engineer}}
