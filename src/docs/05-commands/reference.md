# Slash Command Reference

The slash commands (skills) that `shards build` generates for the Claude Code plugin. In v2 every command is a skill, namespaced under the plugin name: `/shards:<skill>`. The list below is the output of `node cli/shards.js build --target claude` (the `skills/` directory). The `shards` CLI is a separate surface; see [cli.md](cli.md).

Nothing is published yet. Today you get these commands from a dev build (`claude --plugin-dir <out>`); see [install](../01-getting-started/install.md).

## Orchestration and utilities

| Command | What it does |
|---|---|
| `/shards:syn` | Syn, the orchestrator. Triages your request, creates the project directory and specs, and hands off to a specialist. Also reaches Syn's modes (PM, panel review, fixer, and so on). |
| `/shards:agents` | Lists the available agents: id, role, modes, description, switch command and consult subagent names. Calls the runtime `list_agents` tool; starts no agent. |
| `/shards:brainstorm` | Syn gathers context, polls the relevant specialists and synthesizes ideas. Writes to `brainstorm/`. |
| `/shards:review-pr` | Syn walks through GitHub PR review comments, proposes a change per comment and applies it on approval. |
| `/shards:notebook-walkthrough` | Interactive cell-by-cell walkthrough of a Jupyter notebook with a Shards agent. |
| `/shards:resume` | Lists ended sessions and shows how to resume one. See [sessions](sessions.md). |
| `/shards:end` | Ends the current session cleanly (writes a resume hint to `project-specs.md` when a specialist is active, then closes the session). See [sessions](sessions.md). |
| `/shards:shards-conventions` | Background skill describing which file writes, Bash commands and gate tool calls are routine in a Shards session. Not a workflow. |

There is no `/shards:shards` command by default. Use `/shards:syn` as the entry point. A build with `--default-agent` (or `SHARDS_BUILD_DEFAULT_AGENT=1`) makes Syn the plugin's main agent, so Syn is active without a command.

## Agent switch skills

Each switchable agent gets a skill that switches the current session to that agent (activation mode `switch`; see [activation modes](../03-protocols/activation-modes.md)).

| Command | Agent | Typical output |
|---|---|---|
| `/shards:data-analyst` | Data Analyst | `analysis/<project>/` |
| `/shards:data-scientist` | Data Scientist | `studies/<project>/` |
| `/shards:data-engineer` | Data Engineer | `models/<project>/` |
| `/shards:data-modeller` | Data Modeller | `data_models/<project>/` |
| `/shards:analytics-engineer` | Analytics Engineer | `data_models/<project>/` |
| `/shards:ml-engineer` | ML Engineer | `models/<project>/` or existing service dir |
| `/shards:ai-engineer` | AI Engineer | `services/<project>/` |
| `/shards:applied-ml-scientist` | Applied ML Scientist | `research/<project>/` |
| `/shards:deep-learning-engineer` | Deep Learning Engineer | `models/<project>/` |
| `/shards:mlops-engineer` | MLOps Engineer | `services/<project>/` |
| `/shards:bi-engineer` | BI Engineer | `dashboards/<project>/` |
| `/shards:backend-engineer` | Backend Engineer | review only, no files |
| `/shards:researcher` | Researcher | review only, no files |
| `/shards:statistician` | Statistician | review only, no files |
| `/shards:academic` | Academic | review only, no files |

Output directories come from each agent's `output_dir` in `core/agents/<id>/agent.yaml`; see the [directory map](../06-outputs/directory-map.md).

## Consult subagents

Alongside the skills, the Claude build generates subagent files in `agents/` (for example `ml-engineer-review`, `analytics-engineer-service`, `data-analyst-worker`). Agents call these for in-phase consultations and sign-off; you do not run them as commands. `/shards:agents` lists the consult subagent names for each agent.

## Commands that no longer exist

These were v1 slash commands and are not generated in v2:

- `/knowledge`: the Knowledge Ledger is gone. See [knowledge](../03-protocols/knowledge.md).
- `/shards-ui` and `/shards-guide`: the v1 web UI was replaced by Studio. See [Studio](../04-studio/overview.md).

## Where each command comes from

Skills are generated from `core/` by `build/skills.js` and `build/emit.js`; there are no hand-written command files to edit. To change a command, change the agent or mode under `core/` and rebuild.
