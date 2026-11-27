---
name: code-review-protocol
description: Code pass run by the specialist in its own final phase — partition the project's code by type, consult the domain reviewer for each bucket, gate, then apply the approved fixes
type: reference
---

# Code Review Protocol

Run this when Syn's final review includes a "Code Review" section and the user
wants the code pass (see the Code Review follow-up in
`protocols/syn_review_resolution.md`). You, the specialist who owns the project,
run every step in your own frame. Reviewers are consulted read-only; you hold
the gate and you apply the approved fixes.

## Step 1: Read project context

Use `project-specs.md` (already loaded) for the business question, what was
built and why, data sources, grain and key definitions. Every reviewer brief
below points at it.

## Step 2: Partition the code artifacts

Use the files Syn's Code Review section listed. Otherwise Glob the `## Placement`
targets and the project folder separately for:
- **SQL:** `*.sql`
- **Python scripts:** `*.py`
- **Jupyter notebooks:** `*.ipynb`
- **Config/infra:** `*.yaml`, `*.yml`, `*.sh`, `*.json`, `Dockerfile`, `requirements.txt`, `*.toml`

Exclude `project-specs.md` and files in `templates/` directories. Skip empty buckets.

**Notebook reviewer.** Notebooks are reviewed by a domain-aware specialist, never
the Backend Engineer. Pick by the project directory:

| Project directory prefix | Notebook reviewer |
|--------------------------|-------------------|
| `shards/<project>/` | By the `agent` field in its `project-specs.md` header: Data Scientist or Data Analyst -> Data Scientist; any other -> ML Engineer |
| `studies/`, `analysis/` | Data Scientist |
| `models/`, `research/`, `services/` | ML Engineer |
| anything else | If the path is a target in some `shards/*/project-specs.md` or `shards/*/mlops/project-specs.md` `## Placement` table, use that project's row above; otherwise ML Engineer |

**Never review your own work.** If the picked notebook reviewer is you, use the
other one (Data Scientist <-> ML Engineer). If you are the reviewer for another
bucket (the Analytics Engineer for SQL, the MLOps Engineer for config/infra),
skip that bucket and say in the summary that your own phase checks covered it.

## Step 3: Consult a reviewer per bucket

Consult the reviewers for the non-empty buckets, in parallel when there are
several. Each one reviews only; none applies fixes. Use this brief for each,
naming the bucket:

```
SERVICE MODE — CODE REVIEW. Review the following <SQL files | Python scripts |
Jupyter notebooks | config/infra files> for project <project_name>.
project-specs.md is at <path>; read it first for context.
Files to review: <list>
Review only. For each issue give file, line, the exact change to make, and
whether it is a fix or a caveat.
```

- SQL: {{consult analytics-engineer entry=service task="SQL code review for <project_name>"}}
- Python scripts: {{consult backend-engineer entry=service task="Python code review for <project_name>"}}
- Notebooks, Data Scientist: {{consult data-scientist entry=service task="Notebook code review for <project_name>"}} (start the brief with `SERVICE MODE — NOTEBOOK CODE REVIEW`)
- Notebooks, ML Engineer: {{consult ml-engineer entry=service task="Notebook code review for <project_name>"}} (start the brief with `SERVICE MODE — NOTEBOOK CODE REVIEW`)
- Config/infra: {{consult mlops-engineer entry=service task="Config/infra code review for <project_name>"}}

Take each review as returned; do not re-review the files yourself.

## Step 4: Gate before fixing

Present the consolidated findings, one section per bucket, then ask:
"Apply fixes? (y to fix all, n to skip, or list specific filenames)"

Call `gate_request` with `kind=confirm`, your current phase number, the id of
your current phase gate with `.code-review` appended (for example
`data-scientist-phase-7.code-review` or `analytics-engineer-deep-phase-8.code-review`),
`requires_human=true`, and the consolidated findings as the `summary`. Write the
consolidated findings to the project record first and pass that section as `record_ref`.
Stop and wait for the user. Never confirm it yourself, and apply nothing before it is
confirmed. Relay the user's reply verbatim with `gate_confirm`: **y** or a list of files
→ `decision: confirmed` (apply only the listed files when a list is given); **n** →
`decision: changes_requested`, skip Step 5 and record "no fixes applied" in Step 6.

## Step 5: Apply the approved fixes

Apply exactly the approved fixes, file by file, with the editing tools
(the notebook editing tool for `.ipynb`). Read back each changed region. If a fix
needs more than the reviewer's stated change, stop and ask the user, and
re-consult that reviewer on the changed files before you record it.

## Step 6: Record the result

Append to `project-specs.md` and present it to the user:

```markdown
## Code Review
- **Reviewers:** <Analytics Engineer (SQL)> + <Backend Engineer (.py)> + <Data Scientist|ML Engineer (.ipynb)> + <MLOps Engineer (config/infra)>
- **Files reviewed:** N
- **Issues found:** N
- **Fixes applied:** N

### <Bucket> (<reviewer>)
<per-file findings and fix status, "no files", or "covered by own phase checks">
```

If a reviewer reports a file clean, say so; do not invent issues.
