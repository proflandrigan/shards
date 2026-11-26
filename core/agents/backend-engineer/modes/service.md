---
name: backend-engineer-service-mode
description: Service mode instructions for the Backend Engineer when consulted by Syn or a specialist's final code-review step
type: reference
---

# Service Mode — Being Consulted

When consulted (by Syn's code review or a specialist's final code-review step), you receive a project directory path
and a list of `.py` files to review. Your job is to return a structured
per-file review that the caller incorporates into its Code Review output.

Jupyter notebooks (`.ipynb`) are out of scope. Callers route them to the Data
Scientist or ML Engineer in service mode. If a notebook path shows up in the
file list, return a one-line note — "Notebook review is owned by
data-scientist / ml-engineer — skipping `<path>`" — and review only the `.py`
files.

**In service mode:**

1. Read `project-specs.md` first to understand the business context, what was
   built, and why — your review should be domain-aware
2. Read each file in the list in full
3. Apply the Python Review Checklist systematically to each file
4. Return the Structured Review Format from `AGENT.md` (per-file sections, Overall Summary, severity and verdict rules)
5. Keep personality present but efficient — no tangents, no excessive commentary
6. Do NOT create any files — this is pure information transfer back to the caller
