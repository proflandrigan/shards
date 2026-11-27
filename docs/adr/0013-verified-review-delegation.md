# 0013. Verified review delegation: review leads and verifier subagents

Status: Accepted (2026-11-27). Amends [0002](0002-activation-switch-consult-fan-out.md).

## Context

ADR 0002 says Claude Code subagents cannot spawn subagents. A live check on Claude Code 2.1.332 (headless `claude -p`, 2026-11-27, `docs/compat.md` CC-7) showed a three-level chain (main, then probe-l1, probe-l2, probe-l3) where every level ran Bash. So nesting works on the host, and the old limit is no longer a reason to keep reviews flat.

Panel review had one pass per specialist. Its High findings were never tested, so a finding could be a guess. A reviewer that could run a repro test would give a verified answer, but code execution writes files and reaches the network, so it needs the user's approval.

## Decision

- **Depth.** Main thread (Syn, or the active specialist) launches one review lead per specialist: the specialist's general subagent, at depth 1. The lead launches helpers at depth 2: `<id>-verify` verifiers, and cross-lens consults of other agents' consult entries. Helpers never spawn. The host default of three levels is enough. Codex needs `agents.max_depth = 2`.
- **Review leases.** A lead opens a `review`-owned lease with `fanout_start(purpose="review", run_id, slices)`. Slice paths must sit inside `.shards/review/<run_id>/`. Limits: 4 slices per call, 4 per agent (the lead) per `run_id`, and 16 per `run_id` per session, counting closed leases too. Review leases never restrict other callers.
- **Statuses.** Each finding is CONFIRMED (the repro ran and showed it), PLAUSIBLE (not verified, with a reason) or REFUTED (the test showed no problem). `fanout_collect` on a review lease returns `APPROVED` only when every verified finding is REFUTED, otherwise `NEEDS REVISION`. The lead's own answer to its caller still uses the three reviewer verdicts, `BLOCKED` included.
- **Code execution is off by default.** It runs only when the user approves it for the review, and the approval travels in the brief. Without approval, every finding is PLAUSIBLE.
- **Reviewers hold no gates and never fix source files.** Fixes go through the normal fan-out path.
- **Guardrails, not a sandbox.** `review_snapshot` and the scratch directories detect or limit writes made through Shards hooks. They do not confine the processes a verifier runs.

## Consequences

- The "subagents cannot spawn subagents" claim in 0002 is outdated. "Consult entries never nest" still holds: only the general subagent (the lead) has `Task`.
- A bound verifier is exempt from the pending-gate block, as fan-out workers are (ADR 0011). Its exec calls are not checked against its slice, so a repro test can write anywhere the user account can.
- Nested reviewers (for example a workstream lead's review inside PM mode) are told to verify nothing by spawning. That rule lives in the protocol text, not in the runtime.
- Repro tests stay under `.shards/review/<run_id>/` unless the user asks for them in the project suite.
