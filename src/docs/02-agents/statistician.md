# Statistician

> Nit-picky. Insufferable. Usually right.

Reviews statistical and metric claims: whether a conclusion actually follows from the evidence. Covers Bayesian and frequentist inference, experiment design and power, causal identification, hierarchical, survival and time-series models, and multiplicity. Purely consultative: it produces no project files and works conversationally. Role: reviewer.

## The Researcher and the Statistician

The two reviewers split the work by what they check. The routing rules live in `core/protocols/stats_review_routing.md`.

| | Researcher | Statistician |
|---|---|---|
| Question answered | Is the method sound? | Does the conclusion follow? |
| Triggers | Assumptions, distributions, outliers, sample size, method choice | Stated results, significance, effect sizes, causal or model-quality claims |
| Routing | Method review before or during analysis | Claim review on findings and evaluation results; the Researcher flags claims for the caller to route |

## Activation menu

On a switch, the agent shows this menu and waits for input.

- `[C]` Claim Review: check whether a stated conclusion follows from the evidence.
- `[E]` Experiment: review experiment design, power and analysis.
- `[B]` Bayes vs Freq: choose between Bayesian and frequentist approaches.
- `[M]` Model Critique: critique a statistical model.
- `[K]` Causal Claims: assess causal identification and claims.
- `[V]` Eval Statistics: statistics of model evaluation results.
- `[X]` Explain: explain a statistical concept in plain language.

## Modes

Mode files live in `core/agents/statistician/modes/`.

| Mode file | Purpose |
|---|---|
| `service.md` | The `service` consult entry, called by other specialists for claim review. |
| `advise.md` | The `advise` consult entry, a conversational advisory answer (used by Syn brainstorm). |

## Verdicts

Findings carry one of three labels: **INVALIDATES** (the conclusion does not follow), **WEAKENS** (the conclusion is overstated or under-supported) and **OFFENDS** (a stylistic or presentation nit). The verdict is one of **APPROVED**, **NEEDS REVISION** or **BLOCKED**, as for every reviewer; see [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md). OFFENDS findings never affect the verdict.

## Consulted by

Declares no reviewers, because consults never nest. In the phase files:

- [Data Analyst](data-analyst.md): phase 3 Step 5b claim review; optionally phase 2.
- [Data Scientist](data-scientist.md): phase 7 findings review; optionally phase 3; experiment mode; review and advise modes.
- [ML Engineer](ml-engineer.md): phase 6 evaluation-results claim review; optionally phase 4.
- [AI Engineer](ai-engineer.md): phase 7 Review 3b; optionally phase 4.
- [Syn](syn.md): brainstorm consults it through the `advise` entry.

## Output directory

None. The Statistician is conversational only and never writes files.

## How to start

- **Claude Code:** `/shards:statistician` (switch skill; calls `activate`).
- **Codex:** `$shards:statistician`, or `codex -p shards-statistician`.
- **As a consult:** subagents `statistician`, `statistician-service` and `statistician-advise`.

## See also

- [Researcher](researcher.md)
- [Reviewer Verdicts](../03-protocols/reviewer-verdicts.md)
- Source: `core/agents/statistician/AGENT.md`, `core/agents/statistician/agent.yaml`
