---
name: goal-mode-protocol
description: Shared protocol — goal mode is now the `plan` gate policy (unattended loops for AR Phase 2 and Experiment Phase 2)
type: reference
---

# Goal Mode = the `plan` gate policy

Goal mode no longer uses Claude Code `/goal` or a transcript evaluator. Gate-free
autonomous loops (AR Phase 2, Experiment Phase 2) run under the `plan` gate
policy:

- At the pre-loop gate, present the plan and the budget (iterations, cost
  ceiling, metric floor, target) and call `gate_request` for a `plan-approval`
  gate. Then STOP and wait for the user to confirm. Never confirm it yourself.
- Once the user confirms, every later gate kind becomes a notice: keep calling
  `gate_request` with `evidence`, and keep looping.
- The loop stops on failure, anomaly, or budget exhaustion, and the next gate
  waits for a human again.

Details: `autonomous_research.md` Section A.6 and `docs/gates.md` (policies).
Stop conditions are unchanged (AR §E convergence, §G safety rails; each
`experiment.md` Phase 2 stop conditions).
