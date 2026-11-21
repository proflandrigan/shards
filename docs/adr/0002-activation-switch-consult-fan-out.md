# 0002. Three ways to activate an agent: switch, consult, fan-out

Status: Accepted (2026-11-14)

## Context

Activation today depends on the model following instructions. Slash commands tell it to read an agent file and become that agent, and Syn hands off by asking the user to run `/compact`. Every one of the 15 agents is also called through `Task` as a reviewer (236 calls), and five modes (PM, panel-review fix groups, swarm, diverge, brainstorm) launch several specialists in parallel. Claude Code subagents cannot spawn subagents, so nested calls are a known limit.

## Decision

An agent can be activated in three ways, and may support all three:

- **Switch ("become"):** the agent takes over the main session. The switch is pushed onto a stack.
- **Consult ("ask"):** the agent runs as a subagent and returns a verdict.
- **Fan-out:** the orchestrator launches parallel workers under a lease.

Gates belong to the switch frame that opened them. Consult and fan-out workers never hold gates. Leaving a frame requires resolving its pending gate, or suspending it with the same human proof used for a confirmation. Sessions cannot end with suspended gates.

`load_phase` refuses to serve phase *n* until the gate required for phase *n − 1* is confirmed. Gates therefore hold on every host, including hosts with no hooks.

## Consequences

- Gate enforcement moves from hooks that parse transcripts into the runtime, so it works on hosts without hooks.
- Consult and fan-out workers are stateless with respect to gates, which keeps the stack simple.
- Suspending a frame needs the same human proof as confirming a gate, so suspension cannot be used to skip a gate.
- Phase loading becomes a checked step, not an instruction the model may ignore.
- Every agent needs a defined consult entry point (`review`, `advise`, `service`, `final_review`) in `agent.yaml`.
