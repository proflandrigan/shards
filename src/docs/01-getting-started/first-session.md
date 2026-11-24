# Your First Session

A v2 session runs inside your host (Claude Code in the verified case) with the Shards plugin loaded and the `shards` MCP server connected. See [Installation](install.md) first.

## Activate an agent

Type a skill command. With the plugin loaded the commands are namespaced:

```
/shards:syn
```

Syn is the orchestrator and router. Describe your problem ("revenue dropped in APAC last week, I want to know why"). Syn triages, picks a specialist, and calls the `activate` tool to switch that specialist in as the active persona. You can skip triage and go direct, for example `/shards:data-analyst` or `/shards:ml-engineer`. `/shards:agents` lists every agent and its modes. See [Activation modes](../03-protocols/activation-modes.md).

The status header on each tool result shows which agent is active.

## Work through phases

The specialist loads one phase at a time with `load_phase`. The tool refuses to serve phase N+1 until phase N's gate is confirmed, so the sequence cannot be skipped. Decisions are written to `project-specs.md` in the agent's output directory (see [directory map](../06-outputs/directory-map.md)). The `record` job in `shards.config.yaml` controls where that record goes; the default writes it into the repo.

## Gates

At the end of a phase the agent calls the `gate_request` tool with a summary and a pointer to what it wrote. Only a human can confirm; the agent cannot confirm a gate on its own. Depending on your host you confirm in one of three ways:

1. A prompt offering Approve or Request changes with a note (interactive Claude Code).
2. A host permission prompt for `gate_advance`.
3. Replying in chat; the agent relays your very next message verbatim with `gate_confirm`, and the runtime accepts it only if it is your real reply.

Approving an advancing gate commits the agent's output paths to your current branch with `Shards-Gate:` trailers. Checkpoint gates between components can be recorded automatically when the agent supplies passing evidence; `gates.policy` in `shards.config.yaml` (`strict`, `phase`, `plan`) controls how much confirmation is needed. See [The Gate Pattern](../03-protocols/gate-pattern.md).

## Reviews and consults

Specialists consult reviewers (the Researcher, the Data Modeller, and so on) as isolated subagents that return a verdict, and Syn gives final sign-off. These do not take over the conversation. In build phases a lead may split work across workers; see [Delegated build](../03-protocols/delegated-build.md).

## Pause, end, resume

- `/shards:end` closes the chat cleanly (it refuses while gates are pending or suspended).
- `/shards:resume` lists earlier sessions and prints the host resume hint, for Claude Code `claude --resume <id>`. Exit the current session first.
- From a shell: `shards sessions list`, `show`, `resume`, `end`. See [sessions](../05-commands/sessions.md).

If a gate is stuck, an operator (you, in a terminal) can use the `shards gates` commands; no agent can.

## Optional: Studio

Run `npx @proflandrigan/shards-studio` in the project to see charts, tables and dashboards the agents emit. It is optional and not yet published. See [Studio](../04-studio/overview.md).
