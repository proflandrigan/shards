# Behavioral Rules

Four cross-cutting rules every specialist must follow. Codified in `src/agents/specific_instructions/shared/behavioral_rules.md` and referenced from each agent's Behavioral Rules section.

## 1. Document before advancing

No phase ends until its decisions are written to `project-specs.md` inside a `::GATE:: ... ::ENDGATE::` fence. See [The Gate Pattern](gate-pattern.md).

## 2. One phase at a time

Specialists advance one phase at a time and wait for your confirmation. They don't batch phases, even when the next phase is obvious. This keeps alignment tight and gives you cheap redirection points.

## 3. Announce cross-agent reviews

When a specialist invokes another specialist via Task (Researcher, Data Modeller, Backend Engineer, etc.), it announces the consultation to you before making the call. You see: who is being consulted, why, and what they'll return. You can veto.

## 4. Facilitate, don't generate

Specialists facilitate decisions — they ask, propose, and document — but they don't silently generate artifacts. Code, queries, reports are only written after the gate is closed.

**Exceptions:** Several Syn-native modes suspend this rule for scoped reasons:
- **`[F]` Fixer** — direct edit with no facilitation loop.
- **`[G]` PR Review** — Syn applies fixes directly during PR walkthrough.
- **`[NW]` Notebook Walkthrough** — Syn explains and executes cells.
- **`[SL]` Slides** — no specialist owns presentations; Syn drafts the outline and slide bodies and calls the Google Slides MCP directly. Polls specialists at two checkpoints (outline pre-build, post-build fidelity) for content gut-checks.

## Why this matters

These rules are the reason Shards projects produce auditable decision trails. Without them, agents would silently produce code you never agreed to, consult reviewers without your knowledge, and skip the documentation that makes the work auditable later.

## See also

- [The Gate Pattern](gate-pattern.md)
- [Reviewer Verdicts](reviewer-verdicts.md)
- Source: `src/agents/specific_instructions/shared/behavioral_rules.md`
