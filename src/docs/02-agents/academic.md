# Academic

> Thoughtful, grounded in neuroscience, psychology, and cognitive science.

A consultative voice for questions of safety, ethics, and efficacy as they relate to human behavior, cognitive load, habit formation, algorithmic impact on users, and research-backed effectiveness. Consulted by other agents when safety, ethical, or efficacy questions arise. Produces full literature reviews and research reports only when asked. Role: reviewer (no build phases of its own).

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[S]` Safety: potential harms to users or populations.
- `[ET]` Ethics: fairness, autonomy, manipulation, consent.
- `[F]` Efficacy: will this actually work? What does evidence say?
- `[B]` Behavior: how humans actually respond (biases, habits, attention).
- `[C]` Cognitive: complexity, decision fatigue, mental models, load.
- `[RP]` Report: full literature review or research synthesis.
- `[RS]` Literature: specific citations on a behavioral or psychology topic.
- `[CR]` Critical Review: audit a written report for accuracy, thoroughness, fairness.

## Modes

Mode files live in `core/agents/academic/modes/`.

| Mode file | Purpose |
|---|---|
| `service.md` | The `service` consult entry: a single-question review called by other agents; returns a verdict (APPROVED, NEEDS REVISION or BLOCKED). Also a report-review branch for a Critical Review dispatched by another agent (always inline, no file write). |
| `report.md` | `[RP]` Report: full literature review or research report. Gated at scope and at close; writes the report file. |
| `critical_review.md` | `[CR]` Critical Review: audit a finished `.md` report against three lenses, Accuracy, Thoroughness and Fairness. |

The other menu options are conversational: no phased workflow and no files unless you ask for one.

## Report mode (`[RP]`)

1. **Discovery and Scope** (gate): topic, audience, framing.
2. **Evidence Gathering**: literature search, synthesis, citation.
3. **Report Drafting**: executive summary, evidence, analysis, recommendations.
4. **Present and Close** (gate).

Gates are `gate_request` tool calls that only a human confirms; see [The Gate Pattern](../03-protocols/gate-pattern.md).

## Critical Review mode (`[CR]`)

1. **Scope** (gate): report path, lens, audience, output preference (inline or file), output directory override.
2. **Read and extract claims**: factual, mechanistic, ethical and behavioral claims, plus notable absences.
3. **Triangulate evidence**: web search and fetch on load-bearing claims.
4. **Three-lens assessment**: Accuracy, Thoroughness, Fairness; each finding severity-tagged.
5. **Deliver review** (gate): inline or file.

## Consulted by

Declared as a reviewer by the [AI Engineer](ai-engineer.md) and the [ML Engineer](ml-engineer.md), through the `service` entry:

- **AI Engineer:** phase 5 safety and guardrails, phase 7 final review.
- **ML Engineer:** phase 7 model card ethics review.

Any specialist can also ask for a review of user-facing impact or behavioral efficacy. Consults never nest, so the Academic calls no other agent.

## Output directory

- **Report mode:** `studies/academic_reports/`.
- **Critical Review mode:** the directory of the reviewed report, named `academic-critical-review-of-<report-slug>.md` (overridable at the scope gate). It can be pointed at any directory, including ones Shards did not create.
- **Everything else:** conversational findings only.

## How to start

- **Claude Code:** `/shards:academic` (switch skill; calls `activate`).
- **Codex:** `$shards:academic`, or `codex -p shards-academic`.
- **As a consult:** subagents `academic` and `academic-service`, called by other agents.

Reference material is reached through the `knowledge` job; see [Knowledge](../03-protocols/knowledge.md). Nothing is published yet, so install from source: [Install](../01-getting-started/install.md).

## See also

- [AI Engineer](ai-engineer.md)
- [Researcher](researcher.md)
- [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)
- Source: `core/agents/academic/AGENT.md`, `core/agents/academic/agent.yaml`
