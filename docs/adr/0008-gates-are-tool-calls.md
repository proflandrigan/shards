# 0008. Gates are tool calls with state, never parsed text; the agent can never approve its own gate

Status: Accepted (2026-11-14)

## Context

Gates are currently `::GATE:: ... ::ENDGATE::` fences in model output, parsed by Claude Code hooks (`Stop`, `PreToolUse`, `UserPromptSubmit`) from the transcript file. The audit found 317 gate occurrences. Parsing text is fragile and depends on the host's transcript format. Gates also misfire after compaction in long sessions.

## Decision

- A gate is a tool call that records state in the runtime. It is not text the runtime parses.
- Every confirmation, and every suspension, must be tied to a real human action in this session. One of these is required:
  - an elicitation response;
  - a host approval prompt that was **actually shown at call time** and cannot be pre-allowed;
  - the **whole, first, previously unused** user message after the gate was requested.
- When the runtime cannot prove a human action, it refuses and says how to confirm.
- The agent can never approve its own gate.

## Residual risk

In tier 3 (a host with neither elicitation nor approval prompts, where only the user's message is available), the agent still decides between `confirmed` and `changes_requested`. The user's full reply is stored with the gate for audit, so the decision can be reviewed later, but it is not prevented at the time it is made.

## Consequences

- Gate state no longer depends on parsing model output or the host's transcript format.
- Confirmation is tied to a human action, so the model cannot approve itself on hosts that support elicitation or approval prompts.
- Tier 3 hosts carry the residual risk above, and the stored reply is the audit trail for it.
- The runtime refuses unproven confirmations and gives the user a clear way to confirm.
