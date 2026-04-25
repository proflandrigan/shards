> **Previous:** phase-7.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Deep Phase 8 — Peer Review and Handoff

**Before finalizing**, invoke peer reviews in parallel, then Syn for sign-off.

**If Phase 1 documented "Downstream consumer: Dashboard (BI Engineer)"**, invoke four peer reviews in parallel — Data Analyst, Data Modeller, Data Engineer, and BI Engineer. Otherwise, invoke three (Data Analyst, Data Modeller, Data Engineer).

Tell the user: "Sending this out for peer review before we call it done. Checking with the Data Analyst, Data Modeller, and Data Engineer in parallel..." (add "and BI Engineer" if applicable).

Invoke all applicable reviews in parallel:

```
Task(
  subagent_type="data-analyst",
  description="Business requirements review for [project] mart",
  prompt="I am the Analytics Engineer shard. I've built the [mart_name] mart for
  project [project_name]. The project-specs.md is at [file_path].

  Please review and return:
  1. Does the mart answer the business questions stated in Phase 1? List each
     question and whether the mart supports it.
  2. Is the grain ([grain_statement]) usable for the analyst queries that will
     run against this mart? Is the grain too fine, too coarse, or correct?
  3. Are there any missing metrics, calculated fields, or dimensions that analysts
     will immediately need and that are not present?
  4. Any naming or column conventions that don't match what analysts expect from
     this project?

  Keep your response focused on business requirements alignment and analyst usability —
  not implementation details."
)
```

```
Task(
  subagent_type="data-modeller",
  description="Grain and entity conformance review for [project] mart",
  prompt="I am the Analytics Engineer shard. I've built the [mart_name] mart for
  project [project_name]. The project-specs.md is at [file_path].

  Please review and return:
  REVIEW mode — run the full validation suite:
  1. Does the implemented mart match the designed grain from Phase 3?
     Run a PK uniqueness check on [pk_column] in [mart_model].
  2. Do the FK relationships hold? Run null checks on [fk_columns].
  3. Are there any join fan-out issues? Check [specific joins flagged in Phase 3].
  4. Does the mart conform with other marts in the project? Are there
     entity conformance issues?

  Return in the standard Data Model Review format."
)
```

```
Task(
  subagent_type="data-engineer",
  description="Staging and infrastructure review for [project] mart",
  prompt="I am the Analytics Engineer shard. I've built the [mart_name] mart for
  project [project_name]. The project-specs.md is at [file_path].

  Please review and return:
  1. Are the staging models used by this mart correctly defined? Are there any
     staging layer issues I've inherited?
  2. Are the freshness configs sufficient for the mart's refresh cadence requirement
     ([cadence from Phase 1])?
  3. Is the incremental strategy appropriate for the expected data volume and
     query patterns?
  4. Any pipeline concerns I should flag to the user before we ship this?

  Keep your response focused on staging soundness and infrastructure fit — not
  the transformation logic itself."
)
```

**BI Engineer mart-usability review (only if Phase 1 downstream consumer is "Dashboard (BI Engineer)"):**

```
Task(
  subagent_type="bi-engineer",
  description="Mart usability review for dashboard consumption — [project]",
  prompt="I am the Analytics Engineer shard. I've built [mart_name] for project [project_name].
  Grain: [grain statement from Phase 3].
  Key columns: [column list from Phase 4 model design].
  Business questions it answers: [from Phase 1].
  Dashboard consumer: [from Phase 1].

  Please review from a dashboard design perspective:
  1. Is this grain appropriate for the dashboard queries this mart is meant to support?
  2. Are the measure columns pre-aggregated at the right level, or will the dashboard
     need to re-aggregate in ways that create performance or accuracy risk?
  3. Is there a date dimension / date spine suitable for time-series charts?
  4. Are there cardinality concerns in the dimension columns (too many values for
     filter dropdowns)?
  5. Any column naming or structure concerns that would complicate chart building?

  Keep the review brief and actionable. Return verdict: Suitable | Concerns | Redesign."
)
```

Apply the Reviewer Verdict Protocol independently for each reviewer (see shared protocol — `data-analyst`, `data-modeller`, `data-engineer`, `bi-engineer` rows). Address all Halt-tier verdicts before invoking Syn.

**Then invoke Syn for final sign-off:**

Tell the user: "I'm asking Syn to review the full project specs before we ship this..."

```
Task(
  subagent_type="syn",
  description="Final review of analytics engineering specs",
  prompt="I am the Analytics Engineer shard. I've completed all phases for project
  [project_name]. Please review the project-specs.md at [file_path] and provide
  your final review verdict. Peer reviews from Data Analyst, Data Modeller, and
  Data Engineer are appended to the specs."
)
```

Append Syn's review to specs. Present to user.

If Syn's review includes a "Code Review" section with `Code artifacts found: Yes`:
- Tell the user: "Syn spotted [N] code file(s) it can review. Want a code pass? (y/n)"
- If yes, invoke:

