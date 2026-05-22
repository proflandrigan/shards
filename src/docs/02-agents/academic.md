# Academic

> Thoughtful, grounded in neuroscience, psychology, and cognitive science.

A consultative voice for questions of safety, ethics, and efficacy as they relate to human behavior, cognitive load, habit formation, algorithmic impact on users, and research-backed effectiveness. Consulted by any agent when safety, ethical, or efficacy questions arise. Can produce full literature reviews and research reports when specifically requested.

## Activation menu

- `[S]` Safety — Potential harms to users or populations.
- `[E]` Ethics — Fairness, autonomy, manipulation, consent.
- `[F]` Efficacy — Will this actually work? What does evidence say?
- `[B]` Behavior — How humans actually respond (biases, habits, attention).
- `[C]` Cognitive — Complexity, decision fatigue, mental models, load.
- `[R]` Report — Full literature review or research synthesis.
- `[L]` Literature — Specific citations on a behavioral or psych topic.
- `[CR]` Critical Review — Critically audit a written report for accuracy, thoroughness, fairness.

## Modes

| Mode | File | Purpose |
|---|---|---|
| Report | `specific_instructions/academic/report.md` | Full literature review / research report (3-phase workflow). |
| Critical Review | `specific_instructions/academic/critical_review.md` | Audit a finished `.md` report against three lenses: Accuracy, Thoroughness, Fairness (5-phase workflow). |

Other menu options are conversational — no phased workflow, no files unless explicitly requested.

## Phases (Report mode)

1. **Discovery and Scope** — confirm topic, audience, framing.
2. **Evidence Gathering** — literature search, synthesis, citation.
3. **Report Drafting** — executive summary, evidence, analysis, recommendations.

## Phases (Critical Review mode)

The `[CR]` mode points the Academic shard at a finished `.md` report (study writeup, analysis, proposal, white paper) and produces a structured critique against three lenses:

- **Accuracy** — claims correct, sources cited correctly, mechanisms named correctly.
- **Thoroughness** — coverage gaps, vulnerable populations, missing mechanisms or counter-evidence.
- **Fairness** — conclusions proportional to evidence; overclaims, understatements, selective framing.

1. **Scope (GATE)** — report path, lens, audience, output preference (inline-in-chat or file), output dir override.
2. **Read & Extract Claims** — inventory factual / mechanistic / ethical / behavioral claims and notable absences.
3. **Triangulate Evidence** — mandatory WebSearch + WebFetch on load-bearing claims.
4. **Three-Lens Critical Assessment** — apply Accuracy / Thoroughness / Fairness; severity-tag each finding.
5. **Deliver Review (GATE)** — inline or file (default location: same directory as the reviewed report).

Also exposed as `SERVICE MODE — REPORT REVIEW` for Task-based dispatch from Syn or other specialists (always inline, no file write).

## Consulted by

- **AI Engineer** — Phase 5 safety/ethics consultations, Phase 7 model card review.
- **ML Engineer** — Phase 7 model card ethics review.
- Any specialist for questions about user-facing impact or behavioral efficacy.

## Output directory

- **Report mode** — `studies/academic_reports/`.
- **Critical Review mode** — same directory as the reviewed report, named `academic-critical-review-of-<report-slug>.md` (user can override during Phase 1). This mode is designed to be pointable at any directory, including non-shards target dirs.
- Other modes produce conversational findings only.

## Entry points

- Slash command: `/academic`
- Skill: `academic`
- Via Task from AI Engineer, ML Engineer, or other specialists

## See also

- [AI Engineer](ai-engineer.md)
- [Researcher](researcher.md)
- Source: `src/agents/academic.md`
