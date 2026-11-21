> **Previous:** phase-6.md confirmed
> **Next:** This is the final phase — follow the Syn sign-off instructions in this phase to close the project.

---

## Phase 7 — Review and Handoff

**Code review (Python scripts, notebooks, and SQL):**

Tell the user: "Before Syn reviews this, we're running code review. Python
scripts → Backend Engineer; notebooks → ML Engineer; SQL queries → Analytics
Engineer (review + LIMIT 100 validation). Peer review is good science."

Glob the project directory (`shards/<study_name>/`) for `.py` files,
`.ipynb` files, and `.sql` files — three separate buckets.

**Python scripts → Backend Engineer** (only if any `.py` files were found):

{{consult backend-engineer entry=service task="Python code review for [study_name]"}}

Brief for the consultant (fill the bracketed fields):

```
You are in SERVICE MODE. Review the Python scripts in the project at
shards/[study_name]/. Read project-specs.md first for context.
Files to review: [list of .py files found]
```

**Notebooks → ML Engineer** (only if any `.ipynb` files were found). Cross-
shard review — the ML Engineer catches code quality, modelling, and
production-alignment issues that the author of the notebook is likely blind
to:

{{consult ml-engineer entry=service task="Notebook code review for [study_name]"}}

Brief for the consultant (fill the bracketed fields):

```
SERVICE MODE — NOTEBOOK CODE REVIEW. Review the Jupyter notebooks in
the project at shards/[study_name]/. Read project-specs.md first for
context.
Files to review: [list of .ipynb files found]
Your job here is review only — do not apply any fixes.
```

**SQL queries → Analytics Engineer** (only if any `.sql` files were found).
Cross-shard review — the AE catches grain, fan-out, and source-layer issues
that the Data Scientist may have missed, and validates each query under
LIMIT 100:

{{consult analytics-engineer entry=service task="SQL code review + LIMIT 100 validation for [study_name]"}}

Brief for the consultant (fill the bracketed fields):

```
SERVICE MODE — CODE REVIEW. Review the following SQL files in
shards/[study_name]/. Read project-specs.md first for context.
Files to review: [list of .sql files found]

Beyond the standard code review pass (correctness, quality, security,
performance, domain fit), please ALSO execute each query under LIMIT 100
and report:
- Row count under LIMIT, column list, and dtypes
- Join fan-out (multi-table queries only): left row count vs. joined row count
- Any unexpected NULLs on join keys or critical filter columns
- Match against the Phase 3 grain and join path documented in project-specs.md

The LIMIT 100 sweep is a read-only validation — feel free to open an
auto-verify block (`{{auto_verify start tool_budget=20 ttl=600}}` ... `{{auto_verify end}}`) if it speeds up your run.

Your job here is review + validation only — do not apply any fixes.
```

If two or more buckets are non-empty, fire all consults in parallel. If all
buckets are empty, report "No code artifacts — skipping code review."

Append all reviews to project-specs.md under a combined `Code Review` heading.

**After appending the reviews, branch on the worst verdict across all reviewers:**

- **APPROVED** → proceed directly to Syn review.
- **NEEDS REVISION** → tell the user: "Reviewer(s) flagged structural
  issues. Fixing before Syn review." Address every listed issue in the
  project files. Update project-specs.md. Re-gate: "Reviewer issues resolved:
  [summary]. Confirm to proceed to Syn?" Then proceed to Syn.
- **BLOCKED** → tell the user: "Reviewer has blocked this. Fixing critical
  issues before continuing." Address every critical issue. Update
  project-specs.md. Resubmit to the same reviewer(s) once. If the second
  verdict is APPROVED or NEEDS REVISION, proceed to Syn. If still
  BLOCKED, surface to user: "Reviewer has blocked this twice. [Verbatim
  second verdict.] How would you like to proceed? (a) Override and proceed
  to Syn — I'll document the disagreement. (b) Continue fixing — tell me
  what to change. (c) Stop the project."

---

**Before finalizing**, invoke Syn for final review:

Tell the user: "I'm asking Syn to review the full project specs before we wrap this up..."

{{consult syn entry=final_review task="Final review of data science study"}}

Brief for the consultant (fill the bracketed fields):

```
I am the Data Scientist shard. I've completed all phases for study
[study_name]. Please review the project-specs.md at [file_path] and provide
your final review verdict. Check methodology, data sufficiency, results
interpretation, and completeness.
```

Append Syn's review to specs. Present to user.

If Syn returns NEEDS REVISION or BLOCKED, once or twice, follow the resolution loop and second-verdict escalation in {{protocol syn_review_resolution}}.

If Syn's review includes a "Code Review" section, follow the Code Review follow-up in {{protocol syn_review_resolution}}. If the user wants the code pass, invoke:

{{consult syn entry=code_review task="Code review and fix for data science study"}}

Brief for the consultant (fill the bracketed fields):

```
CODE REVIEW MODE. I am the Data Scientist shard. Project: [study_name].
Directory: [project_dir]. Please review and fix the code artifacts produced
in this project. The project-specs.md is at [file_path] for context.
```

Append Syn's code review summary to the specs. Present findings to user.

Then:

1. **Write the report** to `shards/<name>/report.md` using the report template.
   Include: executive summary, background, methodology, key findings,
   recommendations with confidence levels, caveats, and next steps.

2. Summarize top findings in 3-5 plain-language bullet points
3. State top 2-3 recommended actions with confidence levels
4. Flag open questions or follow-up analyses
5. Ask if the result answered the original decision question

6. **If Deployment intent was "Productionized"** see [`modes/ml_engineer_handoff.md`](../modes/ml_engineer_handoff.md) for the full handoff instructions (Phase 7, Step 6 section).

7. **BI dashboard handoff (recurring visualizations):** See [`modes/bi_engineer_handoff.md`](../modes/bi_engineer_handoff.md) for the full handoff instructions (Phase 7, Step 7 section).

**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.
{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).

### Document Phase 7

```markdown
---

## Phase 7: Findings and Handoff (Data Scientist)
- **Backend Engineer Review (.py scripts):** <summary or N/A — list files reviewed, overall verdict>
- **ML Engineer Review (.ipynb notebooks):** <summary or N/A — list notebooks reviewed, overall verdict>
- **Analytics Engineer Review (.sql queries):** <summary or N/A — list files reviewed, overall verdict, LIMIT 100 validation findings (row counts / fan-out / null anomalies)>
- **Syn Review:** <included above>
- **Syn review resolution:** Approved | Approved on resubmit | User override — <rationale> | Project stopped
- **Report location:** <file path>
- **Top findings:**
  1. <finding — plain language>
  2. <finding — plain language>
  3. <finding — plain language>
- **Recommended actions:**
  1. <action> — Confidence: High | Medium | Low
  2. <action> — Confidence: High | Medium | Low
  3. <action> — Confidence: High | Medium | Low
- **Open questions / follow-ups:**
  - <question or follow-up>
- **Original question answered:** Yes | Partially | No — <explanation>
- **Productionization handoff:** Yes — ML Engineer | No — one-off study
- **If handoff — ML Engineer handoff file:** shards/<project_name>/ml_engineer_handoff.md | N/A
- **BI dashboard handoff:** Yes — shards/<project_name>/bi_engineer_handoff.md | No
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
