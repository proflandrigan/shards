# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

The **shards** source repository: a suite of data-focused agents (Syn plus 15 shards) for Claude Code, Codex and generic Agent Skills hosts. This is the v2 layout. v1 (the `tools/install.js` installer that copied `src/agents` into a project's `.claude/`, `::GATE::` text fences, the gate hook and the web UI hooks) is legacy; only the pieces listed under "Legacy" below remain.

Three layers (ADR 0001): `core/` (content) -> `build/` (generated host packages) -> `runtime/` (the `shards-mcp` server that enforces gates and keeps session state). Git is the source of truth for everything agents write (ADR 0005); Shards owns no storage (ADR 0003).

Node.js 18+. Run the suite with `npm test` (`vitest run`; `vitest.config.js` already excludes `.claude/**` worktrees and `adapters/**`).

## Layout

| Path | Purpose |
|------|---------|
| `core/agents/<id>/` | One directory per agent: `AGENT.md` (persona, Phase 0, rules), `agent.yaml` (role, activation modes, consult entries, reviewers, output_dir, jobs), `persona-summary.md`, `modes/` (variants such as review, service, experiment, research, worker), `phases/` (or `phases_quick/` + `phases_deep/`) |
| `core/protocols/*.md` | Shared protocols (behavioral rules, validation, swarm, diverge, delegated build, worker contract, plan drift, auto-verify, ...) |
| `core/templates/` | Output templates with `{{PLACEHOLDER}}` tokens (`project-specs.md`, `project-plan.md`, reports, model card) |
| `core/schema/` | JSON Schemas: `agent`, `binding`, `shards-config`, `gate-request`, `event`, `task-result`, `tasks`, artifact schemas |
| `build/` | Compiler: `compile.js`, `render.js`, `macros.js` (see `build/MACROS.md`), `emit.js`, `package.js`, `skills.js`, `activation-check.js` |
| `runtime/` | `shards-mcp` stdio MCP server: `server.js`, `registry.js`, `tools/` (one file per tool), `gates/`, `session/`, `sessions/`, `fanout/`, `leases/`, `tasks/`, `config/`, `notebook/`, `state/` |
| `hooks/` | Host hook shims (SessionStart, UserPromptSubmit, PreToolUse, SubagentStop) for Claude Code and Codex; `hooks/lib/enforce.js` holds the write-blocking rules |
| `bindings/` | Binding files (`bindings/<name>.md`); git serves all jobs and Jira serves tasks. Format spec in `bindings/README.md` |
| `cli/` | The `shards` CLI (`cli/shards.js`, commands in `cli/commands/`) |
| `packages/studio/` | Studio, the optional browser view (`@proflandrigan/shards-studio`); files-only add-on that reads `.shards/events.jsonl` and the v2 gate state in `.shards/state/` |
| `src/docs/` | The Developer Guide (sections 01-08, `manifest.json`, `README.md`) |
| `docs/` | Runtime and design docs (`runtime.md`, `gates.md`, `activation.md`, `delegation.md`, `sessions.md`, `config.md`, `release.md`, `compat.md`, `knowledge.md`, `studio.md`, `doctor.md`, `dev-install.md`) and `docs/adr/` |
| `test/` | vitest suite |
| `scripts/` | Lints, coupling ratchet, release dry run, MCP smoke client, nightly golden runner |

## Common commands

```bash
npm test                              # vitest
npm run build:all                     # build claude, codex and skills targets
npm run validate:agents               # node scripts/validate-agents.js
npm run lint:models                   # no model names in core/ (ADR 0007)
npm run lint:verdicts
npm run coupling:ratchet              # host-coupling ratchet; keep core/ at 0
npm run mcp                           # node runtime/server.js (stdio MCP server)
npm run release:dry-run               # pack, stage, fresh-install and smoke test; never publishes

node cli/shards.js --help
node cli/shards.js build --target claude --dev     # -> adapters/claude-code (gitignored)
claude --plugin-dir "$PWD/adapters/claude-code"    # load the dev plugin
node cli/shards.js doctor
node cli/shards.js sessions list
node cli/shards.js migrate --dry-run
```

`shards build --dev` points hooks and the MCP server at this repo's `hooks/` and `runtime/`, so edits there apply on the next session. Rebuild only after changing `core/` or the build macros. See `docs/dev-install.md`.

## Architecture notes

**Agent taxonomy** (from `agent.yaml` `role`): orchestrator (`syn`), specialists (`data-analyst`, `data-scientist`, `ml-engineer`, `ai-engineer`, `data-engineer`, `data-modeller`, `analytics-engineer`, `applied-ml-scientist`, `deep-learning-engineer`, `bi-engineer`, `mlops-engineer`), reviewers (`researcher`, `statistician`, `academic`, `backend-engineer`).

**Activation modes** (ADR 0002, 0009; `docs/activation.md`, `docs/delegation.md`): `switch` (the main thread becomes the agent via the `activate` tool; `return` pops back), `consult` (a one-shot read-only subagent returning a verdict), `fan-out` (parallel workers over leased slices), and delegated build (worker subagents execute a task list under a gate). The set an agent supports is in its `agent.yaml`.

**Gates are tool calls** (ADR 0008; `docs/gates.md`): the agent calls `gate_request`; the runtime records it and the PreToolUse hook blocks writes while a gate is pending. Confirmation uses three tiers (1 elicitation, 2 host permission prompt via `gate_advance`, 3 verbatim chat reply via `gate_confirm`), and `gates.policy` in `shards.config.yaml` (`strict`, `phase` or `plan`) controls how often gates ask; no text fences are involved. ADR 0011: a pending gate blocks subagents without a fan-out lease. Tools: `gate_request`, `gate_advance`, `gate_confirm`, `gate_force_close`, `gate_suspend`, `gate_resume`, `gates_open`, `load_phase`. Each phase file is served only after the previous gate is confirmed.

**Jobs and bindings** (`docs/config.md`): `shards.config.yaml` maps six jobs (record, tasks, knowledge, review, artifacts, presentation) to bindings. The agent calls the host's own MCP tools; the runtime never holds third-party credentials (ADR 0004). Jira issue intake and epic orchestration use the host’s Atlassian connection.

**Sessions** (`docs/sessions.md`): state under `.shards/state/`; `shards sessions list|show|resume|end` and the `resume`/`end` skills.

**Build targets** (`docs/release.md`): `claude` (plugin), `codex` (plugin + `shards install --codex`; verified on Codex 0.169.0, see `docs/compat.md`), `skills` (generic Agent Skills); `shards install --project/--permissions/--claude-md/--agents-md` for project-level opt-ins.

**No model names in `core/`** (ADR 0007): use tiers; `npm run lint:models` enforces it. **No host-specific coupling in `core/`** (ratchet at 0).

## Editing workflow

- **Agent persona, Phase 0, rules:** `core/agents/<id>/AGENT.md`. Metadata and activation: `agent.yaml` (validated by `core/schema/agent.schema.json` and `scripts/validate-agents.js`).
- **Phases:** `core/agents/<id>/phases*/phase-<N>.md`. Update `index.md` and the "When this gate is confirmed" pointers if you add or remove a phase. Gate ids follow `<agent>-phase-<N>`.
- **Shared protocols:** `core/protocols/`. **Templates:** `core/templates/`.
- **Runtime behaviour:** `runtime/` plus its doc in `docs/`. If `runtime/` gains a `require` that reaches outside it, update `scripts/stage-runtime-package.js`, `MCP_FILES` in `build/package.js` and the allowed/required lists (`KINDS`) in `scripts/pack-check.js` (see `docs/release.md`).
- **Developer Guide:** edit pages under `src/docs/`; if you add or remove a page, update `src/docs/manifest.json` (every page must be listed there and linked).
- Never hand-edit generated output (`adapters/`, `plugins/`).
- Before finishing: `npm test`, `npm run build:all`, `npm run coupling:ratchet`, `npm run lint:models`, `npm run lint:verdicts`.

## Legacy (v1) remnants

Kept for migration and compatibility; do not extend: `tools/install.js` (v1 installer), `tools/shards-ui.js`, `tools/shards-gates.js`, `tools/shards-sessions.js` (legacy bins), `src/commands/` (v1 slash commands) and `docs/history/`. `shards migrate` is the supported path off v1 (`cli/commands/migrate.js`, `migrate-legacy.js`, `tools/legacy-layout.js`).