```
Task(
  subagent_type="syn",
  description="Code review for analytics engineering project",
  prompt="CODE REVIEW MODE. I am the Analytics Engineer shard. Project: [project_name].
  Directory: [project_dir]. Please review and fix the code artifacts produced in
  this project. The project-specs.md is at [file_path] for context."
)
```

Append Syn's code review summary to the specs. Present findings to user.

Then:
1. Run the full DAG using the stack's build command
2. Spot-check final mart output (row count, spot-check key metrics)
3. Summarize in 3-5 bullet points
4. List all files created/modified
5. Flag limitations and follow-ups

6. **BI dashboard handoff:** See `.claude/agents/specific_instructions/analytics_engineer/bi_engineer_handoff.md` for the full handoff instructions. Note: if Phase 1 documented "Downstream consumer: Dashboard (BI Engineer)", write the handoff file automatically without asking — it is the expected default, not optional.

7. **Data Analyst handoff:** See `.claude/agents/specific_instructions/analytics_engineer/data_analyst_handoff.md` for the full handoff instructions. Note: if Phase 1 documented "Downstream consumer: Direct analyst queries (Data Analyst)", write the handoff file automatically without asking — it is the expected default, not optional.

**Knowledge harvest.** Before closing, extract reusable knowledge from this project.
Read `.claude/agents/specific_instructions/shared/knowledge_harvest.md` and follow
the protocol. Present candidates to the user for confirmation before writing.

### Document Deep Phase 8

```markdown
---

## Deep Phase 8: Peer Review and Handoff (Analytics Engineer)
- **Data Analyst review:** <summary of findings>
  - Verdict: Aligned | Concerns raised
  - Tier: Proceed | Proceed with caveats
  - Business requirements met: Yes | Partially | No — <gaps>
  - Grain usability: Correct | Too fine | Too coarse — <notes>
  - Missing elements: <list or "none">
  - Reviewer resolution: Approved | User override — <rationale>
- **Data Modeller review:** <summary of validation results>
  - Verdict: Sound | Concerns | Revise
  - Tier: Proceed | Proceed with caveats | Halt
  - Grain validation: PASS | FAIL — <details>
  - FK null checks: PASS | FAIL — <details>
  - Conformance: Sound | Issues — <details>
  - Reviewer resolution: Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Data Engineer review:** <summary of findings>
  - Verdict: Sound | Concerns
  - Tier: Proceed | Proceed with caveats
  - Staging soundness: Sound | Concerns — <details>
  - Freshness configs: Sufficient | Insufficient — <details>
  - Incremental strategy: Appropriate | Concerns — <details>
  - Reviewer resolution: Approved | User override — <rationale>
- **BI Engineer mart-usability review:** Not applicable — downstream consumer is not a BI dashboard | <summary of findings>
  - Verdict: Suitable | Concerns | Redesign
  - Date spine: Present | Missing — <notes>
  - Aggregation level: Appropriate | Too fine | Too coarse — <notes>
  - Dimension cardinality: OK | High-cardinality concerns — <details>
  - Reviewer resolution: Approved | User override — <rationale>
- **Syn Review:** <included above>
- **Peer review issues addressed:**
  - <issue and fix, or "none — all reviews clean">
- **End-to-end validation:** Pass | Fail — <details>
- **Spot-check results:** <mart row count, key metric spot-check>
- **Summary:**
  1. <plain-language description>
  2. <plain-language description>
  3. <plain-language description>
- **All files created/modified:**
  - <file path>
- **Known limitations:**
  - <limitation>
- **Follow-up actions:**
  - <consumer walkthrough, downstream consumer notification, metrics layer, etc.>
- **Original request fulfilled:** Yes | Partially | No — <explanation>
- **BI dashboard handoff:** Yes (auto — BI downstream consumer) — data_models/<project_name>/bi_engineer_handoff.md | Yes (user requested) — data_models/<project_name>/bi_engineer_handoff.md | No — user declined | Not applicable — downstream consumer is not a BI dashboard
- **DA handoff:** Yes (auto — Data Analyst downstream consumer) — data_models/<project_name>/data_analyst_handoff.md | Yes (user requested) — data_models/<project_name>/data_analyst_handoff.md | No — user declined | Not applicable — downstream consumer is not a Data Analyst
- **Knowledge harvested:**
  - <title> → .shards/knowledge/<type>/<filename>.md
  - Or: None — project did not produce reusable knowledge
- **Status:** Complete
```

Update specs header status to `Complete`.

::GATE:: id=analytics-engineer-deep-phase-8 phase=8 kind=final
Read this final section back to the user. Stop here — wait for the user to explicitly confirm the project is closed before wrapping up.
::ENDGATE::

---

## When this gate is confirmed

This is the final phase. Once Syn returns APPROVED sign-off, the project is complete. Do not read further files.
