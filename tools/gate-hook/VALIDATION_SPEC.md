# Gate Hook — Validation Enforcement Spec

Design spec for extending the gate hook (`tools/gate-hook.js` + `tools/gate-hook/*.js`) to enforce the shared validation protocol (`src/agents/specific_instructions/shared/validation_protocol.md`).

Status: draft — not yet implemented. Companion to the protocol and per-agent checklists.

## Goal

Block phase advancement when a validation-eligible phase closes without a populated `## Validation` section in `project-specs.md`. The hook should distinguish "forgot to validate" from "validated but the section is formatted wrong" from "this phase doesn't require validation" — each needs a different error message.

## Trigger Model

The gate hook currently opens a gate on `Stop` if the last assistant message contains a `::GATE::` fence. The validation check runs **before** the gate is opened:

```
Stop event
  ├─ parse last message → find gate fence
  ├─ if gate requires validation (see "Gate Attribute" below):
  │    ├─ read project-specs.md
  │    ├─ locate `## Validation` section
  │    ├─ parse schema-required fields
  │    └─ if any required field is missing → block, do not open gate
  └─ else → open gate as today
```

On block, the user sees a structured error and the gate remains closed. The agent's next turn must fix the validation section and re-emit the gate fence.

## Gate Attribute

Introduce one new optional attribute on the gate fence:

```
::GATE:: id=<slug> phase=<n> kind=<phase|execute|...> validates=<checklist-key>
```

- `validates=<checklist-key>` — the checklist to require, e.g. `analytics_engineer`, `ml_engineer`, `data_scientist`.
- Absent attribute → no validation check (current behavior preserved). Review / Advise / Explain / Handoff gates do not set it.
- The checklist-key maps to a per-agent `validation_checklist.md` path. The hook does not actually read the checklist — it only passes the key through to error messages. Semantic coverage is the agent's responsibility.

**Alternative considered:** auto-require validation for `kind=execute`. Rejected — too broad, and plumbing opt-in via an explicit attribute makes the intent legible in transcripts.

## Specs File Contract

The hook resolves `project-specs.md` in the following priority order:

1. `SHARDS_PROJECT_SPECS_PATH` env var if set (absolute path, overrides everything)
2. `project-specs.md` at CWD if it exists
3. The most recently modified `project-specs.md` under any conventional project directory — `analysis/<name>/`, `studies/<name>/`, `models/<name>/`, `data_models/<name>/`, `services/<name>/`, `research/<name>/`, `dashboards/<name>/`, `brainstorm/<name>/`, or `fixes/<name>/`. Only immediate subdirectories of these roots are searched (one level deep).

The hook then looks for the most recent `## Validation` section within that file — defined as the final `## Validation` heading before EOF or before the next non-validation top-level heading.

### Required fields

| Field | Format | Check |
|-------|--------|-------|
| `**Track:**` | `quick`, `deep`, or `fixer` | Exact match on one of three values (case-insensitive) |
| `**Mode:**` | Free-form string | **Optional.** If present, value must be non-empty; if absent, no check. Not validated against any vocabulary. |
| `**Checklist:**` | `<name>/validation_checklist.md` | Non-empty, ends with `validation_checklist.md` |
| `**Applied at:**` | Phase descriptor | Non-empty |
| `### Evidence` | Markdown table with ≥1 data row | At least one row where Check, Expected, and Observed cells are non-empty; `Pass/Fail` is one of `✓`, `✗`, or `n/a`; any row with `Pass/Fail = n/a` requires a non-empty Notes cell. Unresolved checks (`?` or blank Pass/Fail) are rejected. |
| `### Artifacts` | Bulleted list | At least one bullet OR an explicit `- none (see Summary for rationale)` |
| `### Downstream Impact` | Bulleted list | At least one bullet |
| `### Summary` | Prose | ≥ 20 non-whitespace characters |

`### Open Issues` is **not** required to be populated — `- none` is an acceptable value — but the heading must be present.

### Parser sketch

New module: `tools/gate-hook/validation.js`.

