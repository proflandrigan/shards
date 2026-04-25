---
name: validation-protocol
description: Shared validation contract — every specialist produces evidence of output correctness before closing build/execute phases
type: reference
---

# Validation Protocol

Validation is a universal contract across all specialist agents. Before closing any phase whose `kind` is `execute` or `phase` and whose work produces new or modified artifacts (marts, models, notebooks, services, datasets, pipelines, dashboards), the agent must produce **evidence** that the outputs are correct — not merely an assertion that they are.

This protocol defines *what* validation means and *where* evidence lands. Each specialist has a domain-specific `validation_checklist.md` that defines *which* checks apply. A separate gate-hook extension enforces that the evidence is present before the gate closes.

## The Contract

Every validation-eligible phase produces three things:

1. **A populated `## Validation` section in `project-specs.md`** — the bridge between soft protocol and hard enforcement.
2. **At least one evidence artifact on disk** — a file the user or a reviewer can open to inspect the results. This includes test files (preferred where applicable), metric dumps, plots, config snapshots, model artifacts, or verification query outputs. Prose in specs is context, not evidence.
3. **A named checklist version** — which agent checklist was applied, so coverage is auditable.

If any of the three is missing, the gate does not close.

## Evidence vs Assertion

The protocol requires *outputs*, not *claims*. Numbers and file paths are harder to hallucinate than prose.

| Evidence (accept) | Assertion (reject) |
|-------------------|--------------------|
| `rows_observed: 48,211 (source: 48,211)` | "Row counts look right" |
| `pk_distinct == pk_total (verified)` | "Grain is correct" |
| `tests/test_churn_model.py::test_probs_sum_to_one PASSED` | "Tested the probabilities" |
| `category_counts: {A: 12.3k, B: 9.8k, C: 401}` | "Distributions look healthy" |
| `downstream mart `fct_revenue` rebuilt OK` | "Shouldn't affect anything downstream" |

When the observed value cannot be measured (e.g., a qualitative downstream check), name *what* was inspected and *who* confirmed, not just that it was "fine."

## Specs Section Schema

Render this section into `project-specs.md`. The gate hook parses it — schema drift will cause enforcement failures, so follow the format exactly.

```markdown
## Validation

**Track:** quick | deep | fixer
**Mode:** <agent-specific, e.g. greenfield | iteration | experiment | adhoc | build | ...>  ← optional
**Checklist:** <agent_name>/validation_checklist.md
**Applied at:** Phase <N> — <phase name>

### Evidence

| Check | Expected | Observed | Pass/Fail | Notes |
|-------|----------|----------|-----------|-------|
| <check-id from checklist> | <predicted value or condition> | <measured value> | ✓ / ✗ / n/a | <one-line context; required non-empty when Pass/Fail = n/a> |

### Artifacts
- `<path/to/evidence-file>` — <what it shows>

### Downstream Impact
- `<dependent-model-or-consumer>` — verified intact | not applicable | broken → fixed in <commit/file>

### Open Issues
- <issue the user should know about> | none

### Summary
<Two-to-four sentences: what was validated, what failed and was fixed, what residual risk remains. This is the "what do I tell my boss" paragraph.>
```

### Track vs Mode

Two orthogonal fields describe a validation instance:

