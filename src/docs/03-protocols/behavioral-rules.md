# Behavioral Rules

Rules every specialist follows, defined in `core/protocols/behavioral_rules.md` and pulled into each agent through the protocol macro.

## 1. Document before advancing

No phase ends until its decisions are written to `project-specs.md` and the specialist has requested the gate. See [The Gate Pattern](gate-pattern.md).

## 2. One phase at a time, then wait

Every phase ends with a `gate_request` call. After calling it the specialist stops: no further work and no next phase until the gate is confirmed. It cannot confirm its own gate: it can only call `gate_advance` (which makes the host ask the user) or relay the user's verbatim chat reply with `gate_confirm`, and the runtime checks that a real answer exists. Silence, questions and partial agreement are not confirmation. Phases are never batched.

## 3. Load `project-specs.md` once, treat it as live

The specialist loads the specs at session start (or on handoff receipt) and updates them in place. It re-reads only where they may have changed out of band: after a compact, in a new session, on a handoff, and in arbiter or convergence steps.

## 4. Announce cross-agent reviews

Before consulting another specialist, the agent tells you who, why and what they will return. You can veto.

## 5. Facilitate, don't generate

Specialists ask, propose and document. They do not silently generate artifacts, and code, queries and reports are written after the gate is confirmed.

**Exceptions** where Syn suspends this rule for scoped reasons: `[F]` Fixer, `[G]` PR Review, Notebook Walkthrough, and the Autonomous Research loop (Phase 2 only, announced before its gate).

## 6. Escalation Brief

When scope outgrows the current agent, it writes an `## Escalation Brief` section (originating agent, target agent, trigger, findings so far, open questions, relevant files, recommended command) to `project-specs.md` before handing off. The target agent reads it on startup and skips questions already answered.

## 7. Related cross-cutting rules

- Trace join paths before writing multi-table SQL ([Join-Path](join-path.md)).
- Validate before closing the gate on any artifact-producing phase, with `validates=<agent>` on the gate ([Validation](validation.md)).
- DIVERGE is opt-in and user-gated, only in planning phases or at the start of an `[AR]` session ([DIVERGE](diverge.md)).
- Discovery in Phase 0 and Phase 1 follows the intent-discovery rhythm: Open, Listen, Reflect, Probe, Assess, one question at a time, each in the agent's own voice (`core/protocols/intent_discovery.md`).
- After a final review from Syn, a NEEDS REVISION verdict follows a bounded loop with one resubmission, then escalation to you (`core/protocols/syn_review_resolution.md`; see [Reviewer Verdicts](reviewer-verdicts.md)).

## Why this matters

These rules are why Shards projects produce auditable decision trails. Without them, agents would silently produce code you never agreed to and skip the documentation that makes the work auditable later.

## See also

- [The Gate Pattern](gate-pattern.md)
- [Engineering Guidelines](engineering-guidelines.md)
- [Reviewer Verdicts](reviewer-verdicts.md)
- Source: `core/protocols/behavioral_rules.md`
