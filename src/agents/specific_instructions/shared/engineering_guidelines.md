---
name: shared-engineering-guidelines
description: Cross-cutting code-craft rules applied when writing or editing code, SQL, notebooks, or configuration artifacts
type: reference
---

# Engineering Guidelines

These rules apply whenever you write or modify a durable artifact — code, SQL,
notebooks, dbt models, configuration, pipeline definitions, dashboard code.
They address the most common failure modes when an agent moves from planning
into execution: overcomplication, speculative scope, drifting into adjacent
edits, and shipping work without verifying it.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
edits (a typo, a one-line config tweak, a label change), use judgment — don't
perform ceremony where none is warranted.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations of the request exist, present them — don't pick
  silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

**Composition with Shards workflow.** Phase 0 triage and the gate pattern
already enforce this at the project level. These guidelines extend it to the
line level inside build and execute phases — every non-trivial code decision
deserves the same discipline as a phase decision. If a build choice is opaque
or contentious enough to need user input, raise it in chat before writing it,
not after.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

**Domain extensions:**

- **SQL:** no CTEs you don't reference, no joins that don't tighten the
  result, no defensive `COALESCE` against nulls that can't occur, no
  `DISTINCT` slapped on to hide a join-path mistake (trace the join path
  instead — see `join_path_protocol.md`).
- **Notebooks:** no exploratory cells left in a "final" notebook; no helper
  functions used once that could be inline; no `try/except` swallowing
  errors the user should see.
- **Pipelines / dbt models:** no models that wrap a single `SELECT *`; no
  configuration knobs nobody will turn; no incremental strategies on tables
  small enough to refresh fully.
- **Services:** no parameters with default values that no caller will ever
  override; no fallback paths for branches the surrounding code makes
  unreachable.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, *mention it* — don't delete it.

When your changes create orphans:

- Remove imports, variables, or functions that **your** changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** every changed line should trace directly to the user's
request.

**Especially relevant in:** iteration mode (ML / AI / AE), Fixer mode
(`syn/fixer.md`), Panel Review mode, and any phase that edits an
existing artifact rather than producing a greenfield one. Iteration's
defining failure mode is the agent that "just cleans up while it's in
there" and silently rewrites work that wasn't on the table.

**Surfacing unrelated issues.** If you notice dead code, an obvious smell,
or a real bug adjacent to your change, record it in the `Open Issues`
section of `project-specs.md` (or raise it in chat for review-only and
fixer flows). Do not silently fix it. Visibility is the obligation; the fix
is the user's call.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
- "Optimize the query" → "Measure baseline runtime, change, measure again"

For multi-step tasks, state a brief plan before you start:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification — and produce work that nobody can
confidently sign off on.

**Composition with Shards protocols:**

- `validation_protocol.md` is the gate-level expression of this rule —
  evidence over assertion before closing any artifact-producing phase.
- `incremental_testing.md` is the build-loop expression — test each
  component as you write it; don't batch failures to the end.
- This rule covers the gap between them: at the individual-task level,
  *state the verification check before you write the code*, not after.

## How these compose with `behavioral_rules.md`

`behavioral_rules.md` governs *workflow discipline* — gates, phasing,
escalation, facilitation. This file governs *code craft* — how to write
and edit the artifacts that those phases produce. Both apply. The
workflow rules dominate when they conflict: never violate a gate to
satisfy a code-craft preference.
