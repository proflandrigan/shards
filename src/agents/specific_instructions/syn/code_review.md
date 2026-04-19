# Code Review Mode

Triggered when a specialist calls Task with `CODE REVIEW MODE` in the prompt.
You receive: the project directory path and optionally a specific list of files.

**Step 1: Read project context**

Read `project-specs.md` in the project directory to understand:
- The business question and objectives
- What the specialist built and why
- Data sources, grain, and key definitions

**Step 2: Discover and partition code artifacts**

If specific files were listed in the prompt, partition them by type. Otherwise,
Glob the project directory separately for:
- **SQL files:** `*.sql`
- **Python files:** `*.py`, `*.ipynb`
- **Config/infra files:** `*.yaml`, `*.yml`, `*.sh`, `*.json`,
  `Dockerfile`, `requirements.txt`, `*.toml`

Exclude `project-specs.md` and files in `templates/` directories.

**Step 3: Delegate all file types to specialists**

Invoke whichever specialists have files to review. If multiple buckets are
non-empty, call them in parallel.

**Step 3a: Analytics Engineer reviews SQL files**

If any `.sql` files were found:

```
Task(
  subagent_type="analytics-engineer",
  description="SQL code review for <project_name>",
  prompt="SERVICE MODE — CODE REVIEW. Review the following SQL files in
  <project_dir>. Read project-specs.md first for context.
  Files to review: <list>
  Your job here is review only — do not apply any fixes."
)
```

**Step 3b: Backend Engineer reviews Python files**

If any `.py` or `.ipynb` files were found:

```
Task(
  subagent_type="backend-engineer",
  description="Python code review for <project_name>",
  prompt="You are in SERVICE MODE. Review the following Python files in
  <project_dir>. Read project-specs.md first for context.
  Files to review: <list>
  Your job here is review only — do not apply any fixes."
)
```

**Step 3c: MLOps Engineer reviews config/infra files**

If any config/infra files were found:

```
Task(
  subagent_type="mlops-engineer",
  description="Config/infra code review for <project_name>",
  prompt="SERVICE MODE — CODE REVIEW. Review the following config/infra files
  in <project_dir>. Read project-specs.md first for context.
  Files to review: <list>
  Your job here is review only — do not apply any fixes."
)
```

Incorporate each returned review wholesale — do not re-review any files yourself.
If a bucket is empty, skip that specialist call entirely.

**Step 4: Gate before fixing**

Present consolidated findings: Analytics Engineer's SQL review, Backend
Engineer's Python review, and MLOps Engineer's config/infra review (each only
if applicable). Then ask:
"Apply fixes? (y to fix all, n to skip, or list specific filenames)"

::GATE:: id=specific-instructions-syn-code-review-phase0 phase=0 kind=phase
Read these findings back to the user. Stop here — do not apply any fixes or begin Step 5 until the user explicitly responds. Do not interpret silence or partial agreement as confirmation.
::ENDGATE::

**Step 5: Apply fixes**

For each specialist that flagged issues, re-invoke them in apply-fixes mode.
These calls can run in parallel if multiple specialists have fixes to apply.
Syn does not call Edit on any project files directly.

**Step 5a: Analytics Engineer applies SQL fixes**

If SQL fixes were approved:

```
Task(
  subagent_type="analytics-engineer",
  description="Apply SQL fixes for <project_name>",
  prompt="SERVICE MODE — APPLY FIXES. The user has approved the following
  fixes to SQL files in <project_dir>.
  Files and fixes: <paste the Analytics Engineer's per-file findings>
  Use the Edit tool to apply each fix. Return a per-file summary of what
  was changed."
)
```

**Step 5b: Backend Engineer applies Python fixes**

If Python fixes were approved:

```
Task(
  subagent_type="backend-engineer",
  description="Apply Python fixes for <project_name>",
  prompt="SERVICE MODE — APPLY FIXES. The user has approved the following
  fixes to Python files in <project_dir>.
  Files and fixes: <paste the Backend Engineer's per-file findings>
  Use the Edit tool to apply each fix. Return a per-file summary of what
  was changed."
)
```

**Step 5c: MLOps Engineer applies config/infra fixes**

If config/infra fixes were approved:

```
Task(
  subagent_type="mlops-engineer",
  description="Apply config/infra fixes for <project_name>",
  prompt="SERVICE MODE — APPLY FIXES. The user has approved the following
  fixes to config/infra files in <project_dir>.
  Files and fixes: <paste the MLOps Engineer's per-file findings>
  Use the Edit tool to apply each fix. Return a per-file summary of what
  was changed."
)
```

**Step 6: Return summary**

Return in this format:

```markdown
## Syn Code Review
- **Reviewer:** Syn (Orchestrator) + Analytics Engineer (SQL) + Backend Engineer (Python) + MLOps Engineer (Config/Infra)
- **Files reviewed:** N
- **Issues found:** N
- **Fixes applied:** N

### SQL files (Analytics Engineer review)
<per-file findings and fix status, or "No SQL files found">

### Python files (Backend Engineer review)
<per-file findings and fix status, or "No Python files found">

### Config/Infra files (MLOps Engineer review)
<per-file findings and fix status, or "No config/infra files found">
```

Append the code review summary to `project-specs.md`.

**Behavioral rules for Code Review Mode:**
- Read specs first — your review is domain-aware, not just syntactic
- Never apply fixes without explicit user confirmation (the gate in Step 4)
- Delegate all file types — Syn never calls Edit on project files directly
- If a bucket is empty, skip that specialist call entirely
- If a specialist reports a file is clean, say so explicitly — don't fabricate issues
