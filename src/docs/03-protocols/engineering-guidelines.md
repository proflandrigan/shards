# Engineering Guidelines

Code-craft rules every specialist applies whenever it writes or edits a durable artifact — code, SQL, notebooks, dbt models, configuration, pipelines, dashboard code. Codified in `src/agents/specific_instructions/shared/engineering_guidelines.md` and referenced from each specialist's Behavioral Rules section alongside [`behavioral_rules.md`](behavioral-rules.md).

Where `behavioral_rules.md` governs *workflow discipline* (gates, phasing, escalation), this file governs *code craft* — how to produce the artifact once you're inside an execute or build phase.

## 1. Think Before Coding

State assumptions explicitly. Present alternative interpretations rather than picking silently. Push back when a simpler approach exists. Stop and ask when something is genuinely unclear.

This extends the gate pattern from project-level decisions to line-level ones: if a build choice is contentious or opaque enough to need your input, the specialist raises it in chat before writing it, not after.

## 2. Simplicity First

Minimum code that solves the problem. No features, abstractions, configurability, or error handling beyond what was asked. If a 200-line implementation could be 50, rewrite it.

Domain extensions:

- **SQL:** no CTEs that go unreferenced, no joins that don't tighten the result, no `DISTINCT` slapped on to hide a join-path bug.
- **Notebooks:** no exploratory cells left in a "final" notebook, no `try/except` swallowing errors that should surface.
- **Pipelines / dbt:** no models that wrap a single `SELECT *`, no configuration knobs nobody will turn, no incremental strategies on tables small enough to refresh fully.
- **Services:** no fallback paths for branches the surrounding code makes unreachable.

## 3. Surgical Changes

Touch only what the request requires. Match existing style. Don't refactor adjacent code that isn't broken. Clean up orphans the change itself created — not pre-existing dead code.

The test: every changed line should trace directly to the request.

Especially relevant in iteration mode (ML / AI / AE), Fixer mode, Panel Review, and any phase that edits an existing artifact. Iteration's defining failure mode is the agent that "just cleans up while it's in there." When the specialist notices unrelated issues, it logs them under `Open Issues` in `project-specs.md` (or raises them in chat for review-only flows) rather than silently fixing.

## 4. Goal-Driven Execution

Define verifiable success criteria *before* writing code. Transform vague tasks ("make it work") into testable goals ("write a failing test, then make it pass"). State a brief verification plan for multi-step tasks.

This rule composes with two related protocols:

- [Validation Protocol](validation.md) — the gate-level expression. Evidence over assertion before closing any artifact-producing phase.
- [Incremental Testing](incremental-testing.md) — the build-loop expression. Test each component as you write it; don't batch failures to the end.

Engineering guidelines cover the gap between them: at the individual-task level, the verification check is named *first*, not last.

## Tradeoff

These guidelines bias toward caution over speed. For trivial edits — typos, one-line config tweaks, label changes — specialists use judgment rather than ceremony.

## When workflow and code-craft rules conflict

Workflow rules dominate. A specialist never violates a gate, skips facilitation, or bypasses validation in order to satisfy a code-craft preference.

## See also

- [Behavioral Rules](behavioral-rules.md)
- [Validation Protocol](validation.md)
- [Incremental Testing](incremental-testing.md)
- Source: `src/agents/specific_instructions/shared/engineering_guidelines.md`
