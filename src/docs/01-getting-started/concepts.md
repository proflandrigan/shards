# Core Concepts

## Shards and agents

A **shard** is a specialist agent with a persona, a phased workflow and an area of expertise: 15 agents plus Syn, the orchestrator. See [Agent Taxonomy](../02-agents/overview.md).

## core/ is the single source

Everything an agent says lives once under `core/`: `core/agents/<id>/` (`AGENT.md`, `agent.yaml`, modes, phase files), `core/protocols/` (shared rules), `core/templates/` and `core/schema/`. `shards build --target claude|codex|skills` compiles it into a host package (skills, subagents, hooks, MCP config). Hosts differ; the content does not.

## The runtime

`shards-mcp` is an MCP server that holds the state a prompt cannot: the agent stack, gates, phase progress, sessions, task manifests and leases. Agents call its tools (`activate`, `return`, `load_phase`, `gate_request`, `sessions_*`, `task_*`, `fanout_*`, `artifact_emit`, and others). A small set of hooks enforces rules the model must not be trusted with, such as blocking writes while a gate is pending.

## Jobs and bindings

Agents do not hardcode where things go. `shards.config.yaml` maps six **jobs** (`record`, `tasks`, `knowledge`, `review`, `artifacts`, `presentation`) to **bindings** (`bindings/<name>.md`). Git is the default for all jobs. Jira is available for tasks; see [integrations status](../08-bindings/integrations-status.md). Shards owns no storage. There is no Knowledge Ledger in v2; reference material lives in your repo or wiki, reached through the `knowledge` job ([Knowledge](../03-protocols/knowledge.md)).

## Activation modes

- **switch**: the agent becomes the active persona (a stack frame). `activate` pushes, `return` pops.
- **consult**: an isolated subagent answers one question and returns a verdict. It never nests.
- **fan-out**: several workers handle slices in parallel and their verdicts are merged.
- **delegated build**: a lead splits build work into tasks owned by workers with path leases and acceptance commands.

See [Activation modes](../03-protocols/activation-modes.md) and [Delegated build](../03-protocols/delegated-build.md).

## Phases

Each specialist runs a numbered workflow, loaded one phase at a time through `load_phase`, which refuses to skip ahead of an unconfirmed gate. Dual-track agents (analytics engineer, data modeller, data engineer) have quick and deep tracks.

## Gates and tiers

A gate is a human checkpoint requested with the `gate_request` tool (not a text fence, ADR 0008). Kinds: `phase`, `final`, `execute`, `handoff` (advancing, committed) and `checkpoint`, `confirm` (non-advancing). The **policy** (`strict`, `phase`, `plan`) sets how many gates need a human. The **confirmation tier** is how the human answers: 1 elicitation prompt, 2 host permission prompt, 3 exact chat reply. Only a human can confirm. See [The Gate Pattern](../03-protocols/gate-pattern.md).

## project-specs.md

Each project's living record: metadata, one section per phase with the decisions made at its gate, reviewer verdicts, and pointers to artifacts. It is the audit trail.

## Sessions

Every chat is recorded in `.shards/sessions/INDEX.json` as active, ended or abandoned (stale after 24 hours). Resume with `/shards:resume` or `shards sessions`. See [sessions](../05-commands/sessions.md).

## Git as the source of truth

Confirming an advancing gate commits only the project's output paths, on your current branch, with `Shards-Gate:` trailers (ADR 0005). Shards never switches branches or rewrites history, and never pushes unless `git.push: true`. A failed commit leaves the gate confirmed and is retried. Without git, records go to `.shards/state`.

## Studio

Studio is an optional browser viewer, files-only: it reads `.shards/events.jsonl` (written by `artifact_emit`) and your output folders. Nothing in the runtime depends on it. See [Studio](../04-studio/overview.md).
