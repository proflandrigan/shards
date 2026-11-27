# Activation Modes

An agent can be activated in three ways, plus a build pattern that uses the third (ADR 0002, ADR 0009). An agent supports the modes listed in `activation` in its `agent.yaml`.

| Mode | What happens | Gates | Depth |
|---|---|---|---|
| **Switch** | The agent's persona becomes the active frame on a session stack. You talk to it directly. | Owns them until it returns. | The main session. |
| **Consult** | An isolated subagent answers one question and returns a verdict. | Never holds gates. | One level. A consult entry cannot consult, switch or fan out. A reviewer's lead can, see Review leads. |
| **Fan-out** | The lead launches parallel workers under a lease, one slice each. | Never hold gates. | Workers and verifiers never delegate. |

## Switch

`activate(agent=<id>, mode="switch")` pushes a frame. The agent loads its phases with `load_phase`, and the status header shows the active agent. `return` pops the frame, and refuses while the frame has a pending gate unless that gate was suspended. Syn is the router: it maps your intent to a specialist and switches to it instead of spawning it. Entry points are `/shards:<id>` in Claude Code and `$<id>` in Codex.

## Consult

A consult is a native subagent (`<id>`, or `<id>-<entry>` for entries such as `review`, `advise`, `service`, `final_review`). Specialists use consults at defined checkpoints, for example the Researcher for methodology or Syn for final sign-off. The reviewer returns APPROVED, NEEDS REVISION or BLOCKED (see [Reviewer Verdicts](reviewer-verdicts.md)). The build fails if a consult entry expands another consult, fan-out or switch, so depth stays 1. Entries written for a user at the keyboard (`review`, `advise`) start with a pointer to `core/protocols/consult_mode.md`: as a consultant the agent asks you nothing, raises no gates, writes no files, lists any further consults as open questions for the caller, and answers in one message.

## Fan-out

`fanout_start` opens one lease over N non-overlapping slices (each with paths and an acceptance text). Each worker calls `fanout_claim`, writes only inside its slice, and returns verdict JSON. `fanout_collect` merges the verdicts, with the worst verdict winning, and closes the lease. The Swarm and DIVERGE modes use it, as does Panel Review when it applies fixes (see [Swarm](swarm.md) and [DIVERGE](diverge.md)). Panel review's verifiers use review leases (below). Fan-out is refused while a gate is pending or suspended.

## Review leads

Panel review, and a specialist's own code review, run one review lead per specialist. The lead is the specialist's general subagent, one level below the main session. It opens a review lease over its verifier slices, launches one verifier per slice, and merges their results. Verifiers cannot delegate.

Each finding gets one status. CONFIRMED means a repro test ran and showed the problem. PLAUSIBLE means it was not verified, with a reason. REFUTED means the test showed no problem. The lead still answers with a reviewer verdict (APPROVED, NEEDS REVISION or BLOCKED).

Code execution is off unless you approve it for the review, and then only the commands you name may run. Verifier scratch files go under `.shards/review/<run_id>/`. When you approve code execution, the caller snapshots the reviewed files before and checks them afterwards, and the hook checks write tools against the scratch dir. Both are guardrails: a repro test can still write anywhere your account can.

Source: `docs/delegation.md` section 3.2, `docs/adr/0013-verified-review-delegation.md`.

## Delegated build

Build and execute phases are led, not done alone: the specialist stays in the main session as lead, delegates each task to a worker, then verifies it. This keeps the main context small. See [Delegated Build](delegated-build.md).

## Host differences

Claude Code supports all modes, with hook-based write enforcement. Codex support is built but unverified against a real Codex CLI: skill takeover and per-agent profiles stand in for switch, and Codex calls cannot be bound to a lease. See `docs/compat.md`.

## See also

- [Gate Pattern](gate-pattern.md)
- [Agents overview](../02-agents/overview.md)
- Source: `docs/activation.md`, `docs/delegation.md`, `docs/adr/0002-activation-switch-consult-fan-out.md`, `docs/adr/0009-led-build-phases.md`
