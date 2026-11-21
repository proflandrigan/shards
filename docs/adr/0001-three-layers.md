# 0001. Three layers: tool-neutral core, runtime, generated packages

Status: Accepted (2026-11-14)

## Context

Shards is tied to Claude Code and the Shards UI. The audit of `src/` at `8e24069` found 236 `Task` calls, 23 slash commands that tell the model to read `.claude/agents/X.md` and become it, and UI coupling in roughly 34–39 files. The goal is to run the same agents in Claude Code, OpenAI Codex, and agentic IDEs such as T3 Code.

## Decision

Split the project into three layers:

1. **Tool-neutral agent core** (`core/`): agent definitions, phases, modes, protocols and templates, with no host-specific wording.
2. **Runtime** (`runtime/`, the `shards-mcp` server): sessions, phases, gates, auto-verify, fan-out leases, events and notebook support.
3. **Generated packages** per host, built by `shards build --target claude|codex|skills`.

The UI becomes an optional add-on and is no longer part of the core path.

## Consequences

- Agent content is written once and compiled for each host.
- Host-specific behavior is limited to thin generated packages and hook shims.
- Gate and session state lives in one place, the runtime. Agents no longer parse transcripts.
- The Shards UI is no longer required to run agents.
- A build step now sits between the source and what users install, and it must stay in sync with `core/`.
