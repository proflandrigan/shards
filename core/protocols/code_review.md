---
name: code-review-protocol
description: Code pass run by the specialist in its own final phase — partition the project's code by type, consult or (when code execution is approved) verify with a review lead for each bucket, gate, then apply the approved fixes
type: reference
---

# Code Review Protocol

Run this when Syn's final review includes a "Code Review" section and the user
wants the code pass (see the Code Review follow-up in
`protocols/syn_review_resolution.md`). You, the specialist who owns the project,
run every step in your own frame. Reviewers never apply fixes and write nothing in
the project; verifiers write only in their scratch dirs. You hold the gate and you
apply the approved fixes.

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

Before dispatch, offer verified review. Ask once in chat: "Run verified review?
Reviewers may run only the commands you name, for this review only (default no)."
Name the commands you would allow and the agent count (one review lead per bucket,
up to 4 verifiers each).

- **Not approved (default):** consult the reviewers for the non-empty buckets, as
  below, in parallel when there are several.
- **Approved:** follow `{{protocol review_panel}}` (run ID
  `code-review-<project_name>-<YYYY-MM-DD>`, sanitized as the protocol says;
  snapshot before dispatch, check after). Launch one review lead per non-empty
  bucket, in one message, using the same brief plus these two lines:

  ```
  **Run ID:** <run_id>
  **Code execution:** approved — allowed commands: <list>
  ```

  A lead opens on its `review` entry where it has one, so also add to its brief:
  "Where your agent has a service-mode file with a checklist for these files, apply
  that checklist too."

  Leads (use the notebook reviewer from Step 2):
  - SQL: {{review_lead analytics-engineer task="SQL code review for <project_name>"}}
  - Python scripts: {{review_lead backend-engineer task="Python code review for <project_name>"}}
  - Notebooks, Data Scientist: {{review_lead data-scientist task="Notebook code review for <project_name>"}}
  - Notebooks, ML Engineer: {{review_lead ml-engineer task="Notebook code review for <project_name>"}}
  - Config/infra: {{review_lead mlops-engineer task="Config/infra code review for <project_name>"}}

  **A workstream lead does not launch review leads.** If your brief runs you as a
  PM workstream lead (`WORKSTREAM LEAD`), you are already depth 1: keep the
  ordinary consults below, whatever the approval says, and name that in the summary.

Each reviewer reviews only; none applies fixes. Ordinary consults (not approved),
naming the bucket, use this brief for each:

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

If the review was verified, show each finding's Status and Evidence, list REFUTED
findings separately with their repro paths, mark an unverified High finding
`High (unverified)`, and report the snapshot check result (`{{protocol review_panel}}`
section 3).

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

If the review was verified, a CONFIRMED finding's repro command is the acceptance
check for its fix. The repro lives under `.shards/review/<run_id>/` and fails now, so
it must pass after the fix (`{{protocol review_panel}}` section 5). Then ask once more,
default no: "Rerun the repro commands now? Only the listed commands." If yes, rerun
each one under `{{protocol review_execution}}` and record the real exit code and
output. A repro that still fails is reported to the user, not called fixed.

## Step 6: Record the result

Append to `project-specs.md` and present it to the user:

```markdown
## Code Review
- **Reviewers:** <Analytics Engineer (SQL)> + <Backend Engineer (.py)> + <Data Scientist|ML Engineer (.ipynb)> + <MLOps Engineer (config/infra)>
- **Files reviewed:** N
- **Issues found:** N
- **Fixes applied:** N
- **Verified review:** yes (run ID <run_id>; snapshot clean | N paths changed) | no

### <Bucket> (<reviewer>)
<per-file findings and fix status, "no files", or "covered by own phase checks">
```

If a reviewer reports a file clean, say so; do not invent issues.
