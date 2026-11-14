# 0009. Build phases are led, not done alone

Status: Accepted (2026-11-14)

## Context

Specialists currently do build and execute work in the main session. Long builds fill the context, and compaction in the middle of a build was a major cause of gate misfires.

## Decision

- In build and execute phases, the specialist stays in the main session as the **lead**.
- The lead breaks the approved plan into **discrete tasks**. Each task has owned paths and an acceptance check.
- The lead **delegates each task to a worker subagent** and verifies every result against the plan.
- Workers never hold gates, never change the plan, and never delegate further. Gates, plan changes and the user conversation stay with the lead.

## Consequences

- The main session's context stays small, which reduces compaction and the gate misfires it caused.
- Each task has an owned path set, so parallel workers do not edit the same files.
- Verification is the lead's job, so every worker result is checked against the plan before it is accepted.
- Workers cannot advance a phase, which keeps gate ownership in one place.
- Workers add cost and latency per task, so tasks should stay discrete enough to justify a worker.