```js
// Pseudocode
const VALID_PASS_FAIL = new Set(['✓', '✗', 'n/a']);

function parseValidationSection(specsContent) {
  const sections = splitByH2(specsContent);
  const last = sections.filter(s => s.heading === 'Validation').pop();
  if (!last) return { present: false };

  const body = last.body;
  return {
    present: true,
    track: matchOne(body, /\*\*Track:\*\*\s*(quick|deep|fixer)\b/i),
    mode: matchOne(body, /\*\*Mode:\*\*\s*([^\n]+)/),  // optional — null if absent
    checklist: matchOne(body, /\*\*Checklist:\*\*\s*([^\n]+validation_checklist\.md)/),
    appliedAt: matchOne(body, /\*\*Applied at:\*\*\s*([^\n]+)/),
    evidenceRows: parseMarkdownTableRows(body, 'Evidence'),
    artifactsBullets: parseBulletedList(body, 'Artifacts'),
    downstreamBullets: parseBulletedList(body, 'Downstream Impact'),
    summaryLength: parseSection(body, 'Summary').replace(/\s+/g, '').length,
  };
}

function checkValidation(parsed) {
  const errors = [];
  if (!parsed.present) return [{ code: 'MISSING_SECTION' }];
  if (!parsed.track) errors.push({ code: 'MISSING_TRACK' });
  if (parsed.mode !== null && !parsed.mode.trim())
    errors.push({ code: 'EMPTY_MODE' });  // Mode line present but blank value
  if (!parsed.checklist) errors.push({ code: 'MISSING_CHECKLIST' });
  if (parsed.evidenceRows.length === 0) errors.push({ code: 'NO_EVIDENCE_ROWS' });

  for (const [i, row] of parsed.evidenceRows.entries()) {
    if (!row.check.trim() || !row.expected.trim() || !row.observed.trim()) {
      errors.push({ code: 'INCOMPLETE_EVIDENCE_ROW', row: i });
      continue;
    }
    if (!VALID_PASS_FAIL.has(row.passFail.trim())) {
      errors.push({ code: 'INVALID_PASS_FAIL', row: i, got: row.passFail });
      continue;
    }
    if (row.passFail.trim() === 'n/a' && !row.notes.trim()) {
      errors.push({ code: 'NA_WITHOUT_JUSTIFICATION', row: i });
    }
  }

  if (parsed.artifactsBullets.length === 0) errors.push({ code: 'NO_ARTIFACTS' });
  if (parsed.downstreamBullets.length === 0) errors.push({ code: 'NO_DOWNSTREAM' });
  if (parsed.summaryLength < 20) errors.push({ code: 'SUMMARY_TOO_SHORT' });
  return errors;
}
```

Keep the parser boring. Regex on headings, split on `|` for table rows, trim aggressively. Do not attempt to validate semantic correctness of the observed values — the hook is a structure check, not a correctness check.

## Integration Point in `handleStop`

After `parseGates(lastMsg)` and before `state.write(newState)`:

```js
const { validates } = gate.attrs;
if (validates) {
  const specs = readSpecsFile();
  const parsed = parseValidationSection(specs);
  const errors = checkValidation(parsed);
  if (errors.length > 0) {
    appendViolation({
      type: 'validation-missing',
      gate_id: id,
      checklist: validates,
      errors,
      session_id: sessionId,
    });
    respond({
      decision: 'block',
      reason: formatValidationError(validates, errors),
    });
    return;  // do not open gate
  }
}
```

The gate stays closed — the agent's next turn must re-emit the fence after fixing the section.

## Error Messages

Error messages should be actionable, name the specific missing field, and point to the protocol. Template:

```
::GATE-BLOCK:: Validation evidence is missing or incomplete.

Required checklist: <checklist-key>/validation_checklist.md
Gate: <gate-id> (phase <n>, kind <kind>)

Problems:
  - <code>: <human description>
  - <code>: <human description>

What to do:
  1. Re-read src/agents/specific_instructions/shared/validation_protocol.md
     for the required `## Validation` section schema.
  2. Re-read .claude/agents/specific_instructions/<agent>/validation_checklist.md
     for the domain-specific checks.
  3. Run the checks, record observed values in the Evidence table, and
     re-emit the gate fence.

If this phase should not require validation, remove the `validates=...`
attribute from the gate fence.
```

Example codes and descriptions:

| Code | Description |
|------|-------------|
| `MISSING_SECTION` | No `## Validation` heading found in project-specs.md |
| `MISSING_TRACK` | `**Track:**` line missing or value is not quick/deep/fixer |
| `EMPTY_MODE` | `**Mode:**` line present but value is blank (omit the line entirely if Mode is not meaningful) |
| `MISSING_CHECKLIST` | `**Checklist:**` line missing or doesn't reference a `validation_checklist.md` |
| `NO_EVIDENCE_ROWS` | Evidence table has zero data rows |
| `INCOMPLETE_EVIDENCE_ROW` | A row has an empty Check, Expected, or Observed cell |
| `INVALID_PASS_FAIL` | A row's Pass/Fail value is not one of `✓`, `✗`, or `n/a` (includes `?`, blank, or any other symbol) |
| `NA_WITHOUT_JUSTIFICATION` | A row has `Pass/Fail: n/a` but the Notes cell is empty |
| `NO_ARTIFACTS` | Artifacts section has no bullets (use `- none (see Summary)` to override intentionally) |
| `NO_DOWNSTREAM` | Downstream Impact section has no bullets |
| `SUMMARY_TOO_SHORT` | Summary has fewer than 20 non-whitespace characters |

