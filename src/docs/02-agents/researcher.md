# Researcher

> Nerdy. Asks hard questions about assumptions and validity.

Reviews statistical methodology, distribution assumptions, outlier handling and analytical rigor. Purely consultative: it produces no project files, with one narrowly scoped exception, the `[CR]` Critical Review mode, where the user can opt into a written review file. In Panel Review (a Syn mode) it also reviews notebooks, analysis SQL and study reports for rigor; recommendations are applied by the domain reviewer, not by the Researcher. Role: reviewer.

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[R]` Review: review an analysis plan or methodology.
- `[D]` Distributions: assess what distribution your data follows.
- `[O]` Outliers: outlier detection and handling.
- `[A]` Assumptions: check statistical assumptions for a method.
- `[S]` Sample Size: power analysis and sample adequacy.
- `[M]` Method Pick: choose the right statistical method.
- `[E]` Explain: explain a statistical concept in plain language.
- `[CR]` Critical Review: audit a written report's methods (accuracy, thoroughness) and flag claims for the Statistician.

## Modes

Mode files live in `core/agents/researcher/modes/`.

| Mode file | Purpose |
|---|---|
| `service.md` | The `service` consult entry, called by other specialists for methodology review. Includes a report-review branch for a Critical Review dispatched by another agent (always inline). |
| `review_checklist.md` | Review checklist by problem type, including Report-Specific Checks for `[CR]`. |
| `critical_review.md` | `[CR]` Critical Review: audit a finished `.md` report against Accuracy and Thoroughness, and list claims for the Statistician. |

## Verdicts

Like every reviewer, the Researcher returns one of three words: **APPROVED**, **NEEDS REVISION** or **BLOCKED**. Reviewer-specific nuance goes in the body of the review. Older specs may contain the previous words (Sound, Consider Alternatives, Revise); [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md) gives the mapping.

## Critical Review mode (`[CR]`)

1. **Scope** (gate): report path, lens, artifacts to spot-read, output preference (inline or file), output directory override.
2. **Read and extract methodological claims**: methodology, sample, assumptions, outlier handling, reported quantities, interpretive language.
3. **Apply the statistical checklist**, including the Report-Specific Checks.
4. **Lens assessment**: Accuracy and Thoroughness, each finding severity-tagged; claims listed for the Statistician.
5. **Deliver review** (gate): inline or file.

Gates are `gate_request` tool calls that only a human confirms; see [The Gate Pattern](../03-protocols/gate-pattern.md).

## Consulted by

Declared as a reviewer by the [AI Engineer](ai-engineer.md), [Applied ML Scientist](applied-ml-scientist.md), [Data Analyst](data-analyst.md), [Data Scientist](data-scientist.md), [Deep Learning Engineer](deep-learning-engineer.md), [ML Engineer](ml-engineer.md) and [Syn](syn.md). In the phase files:

- **Data Analyst:** phase 2 plan review.
- **Data Scientist:** phases 3 and 6.
- **ML Engineer:** phases 4, 6 and 7 when statistical inference matters.
- **AI Engineer:** phases 4 and 7 evaluation review.
- **Applied ML Scientist:** phase 3.

The Researcher declares no reviewers, because consults never nest: when data-structure context matters, the caller collects data-modeller context (grain, entities, relationships) first and passes it in the task.

Claims (whether a conclusion follows from the evidence) belong to the [Statistician](statistician.md); the Researcher flags them under "Claims for the Statistician" for the caller to route. See `core/protocols/stats_review_routing.md`.

## Output directory

- **All modes except `[CR]`:** none; conversational findings.
- **`[CR]` with file output (opt-in only):** `shards/academic_reports/researcher-critical-review-of-<report-slug>.md` (the agent's `output_dir`), unless the user names another directory at the scope gate; that file is then passed as a gate target. Otherwise output stays inline.

## How to start

- **Claude Code:** `/shards:researcher` (switch skill; calls `activate`).
- **Codex:** `$shards:researcher`, or `codex -p shards-researcher`.
- **As a consult:** subagents `researcher` and `researcher-service`.

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [Academic](academic.md)
- [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)
- Source: `core/agents/researcher/AGENT.md`, `core/agents/researcher/agent.yaml`
