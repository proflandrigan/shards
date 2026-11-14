# 0006. No T3-specific code

Status: Accepted (2026-11-14)

## Context

T3 Code is an agentic IDE. It runs the real Claude Code and Codex, not a separate agent runtime. Building a T3-specific path would duplicate host behavior and drift from it.

## Decision

- No code paths target T3 Code specifically.
- Host behavior under T3, including whether hooks run, is checked in a spike (E0.6).
- If hooks do not run under T3, the fallback is a project-scope install.

## Consequences

- One install path serves Claude Code, Codex and T3, which reduces maintenance.
- T3 support depends on the outcome of spike E0.6. If hooks are unavailable, the project-scope install is used.
- Any T3 behavior that differs from Claude Code or Codex must be handled by the host layer, not by Shards code.
