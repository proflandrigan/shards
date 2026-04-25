# Validation Protocol

Every specialist that produces a durable artifact — a mart, a model, a notebook, a dashboard, a service, a data model, a pipeline — is required to validate that artifact before the gate closes on its build phase. The validation contract is the DNA; per-agent checklists are the flesh; a gate-hook extension is the enforcement.

## Why

Agents are good at producing work that *looks* correct. Validation forces evidence that the work *is* correct:

- Not "row counts look right" — `rows: 48,211 (source: 48,211)`.
- Not "tested the model" — `tests/test_model.py — 14 tests, 14 passed`.
- Not "shouldn't affect downstream" — `fct_revenue rebuilt OK, 0 schema diff`.

Numbers and file paths are harder to hallucinate than prose. The protocol's job is to keep agents honest, and the gate hook's job is to make sure the protocol actually runs.

## The three-layer contract

| Layer | Where it lives | What it does |
|------|----------------|--------------|
| **Shared protocol** | `shared/validation_protocol.md` | Defines what validation means, the specs-section schema, the evidence-vs-assertion rule, how validation composes with other protocols. Loaded by every specialist via Behavioral Rules. |
| **Domain checklist** | `<agent>/validation_checklist.md` | Defines *which* checks apply for this agent's work. Stable check IDs (AE-01, ML-03, DS-12, etc.). Track Calibration table picks the required subset per `(Track, Mode)`. |
| **Gate hook enforcement** | `tools/gate-hook/validation.js` | Parses the `## Validation` section, checks the schema is complete, blocks the gate if evidence is missing. Opt-in via `SHARDS_VALIDATION_ENFORCE=1`. |

Soft protocol defines the intent. Hard enforcement makes it stick.

## The specs section schema

Every validation-eligible phase writes this into `project-specs.md` before emitting its gate fence:

```markdown
## Validation

**Track:** quick | deep | fixer
**Mode:** <agent-specific — optional>
**Checklist:** <agent_name>/validation_checklist.md
**Applied at:** Phase <N> — <phase name>

### Evidence

| Check | Expected | Observed | Pass/Fail | Notes |
|-------|----------|----------|-----------|-------|
| <id> | <predicted> | <measured value> | ✓ / ✗ / n/a | <required if n/a> |

### Artifacts
- `<path/to/evidence-file>` — <what it shows>

### Downstream Impact
- `<consumer>` — verified intact | not applicable | broken → fixed in <ref>

### Open Issues
- <issue> | none

### Summary
<2-4 sentences: what was validated, what failed and was fixed, residual risk>
```

### Track vs Mode

- **Track** (universal, strict vocabulary: `quick | deep | fixer`) controls depth. The hook validates this.
- **Mode** (agent-specific, free-form, optional) describes the flavor of work — `greenfield`, `iteration`, `experiment`, `adhoc`, `build`. The hook does not validate Mode values; it's an auditing aid. Omit the line entirely if not meaningful.

Examples:
- ML Engineer, new recommender → `Track: deep`, `Mode: greenfield`
- Analytics Engineer, small mart tweak → `Track: quick`, `Mode: adhoc` (or omit Mode)
- Any `[F]` Fixer fix → `Track: fixer`

### Pass/Fail values

- **✓** — check ran, result met expectation.
- **✗** — check ran, result failed. Document the fix in Notes or surface in Open Issues before closing the gate.
- **n/a** — genuinely inapplicable to this work (e.g., calibration on a regression model). Requires a non-empty Notes cell; `n/a` without justification is a gate-block.

Unresolved checks are not a valid state. Mark them `✗` and move the uncertainty to Open Issues.

### Multi-instance checks

Checks that measure many things (feature distributions across 47 features, per-slice model performance, per-column null rates) use a summary-row-plus-artifact pattern: one row captures the headline (`47/47 within tolerance | 2 flagged`), the full breakdown lives in an artifact file referenced under `### Artifacts`.

## Track depth

| Track | When | What's expected |
|-------|------|-----------------|
| `deep` | Full build phases — new mart, new model, new service, new pipeline, new dashboard | Full checklist per the agent's Track Calibration table |
| `quick` | Adhoc analyses, schema tweaks, experiment iterations, prompt-lab versions | Subset — usually 4-6 of the most impactful checks |
| `fixer` | `[F]` Fixer-mode fixes | Minimal — "what changed, what didn't break" + 1-2 smoke checks |

Each agent's checklist defines exactly which checks belong to which Track.

## How to enable enforcement

The hook ships with enforcement **off** by default — validation sections are parsed and logged, but gates are not blocked on missing validation. This soft-launch mode lets agents and users adjust to producing the section without friction.

To turn enforcement on:

```bash
export SHARDS_VALIDATION_ENFORCE=1
```

