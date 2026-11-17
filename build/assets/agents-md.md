## Shards (Codex)

This project uses the Shards agent suite (Syn the orchestrator plus data and ML specialists) through the `shards` MCP server and skills.

- Start an agent with its skill: `$syn`, `$data-analyst`, `$ml-engineer`, and so on. `$agents` lists them. After `activate`, follow the returned persona summary and the agent file it names; every Shards tool response carries an `agent=<id>` header that re-asserts the active persona.
- To start a whole session as one agent, run `codex --profile shards-<agent>` (for example `shards-syn`).
- Gates are workflow checkpoints driven by the `gate_request` and `gate_advance` tools. Only advance a gate after the user has confirmed. Never call `gate_force_close`; the operator runs `shards gates force-close` in a shell.
- Consult subagents are named `<agent>` or `<agent>-<entry>` (for example `researcher-review`). Name the subagent explicitly when delegating.
- Delegation needs `agents.max_depth` of at least 2 (a specialist consulting Syn or a reviewer) and fan-out is bounded by `agents.max_threads`; see the generated `.codex/config.toml` for the recommended values.
- Specialists write artifacts into `analysis/`, `studies/`, `models/`, `services/`, `data_models/`, `dashboards/`, `research/`, `presentations/`, `panels/`, `fixes/`, `brainstorm/`, `projects/` and the `.shards/` state directory. Writes elsewhere are unusual.
