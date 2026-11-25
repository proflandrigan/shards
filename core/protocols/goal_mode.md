---
name: goal-mode-protocol
description: Shared protocol — goal mode is now the `plan` gate policy (unattended loops for AR Phase 2 and Experiment Phase 2)
type: reference
---

# Goal Mode = the `plan` gate policy

Goal mode no longer uses Claude Code `/goal` or a transcript evaluator. Gate-free
autonomous loops (AR Phase 2, Experiment Phase 2) run under the `plan` gate
policy:

- At the pre-loop gate (the agent's own Phase 1 gate), present the plan and
  the budget (iterations, cost ceiling, metric floor, target). If the user
  chooses an unattended loop, raise that same gate with
  `plan_approval: "<run-id>"`, where the run id is unique to this run. That
  gate is the plan approval; never raise a second one. Then STOP and wait for
  the user to confirm. Never confirm it yourself.
- An approval covers one run in one project. The next run raises its gate with
  a new run id and needs a fresh confirmation; the notice budget is per run.
- Once the user confirms, later gate kinds become notices and the loop keeps
  running. AR records per-iteration evidence in `results.json` and does not
  gate each iteration (`autonomous_research.md` A.6); experiment mode keeps
  calling `gate_request` with `evidence` after each experiment.
- The loop stops on failure, anomaly, or budget exhaustion, and the next gate
  waits for a human again.
- The Phase 3 adoption gate is always confirmed by a human, even after a plan
  approval. A later runtime flag enforces this.

Details: `autonomous_research.md` Section A.6 and `docs/gates.md` (policies).
Stop conditions are unchanged (AR §E convergence, §G safety rails; each
`experiment.md` Phase 2 stop conditions).
