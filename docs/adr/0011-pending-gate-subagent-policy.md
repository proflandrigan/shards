# 0011. Pending gates block subagents without a lease; lease-holding workers are exempt

Status: Accepted (2026-11-16)

## Context

While a gate is pending the PreToolUse hook denies write and exec tools (`hooks/lib/enforce.js`). Fan-out workers must keep working during that time, because the lead may be waiting on the user while workers run. The open question (Stage 5 follow-up) was whether subagents that are not fan-out workers should be exempt too.

Investigation of the actual behaviour (tests in `test/fanout-enforcement.test.js` and `test/s5f-followups.test.js`):

- A caller whose `agent_id` is bound to a slice of an active lease is exempt from the pending-gate block, but is confined to that slice's paths. Verified.
- Any other caller is denied while the top frame has a pending gate: the lead, a subagent with no `agent_id` binding, a subagent in an active fan-out that never called `fanout_claim`, a worker whose lease expired, and (with SubagentStop wiring) a worker that has exited. Verified.
- `fanout_claim` itself works while a gate is pending, so workers can bind at any time.
- Suspended gates do not block writes. A suspension is a human-approved pause, and the lead can continue other work.

No call wrongly blocked a lease-holding worker, so no behaviour change was needed.

## Decision

- Subagents that are not fan-out workers (no live lease binding) follow the same gate rules as the main agent: a pending gate blocks their writes.
- Fan-out workers holding a live binding may write inside their slice while a gate is pending. The lease, not the gate, is their authority.
- The exemption ends with the binding: lease expiry or SubagentStop (`releaseWorker`) puts the agent back under the gate.
- The block is a guardrail on Claude Code. Codex calls carry no `agent_id`, so every Codex caller is treated as unbound (compat CX-6).
- Related: `fanout_start` refuses while a gate is pending or suspended, so a fan-out cannot be opened past an unresolved gate.

## Consequences

- A subagent cannot be used to sidestep a pending gate.
- A worker that needs to run during a pending gate must be started through `fanout_start`/`fanout_claim` (or a task lease), which is already the intended delegation path.
- Reads and non-write tools are never blocked.
- `SHARDS_GATE_ENFORCE=0` disables every deny path.
