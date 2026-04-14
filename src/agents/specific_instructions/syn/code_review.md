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
- **Python files:** `*.py`, `*.ipynb`
- **Non-Python files:** `*.sql`, `*.yaml`, `*.yml`, `*.sh`, `*.json`,
  `Dockerfile`, `requirements.txt`, `*.toml`

Exclude `project-specs.md` and files in `templates/` directories.

**Step 3a: Review non-Python files (JFL reviews directly)**

For each non-Python file:
1. Read the full file
2. Apply this checklist:
   - **Correctness** — logic errors, edge cases, null/empty handling, off-by-ones
   - **Quality** — naming clarity, unnecessary complexity, dead code
   - **Security** — hardcoded credentials, SQL injection risks, unsafe inputs
   - **Performance** — N+1 patterns, large data loaded into memory unnecessarily
   - **Domain fit** — does the code match the project specs and stated business logic?
3. Format findings as:

```markdown
### `<filename>`
- **Status:** Clean | Issues Found
- **Issues:**
  - [CORRECTNESS] <description>
  - [QUALITY] <description>
  - [SECURITY] <description>
  - [PERFORMANCE] <description>
  - [DOMAIN FIT] <description>
- **Proposed fixes:** <brief description of what will be changed, or "None">
```

**Step 3b: Delegate Python files to the Backend Engineer**

If any `.py` or `.ipynb` files were found, invoke the Backend Engineer via Task:

```
Task(
  subagent_type="backend-engineer",
  description="Python code review for <project_name>",
  prompt="You are in SERVICE MODE. Review the following Python files in the
  project at <project_dir>. Read project-specs.md first for context.
  Files to review: <list>"
)
```

Incorporate the returned review wholesale — do not re-review Python files yourself.
If no Python files were found, skip this step.

**Step 4: Gate before fixing**

Present consolidated findings: JFL's non-Python review followed by the Backend
Engineer's Python review (if applicable). Then ask:
"Apply fixes? (y to fix all, n to skip, or list specific filenames)"

**GATE: Read these findings back to the user. Stop here — do not apply any fixes or begin Step 5 until the user explicitly responds. Do not interpret silence or partial agreement as confirmation.**

**Step 5: Apply fixes**

Use the Edit tool to apply fixes file by file. For each fix:
- Note what was changed and why
- Distinguish style preferences from genuine bugs
- Only apply fixes to non-Python files directly. For Python file fixes flagged
  by the Backend Engineer, apply them yourself using the Edit tool.

**Step 6: Return summary**

Return in this format:

```markdown
## JFL Code Review
- **Reviewer:** JFL (Orchestrator) + Backend Engineer (Python)
- **Files reviewed:** N
- **Issues found:** N
- **Fixes applied:** N

### Non-Python files
<JFL per-file findings and fix status>

### Python files (Backend Engineer review)
<Backend Engineer per-file findings and fix status>
```

Append the code review summary to `project-specs.md`.

**Behavioral rules for Code Review Mode:**
- Read specs first — your review is domain-aware, not just syntactic
- Never apply fixes without explicit user confirmation (the gate in Step 4)
- Note when something is a style preference vs. a genuine bug
- If a file is clean, say so explicitly — don't fabricate issues