## State & Logging

Extend the existing `.shards/gates/state.json` and violation log with validation events:

```json
{
  "type": "validation-missing",
  "timestamp": "2026-04-22T...",
  "gate_id": "ae-phase-3",
  "checklist": "analytics_engineer",
  "errors": [
    { "code": "NO_EVIDENCE_ROWS", "field": "Evidence" },
    { "code": "SUMMARY_TOO_SHORT", "observed_length": 8 }
  ],
  "session_id": "..."
}
```

On successful validation pass, append to history:

```json
{ "event": "validation-passed", "gate_id": "...", "checklist": "...", "evidence_rows": 7 }
```

This gives `shards-gates status` and future UI panels enough to surface validation coverage over time.

## Edge Cases

- **Specs file missing or unreadable.** Treat as `MISSING_SECTION`. Do not crash the hook.
- **Multiple `## Validation` sections.** Use the last one. Agents should overwrite, not append, but if they append, the most recent wins.
- **Agent amends validation in a post-block turn.** Expected flow. The amended message re-emits the fence; the hook re-parses and re-checks. No special handling required.
- **`validates=none` attribute.** Treat same as absent attribute. Offered as explicit-opt-out syntax for transcripts where intent should be visible.
- **Nested specs files (sub-projects).** Honor `SHARDS_PROJECT_SPECS_PATH` override. Default does not recurse.
- **Empty Evidence table (only header).** `NO_EVIDENCE_ROWS`. A header-only table is not evidence.
- **Row with all cells populated but nonsense values** (e.g., `Observed: lorem ipsum`). Hook cannot detect. This is why the final-review reviewer (Syn) must read the Validation section — structural and semantic checks are separate layers.

## Escape Hatch Behavior

- `SHARDS_GATE_ENFORCE=0` disables all gate enforcement including validation — already handled by the early-exit at the top of `gate-hook.js`, no change needed.
- There is no validation-only escape hatch. If a session is so broken it needs to bypass validation but not other gates, add `validates=none` to the fence instead.

## Test Plan

Unit tests for `validation.js`:

1. Fully-populated section (both with and without Mode line) → zero errors
2. Missing section → `MISSING_SECTION`
3. Missing each individual required field → corresponding code
4. Evidence table with one `?` Pass/Fail → `INVALID_PASS_FAIL`
5. Evidence table with one blank Pass/Fail → `INVALID_PASS_FAIL`
6. Evidence table with `Pass/Fail: n/a` and empty Notes → `NA_WITHOUT_JUSTIFICATION`
7. Evidence table with `Pass/Fail: n/a` and non-empty Notes → zero errors on that row
8. Evidence table with all three valid Pass/Fail values across rows → zero errors
9. `**Mode:**` line present with empty value → `EMPTY_MODE`
10. `**Mode:**` line absent entirely → zero errors (Mode is optional)
11. Summary with 19 whitespace-stripped chars → `SUMMARY_TOO_SHORT`
12. Multiple `## Validation` sections → uses the last
13. `validates` attribute absent → parser not invoked (integration test in `gate-hook.js`)
14. Specs file missing → graceful `MISSING_SECTION`

Integration tests against a sample `project-specs.md` fixture directory — one "good" specs file per agent, one intentionally broken specs file per error code.

## Out of Scope

- Checking that the artifact files referenced in `### Artifacts` actually exist on disk. Possible future addition; adds I/O cost and cross-platform path complexity. Defer.
- Running the tests (e.g., `dbt test`, `pytest`) automatically. Not the hook's job; the agent runs tests and records results.
- Checking that evidence values are semantically plausible. That's the reviewer agent's job.
- Enforcing checklist-specific required check IDs (e.g., AE-03 must appear for analytics_engineer). Possible future addition; start permissive.

## Rollout

1. Ship the protocol + per-agent checklists first (no hook changes). Agents start populating the `## Validation` section. Zero enforcement.
2. Ship the hook extension with enforcement **opt-in via environment variable** (e.g., `SHARDS_VALIDATION_ENFORCE=1`). Soft launch.
3. Flip default to enforced once the schema has shaken out across 2–3 agents' real projects.
4. Add the remaining per-agent checklists in parallel.

Rolling out enforcement before the protocol is battle-tested will create more friction than it's worth.