With enforcement on, a gate fence carrying `validates=<checklist>` will be blocked if the specs file's `## Validation` section is missing, incomplete, or malformed. The error message names the specific problems and points to the protocol.

To disable all gate enforcement (including validation) for debugging:

```bash
export SHARDS_GATE_ENFORCE=0
```

There is no validation-only escape hatch. If a particular phase should not require validation, remove the `validates=...` attribute from its gate fence (or set `validates=none`), rather than turning off enforcement globally.

## How the hook finds your specs file

The hook resolves `project-specs.md` in priority order:

1. `SHARDS_PROJECT_SPECS_PATH` env var if set — absolute path, overrides everything.
2. `project-specs.md` at the CWD if it exists.
3. The most recently modified `project-specs.md` under any conventional project directory: `analysis/<name>/`, `studies/<name>/`, `models/<name>/`, `data_models/<name>/`, `services/<name>/`, `research/<name>/`, `dashboards/<name>/`, `brainstorm/<name>/`, `fixes/<name>/`. Only immediate subdirectories are searched (one level deep).

If you work on multiple projects in the same session, the "most recently modified" rule keeps validation pointed at the active project. To pin the hook to a specific file (e.g. for testing), set `SHARDS_PROJECT_SPECS_PATH` explicitly.

## What the hook checks

Structural only — the hook does not (and cannot) judge whether your evidence is *real*. That's Syn's job during final review.

| Check | Error code |
|-------|------------|
| `## Validation` section exists | `MISSING_SECTION` |
| `**Track:**` is `quick`, `deep`, or `fixer` | `MISSING_TRACK` |
| `**Mode:**` line, if present, has a non-empty value | `EMPTY_MODE` |
| `**Checklist:**` line references a `validation_checklist.md` | `MISSING_CHECKLIST` |
| Evidence table has ≥1 data row | `NO_EVIDENCE_ROWS` |
| Every row has non-empty Check, Expected, Observed | `INCOMPLETE_EVIDENCE_ROW` |
| Every row's Pass/Fail is `✓`, `✗`, or `n/a` | `INVALID_PASS_FAIL` |
| `n/a` rows have non-empty Notes | `NA_WITHOUT_JUSTIFICATION` |
| Artifacts section has ≥1 bullet | `NO_ARTIFACTS` |
| Downstream Impact has ≥1 bullet | `NO_DOWNSTREAM` |
| Summary has ≥20 non-whitespace chars | `SUMMARY_TOO_SHORT` |

## How validation composes with final review

When a specialist invokes Syn for sign-off via `Task(subagent_type="syn", ...)`, Syn reads the `## Validation` section and checks the *semantic* quality the hook can't:

- Is the Observed value measurable, or prose that could be true of a broken implementation?
- Did the specialist run the checks its declared Track requires, or skip them with vague `n/a` justifications?
- Are failed checks hidden or surfaced in Open Issues?
- Does the Summary match the evidence?

A structurally-complete but semantically-empty validation section returns `NEEDS REVISION` from Syn. See `reviewer-verdicts.md` for the verdict flow.

## Common failure modes

- **Box-ticking theater.** Filling the evidence table with plausible prose rather than measured values. Defense: Syn's semantic review, plus your own review at the gate.
- **Code-runs conflation.** "The query executed" is not evidence. Execution is a precondition; correctness is the check.
- **Retroactive validation.** Validating after you've accepted the gate and moved on. Validation comes *before* the gate, not after.
- **Self-satisfying tests.** A test that asserts what the code does (rather than what the code should do) passes trivially. If the test would pass against a broken implementation, it's not validation.
- **Downstream blind spots.** Changes to a shared model without checking dependent consumers. The Downstream Impact line exists for exactly this.

## Writing your own checklist (for extending Shards)

To add a validation checklist for a new agent:

1. Create `src/agents/specific_instructions/<agent>/validation_checklist.md`.
2. Pick a stable prefix for check IDs (e.g., `XX-01`).
3. Define the checks, each with: name, purpose, `Observed format:` line.
4. Write a Track Calibration table indexed by `(Track, Mode)`.
5. List expected artifacts and downstream-impact concerns.
6. List escalation triggers.
7. Add `validates=<agent_name>` to the agent's final build-phase gate fence in the appropriate `phases/phase-<N>.md` file (or `phases_deep/phase-<N>.md` for dual-track agents).

Use `analytics_engineer/validation_checklist.md` or `ml_engineer/validation_checklist.md` as a reference shape.

## Related

- [Gate Pattern](gate-pattern.md) — the enforcement substrate validation builds on
- [Behavioral Rules](behavioral-rules.md) — where the validation reference lands in each agent
- [Reviewer Verdicts](reviewer-verdicts.md) — Syn's semantic check on the validation section
- [Knowledge Ledger](knowledge-ledger.md) — validation findings are a primary harvest source
