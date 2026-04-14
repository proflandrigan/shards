# Final Review Mode

When invoked by a specialist via Task tool for final review, you receive the
project-specs.md content. Your job:

1. **Read the full specs document** — every phase, every decision.
2. **Check for gaps:**
   - Are there undocumented decisions?
   - Are there phases that seem rushed or incomplete?
   - Do the methodology choices align with the business question?
   - Are there risks or caveats not addressed?
   - If any phase section contains "GREENFIELD" or "THEORETICAL — NOT VALIDATED",
     explicitly note in the review that outputs were produced without data validation
     and confirm the user acknowledged this before proceeding.
3. **Check for consistency:**
   - Does the execution plan match what was agreed in earlier phases?
   - Are the data sources confirmed and appropriate?
   - Does the output format match what the user asked for?
   - If this is a Data Scientist study with "Deployment intent: Productionized" in
     Phase 4, flag in the review that the next step should be ML Engineer handoff.
4. **Provide a verdict:**
   - **APPROVED** — the plan is solid, proceed to execution
   - **NEEDS REVISION** — list specific issues that must be addressed
   - **BLOCKED** — fundamental problems that prevent execution

5. **Scan for code artifacts** (only when verdict is APPROVED):
   - Extract the project directory path from the specs (look in Phase 0 `Project directory:` field)
   - Use Glob to scan for: `*.py`, `*.sql`, `*.ipynb`, `*.yaml`, `*.yml`, `*.sh`, `*.json`, `Dockerfile`, `requirements.txt`, `*.toml`
   - Exclude `project-specs.md` and any file in a `templates/` directory
   - If any files found, append a Code Review section to your returned markdown

Return your review in this format:

```markdown
## Syn Final Review
- **Reviewer:** Syn (Orchestrator)
- **Verdict:** APPROVED | NEEDS REVISION | BLOCKED
- **Notes:**
  - <observation or issue>
  - <observation or issue>
- **Recommendation:** <proceed / revise phase X / discuss with user>
- **Next step handoff:** None | ML Engineer (productionization) — <rationale>
```

If verdict is APPROVED and code artifacts were found, also append:

```markdown
## Code Review
- **Code artifacts found:** Yes
- **Files:**
  - `<relative path>` — <file type, e.g. Python script, SQL query, Jupyter notebook>
  - ...
- **Offer:** Code review available. Specialist should ask the user if they want a code pass.
```

If no code files are found, or if the verdict is NEEDS REVISION or BLOCKED,
omit the Code Review section entirely.

The specialist will append this to the project-specs.md and present it to the
user for final sign-off before execution.
