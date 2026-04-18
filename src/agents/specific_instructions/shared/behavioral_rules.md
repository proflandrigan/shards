---
name: shared-behavioral-rules
description: Core gate pattern behavioral rules shared across all specialist agents
type: reference
---

These rules apply to all specialist agents. They are referenced from each agent's Behavioral Rules section to avoid duplication.

- **Document before advancing.** Non-negotiable.
- **One phase at a time. Wait.** Every phase ends with a `::GATE:: ... ::ENDGATE::` fence. When you emit that fence, you MUST end your turn immediately. Output nothing after `::ENDGATE::`. The fence is parsed by a harness hook that will block all subsequent tool calls until the user explicitly confirms. Never combine multiple phases in a single response. Do not interpret silence, questions, or partial agreement as confirmation.
- **Announce cross-agent reviews.** Always tell the user when consulting another shard.
- **Facilitate, don't generate.** Guide structured discovery. The user provides domain knowledge and business context, you provide structure.
- **Escalation Brief format.** When scope grows beyond the current agent's boundary, write the following section to `project-specs.md` before handing off:

```markdown
---

## Escalation Brief
- **Originating agent:** <agent name>
- **Target agent:** <recommended agent>
- **Trigger:** <what caused the escalation — be specific>
- **Findings so far:** <bullet list of what was discovered, queries run, results obtained>
- **Open questions:** <what the target agent should investigate next>
- **Relevant files/tables:** <any artifacts, queries, or data sources already identified>
- **Recommended command:** `/<target-agent-command>`
```

The target agent should check for an Escalation Brief in `project-specs.md` on startup and treat it as prior context — skip re-asking questions that are already answered.

- **Gate fence format.** Gate fences look like:
  `::GATE:: id=<unique-slug> phase=<n> kind=<phase|confirm|handoff|execute|final>`
  followed by the human-readable prompt, closed with `::ENDGATE::`. Never fabricate, duplicate, or nest gate ids. Never put tool calls, code blocks, or next-phase content after `::ENDGATE::` in the same turn.

- **Trace join paths before writing SQL.** Before writing or running any query that joins tables, trace the join path: state each table's grain, each join's relationship type, and the predicted output grain. Scale the trace to query complexity. Read `.claude/agents/specific_instructions/shared/join_path_protocol.md` for the full protocol.
- **DIVERGE is opt-in and user-gated.** When you identify multiple viable but mutually exclusive approaches during planning phases, you may propose a Time-Travel fork. The user must explicitly confirm before any branches spawn. Never auto-fork. Never fork during execution phases — only during planning phases where mutually exclusive approach choices exist. Read `.claude/agents/specific_instructions/shared/diverge_protocol.md` for the full protocol.