- **Track** — depth indicator. Universal vocabulary: `quick | deep | fixer`. The hook validates this strictly. It controls which checks are required (via each checklist's Track Calibration table).
- **Mode** — flavor of work. Agent-specific, free-form string. Optional — omit the line entirely if not meaningful for the agent. The hook does not validate Mode values; it exists for audit/telemetry and to help the agent pick the right Track Calibration row.

Examples:
- ML Engineer building a new recommender from scratch → `Track: deep`, `Mode: greenfield`
- ML Engineer retuning an existing churn model → `Track: deep`, `Mode: iteration`
- ML Engineer `[X]` experiment iteration that kept its change → `Track: quick`, `Mode: experiment`
- Analytics Engineer shipping a new mart → `Track: deep` (Mode omitted or `build`)
- Analytics Engineer adhoc refund-attribution tweak → `Track: quick`, `Mode: adhoc`
- Any Fixer-mode fix (`[F]`) → `Track: fixer`

### Pass/Fail Values

- **✓** — check ran, result met the expected value or condition.
- **✗** — check ran, result did not meet expectation. The failure must be resolved (record the fix in Notes or surface in Open Issues) before the gate closes.
- **n/a** — the check is not applicable to this work (e.g., calibration on a non-probabilistic model; refresh-mode parity on a view). The Notes cell **must** contain a non-empty justification. The hook blocks `n/a` with an empty Notes cell.

Unresolved checks ("I'm not sure if this passed") are not a valid Pass/Fail state. Mark them `✗` in the row and move the unresolved question to Open Issues — validation uncertainty is a project state, not an evidence state.

### Multi-Instance Checks

Some checks measure many things at once — feature distributions across dozens of features, model performance across many slices, row-count sanity across many columns. Rendering one evidence row per instance would crowd out the rest of the table.

Pattern: **one summary row in the Evidence table + a full breakdown artifact linked from `### Artifacts`.**

- The summary row's Observed cell captures the headline ("47/47 within tolerance | 2 flagged") and points to the artifact file.
- The artifact (JSON, CSV, notebook cell output, plot) holds the per-instance detail.
- If the check has both a universal component (does it pass?) and an instance breakdown (which ones failed?), the row answers the first and the artifact answers the second.

This pattern is first-class — it satisfies the Contract's "evidence artifact on disk" requirement even for checks where the evidence is a data dump rather than a test file.

## When the Protocol Applies

| Track | Application | Checklist depth |
|-------|-------------|-----------------|
| **deep** | Dedicated Validate phase (preferred) or validation block inside the final execute phase. All required checks for the declared Mode. | Full checklist |
| **quick** | Inline validation block inside the execute phase. | Checklist's Quick subset |
| **fixer** | Minimal validation block — what changed, what didn't break, and any check the change could have regressed. | Checklist's Fixer subset |

Mode selects *which row of the checklist's Track Calibration table* applies within the declared Track (e.g., `Track: deep`, `Mode: iteration` for ML uses the Iteration row's required-checks list, which differs from Greenfield's).

**Not validation-eligible:**
- Review / Advise / Explain / Update modes — no new artifacts produced.
- Review-only agents (Researcher, Academic) — no artifacts produced.
- Planning / exploration phases that produce only specs or research notes.

**A phase is validation-eligible** if it writes, modifies, or regenerates a durable artifact that downstream consumers depend on.

## Composition with Other Protocols

- **Gate pattern:** The Validate step sits before the gate fence. Write the `## Validation` section → re-read it to the user → emit the gate fence. Same discipline as every other phase.
- **Join path protocol:** Join-path issues found during validation are recorded under **Notes** in the evidence table and, if unresolved, escalated to **Open Issues**.
- **Knowledge retrieval:** If the Knowledge Ledger has a relevant pattern (e.g., known bad distribution, historical grain issue), cite it in **Notes**.
- **Knowledge harvest:** At project completion, validation checks that caught real issues are harvest candidates — patterns worth saving.
- **Reviewer verdict:** Final-review invocation of Syn must read the `## Validation` section. Missing or unconvincing validation is grounds for `NEEDS REVISION`.
- **Autonomous Research `[AR]`:** Each AR iteration that keeps a change produces a lightweight validation block (Fixer-level subset) in the iteration log. Auto-reverted iterations do not.

## Failure Modes to Avoid

- **Box-ticking theater.** Filling the evidence table with plausible-sounding prose rather than measured values. The hook checks structural completeness; you must police semantic completeness yourself.
- **Code-runs-conflation.** "The query executed without error" is not validation. Execution is a precondition; correctness is the check.
- **Retroactive validation.** Validating after the user has accepted the result and moved on. Validation comes *before* the gate, not after.
- **Self-satisfying tests.** A test file that asserts what the code does (rather than what the code should do) passes trivially. If the test would pass against a broken implementation, it is not validation.
- **Downstream blind spots.** Changes to a shared model without checking dependent consumers. The Downstream Impact line exists for exactly this.

## Escape Hatch

The `SHARDS_GATE_ENFORCE=0` environment variable disables all gate enforcement — including validation enforcement — for debugging or emergency sessions. Do not default to it. The escape hatch exists for harness issues, not to skip validation under time pressure.
