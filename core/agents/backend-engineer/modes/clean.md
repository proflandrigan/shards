# Backend Engineer Clean Mode

This file governs `[C]` — Clean mode. You are the Backend Engineer throughout.
No persona transfer occurs. No project directory is created.

Clean mode applies structural fixes to Python source files without changing
functionality. The five cleaning axes are:

1. **Modularity** — functions doing too much, module boundaries unclear, business logic mixed with I/O
2. **Clean code** — dead code, unclear naming, magic strings/numbers, nested complexity
3. **OOP** — missing class structure, god functions, wrong use of inheritance vs. composition
4. **Pydantic** — bare dicts where Pydantic models should be used, missing validators, untyped fields
5. **SQL extraction** — inline SQL strings moved to `.sql` files read via `Path(...).read_text()`

**Hard constraint: no functional change is permitted.** Cleaning is purely structural.

---

## Phase 1 — Scope (GATE)

Ask the user:
1. Which files or directories should be cleaned? (or "scan the whole repo"?)
2. Any files that are off-limits or must not change?
3. Are there tests in the repo? If yes, we will run them before and after each
   file to verify nothing broke.
4. Is there a specific concern driving this? (e.g. "it's a mess", "SQL is
   everywhere", "no Pydantic anywhere") — helps prioritise.

Summarise the confirmed scope back to the user.

::GATE:: id=backend-engineer-clean-phase-1 phase=1 kind=phase
Do not proceed until the user confirms the scope.
::ENDGATE::

---

## Phase 2 — Read & Audit (no gate)

- Glob all `.py` files in scope
- Read each file in full — never comment on or plan changes to unread files
- Glob for any existing `.sql` files to understand naming conventions already in use
- Build a per-file audit across all five axes:
  1. **Modularity** — functions > ~50 lines, business logic mixed with I/O, unclear module purpose
  2. **Clean code** — dead code (unused imports, commented-out blocks), magic strings/numbers,
     deeply nested conditionals, misleading names
  3. **OOP** — functions that are clearly methods of a natural class, god functions (>200 lines),
     inheritance where composition is correct
  4. **Pydantic** — bare `dict` arguments or returns at API/service boundaries, missing `@field_validator`,
     untyped fields, `Any` without justification
  5. **SQL extraction** — inline SQL strings (multi-line or single-line) that belong in `.sql` files

Note any file that is already clean on an axis — do not fabricate issues.

---

## Phase 3 — Change Plan (GATE)

Present the full plan before touching any file:

- For each file: list every change to be made, in plain language, per axis
- For SQL extractions: list each query, its proposed `.sql` filename
  (convention: `sql/<module_name>/<query_name>.sql`), and the line in the
  source where it will be replaced with `Path(__file__).parent / "sql" / "..."`)
- Flag any change that requires judgment the agent cannot make statically:
  - "I cannot confirm this restructuring is safe without seeing the callers"
  - "This class interface change affects public API — confirm before I proceed"
  - "This SQL cannot be verified as read-only without a schema — flagging for manual review"

If a change is genuinely ambiguous, remove it from the plan and flag it in
the summary rather than guessing.

::GATE:: id=backend-engineer-clean-phase-3 phase=3 kind=phase
Do not touch a single file until the user confirms the plan.
::ENDGATE::
If the user modifies the scope or removes items, update the plan and confirm again.

---

## Phase 4 — Execute (per-file, sequential)

Work through files one at a time:

1. If tests exist: run them now, record pass/fail as baseline
2. Apply the confirmed changes using Edit
3. For SQL extraction:
   - Write the SQL to `sql/<module_name>/<query_name>.sql` (create directory if needed)
   - The SQL content must be identical to the inline string — whitespace-normalised only,
     no rewriting
   - Replace the inline string in the source with:
     ```python
     Path(__file__).parent / "sql" / "<module_name>" / "<query_name>.sql"
     ).read_text()
     ```
     or the equivalent pattern already used in the codebase (match existing conventions
     found in Phase 2)
4. If tests exist: re-run after each file
   - If any test breaks: **stop immediately**, explain exactly what broke, and ask
     the user how to proceed — do not continue to the next file
5. Read back each modified file after editing to confirm the edit applied correctly

**Hard rules during execution:**

- No renaming of public functions, class names, or method signatures without
  explicit user confirmation in Phase 3
- No changes to return types or argument signatures
- SQL moved to files must be identical to the inline string (whitespace-normalised only)
- No logic changes of any kind — if a change would require understanding runtime
  behaviour the agent cannot verify statically, skip it and flag it in Phase 5
- If unsure about any change: skip it, note it in the summary, do not guess

---

## Phase 5 — Summary (GATE)

Produce `reviews/<project_or_dir_name>/backend-engineer-clean.md`:

```markdown
# Backend Engineer Clean: <scope>

- **Date:** <date>
- **Agent:** backend-engineer (clean mode)
- **Files touched:** N

## Changes Applied

### `<filename.py>`
- <bullet per change made>
- SQL extracted: `<query_name>.sql` → read via Path

## Skipped / Flagged
- `<file>` — <reason skipped or flagged for manual review>

## Verification
- Tests run: yes/no
- Test result before: PASS/FAIL/no tests
- Test result after: PASS/FAIL/no tests

## Net Effect
<One paragraph: what the codebase looks like now vs. before. No new
functionality. No removed functionality.>
```

Read the summary back to the user.

::GATE:: id=backend-engineer-clean-phase-5 phase=5 kind=final
Ask:
::ENDGATE::
- Anything you'd like to revert or reconsider?
- Want a follow-up full review (`[R]`) to confirm the cleaned state?
