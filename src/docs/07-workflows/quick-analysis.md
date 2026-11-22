# Workflow: Quick Adhoc Analysis

The shortest productive path through Shards. Use it when you have a specific question answerable in a handful of SQL queries.

## Flow

```
/shards:syn  (or go straight to /shards:data-analyst)
  └─ Syn triages -> Data Analyst
     ├─ Phase 1: clarify the question and data (gate)
     ├─ Phase 2: agree the analysis plan (gate)
     ├─ Phase 3: execute queries, validate results (gate, validated)
     └─ Phase 4: Syn final review, close (final gate)
```

Output: `shards/<project>/` with `project-specs.md` and the queries under `shards/<project>/queries/`.

## How the session starts

- **Via Syn.** `/shards:syn` triages the request. Syn switches into the Data Analyst (activation mode `switch`), so the specialist runs in your session and you can talk to it directly.
- **Directly.** `/shards:data-analyst` skips triage when you already know the agent. Run `/shards:agents` to list every agent and its command.

Consults (Data Modeller for schema, Researcher for statistical assumptions, Statistician for claims in the results, BI Engineer for a chart) run as subagents in `consult` mode and return findings to the analyst. They do not take over your session.

## How gates work

Each phase ends with the agent writing its decisions to `project-specs.md`, reading the section back to you and calling the `gate_request` tool. A gate is a tool call, not text in the reply. Only a human confirms it, and the agent cannot. Confirm with the confirm action in your host or Studio, or from a shell with `shards gates confirm <gate-id>`. Confirming an advancing gate commits the agent's output directory to git. Phase 3 carries `validates=data-analyst`, so the gate expects validation evidence. See [Gate pattern](../03-protocols/gate-pattern.md).

The default policy (`gates.policy: phase`) needs a human for phase, final, execute and handoff gates; checkpoint gates passing with evidence are recorded automatically. See [Configuration](../08-bindings/config.md).

## Example session

**You:** `/shards:syn` then "What is the weekly conversion rate by cohort for Q3?"

**Syn:** confirms scope, picks `shards/q3_conversion_by_cohort/`, activates the Data Analyst.

**Data Analyst:**

- Phase 1 gate: lists the tables involved (`users`, `signups`, `conversions`), the grain of each, and flags that `conversions` is one row per event, not per user.
- Phase 2 gate: documents the join path (`signups` to `conversions`, aggregated to weekly grain) per the [join-path protocol](../03-protocols/join-path.md).
- Phase 3 gate: runs the query, records evidence for each check, and notes one cohort looks suspicious.
- Phase 4: Syn reviews through a final-review consult and returns APPROVED, NEEDS REVISION or BLOCKED. See [Reviewer verdicts](../03-protocols/reviewer-verdicts.md).

## When to escalate

- More than a few queries, modelling or feature engineering: `/shards:data-scientist`.
- The real problem is missing tables or a broken pipeline: `/shards:data-engineer`.
- The chart is the deliverable: `/shards:bi-engineer`.

## Resuming

If the chat ends mid-analysis, `/shards:resume` (or `shards sessions resume <prefix>`) picks it up; `/shards:end` closes a session cleanly. See [Sessions](../05-commands/sessions.md).

## See also

- [Data Analyst](../02-agents/data-analyst.md)
- [Join Path Protocol](../03-protocols/join-path.md)
- [Gate Pattern](../03-protocols/gate-pattern.md)
- [Activation modes](../03-protocols/activation-modes.md)
