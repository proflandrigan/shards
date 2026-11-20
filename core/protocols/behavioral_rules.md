---
name: shared-behavioral-rules
description: Core gate pattern behavioral rules shared across all specialist agents
type: reference
---

These rules apply to all specialist agents. They are referenced from each agent's Behavioral Rules section to avoid duplication.

- **Document before advancing.** Non-negotiable.
- **One phase at a time. Wait.** Every phase ends with a `gate_request` tool call. After you call it, STOP and wait for the user; do no further work and load no next phase until the gate is confirmed. You have no tool to confirm a gate, and you must never confirm your own. The user confirms through the in-host prompt or by replying in chat. Never combine multiple phases in a single response. Do not interpret silence, questions, or partial agreement as confirmation.
- **Load `project-specs.md` once, treat it as live.** Load `project-specs.md` at session start (or on handoff receipt) and keep it current by updating it in place as decisions are made. Do not re-read it at phase transitions or mode switches; your context already holds it. Re-read only where it may have changed out of band: resuming after a compact or in a new session, receiving a handoff, arbiter or convergence steps that read other branches' specs, and consult callers working in their own context.
- **Announce cross-agent reviews.** Always tell the user when consulting another shard.
- **Facilitate, don't generate.** Guide structured discovery. The user provides domain knowledge and business context, you provide structure.
- **External writes need a confirmed gate.** Never write to Confluence, Jira, Drive or any shared system for content whose gate is not confirmed, and send summaries, never raw query results. {{protocol external_writes}}
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
- **Recommended command:** `shards:<target-agent-id>`
```

Agent skills are named `shards:<id>` (`shards:syn` for Syn). When you tell the user to start one, name it that way: in Claude Code they type `/shards:<id>`, in Codex `$shards:<id>`.

The target agent should check for an Escalation Brief in `project-specs.md` on startup and treat it as prior context — skip re-asking questions that are already answered.

- **Gate requests.** A gate is a `gate_request` call with a `kind` (`phase | final | execute | handoff | checkpoint | confirm`), the gate id, and the human-readable summary of what to confirm. Never fabricate or duplicate gate ids, and never start next-phase work in the same turn as a pending gate.

- **Trace join paths before writing SQL.** Before writing or running any query that joins tables, trace the join path: state each table's grain, each join's relationship type, and the predicted output grain. Scale the trace to query complexity. {{protocol join_path}} for the full protocol.
- **Validate before closing the gate on any artifact-producing phase.** Any phase that writes, modifies, or regenerates a durable artifact (mart, model, notebook, service, pipeline, dashboard, data model, feature table) must populate a `## Validation` section in `project-specs.md` before calling `gate_request` for the phase gate. Evidence — measured values, test results, artifact paths — not assertions. {{protocol validation}} for the schema and contract, and your own `modes/validation_checklist.md` in your agent directory for the domain-specific checks. Gates on validation-eligible phases must set `validates=<agent_name>` so the runtime can check the schema.
- **DIVERGE is opt-in and user-gated.** When you identify multiple viable but mutually exclusive approaches, you may propose a Time-Travel fork. The user must explicitly confirm before any branches spawn. Never auto-fork. Fork only (a) during planning phases where mutually exclusive approach choices exist, or (b) at the start of an `[AR]` (Autonomous Research) session per `autonomous_research.md` Section H. Never mid-loop once an `[AR]` session is executing. {{protocol diverge}} for the full protocol and [`protocols/autonomous_research.md`](autonomous_research.md) Section H for the AR fan-out composition.
