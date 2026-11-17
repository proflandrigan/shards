# Shards Developer Guide

Shards is a suite of data, ML and AI engineering agents for Claude Code, Codex and other Agent Skills hosts. Each agent is a "shard of Syn's brain": a specialist with a persona, a phased workflow and a gate-based documentation pattern. In v2 the content lives in `core/`, `shards build` generates the host packages, and the `shards-mcp` runtime enforces gates as tool calls.

This guide is the reference for agents, protocols, Studio, the CLI, outputs, workflows and bindings. Runtime and design internals are in the repo's `docs/` directory and `docs/adr/`.

## How to read this guide

- **New to Shards?** [Installation](01-getting-started/install.md), then [Your First Session](01-getting-started/first-session.md), then [Core Concepts](01-getting-started/concepts.md).
- **Picking an agent?** [Agent Taxonomy](02-agents/overview.md).
- **Gates, activation, delegation?** [Gate Pattern](03-protocols/gate-pattern.md) and [Activation Modes](03-protocols/activation-modes.md).
- **Moving from v1?** [`shards migrate`](05-commands/migrate.md).
- **Not published yet:** the npm packages and the Claude Code marketplace plugin are pending; the from-source path in [Installation](01-getting-started/install.md) works today. External integrations are not built, see [Integrations status](08-bindings/integrations-status.md).

## Index

### Getting Started

- [Installation](01-getting-started/install.md)
- [Your First Session](01-getting-started/first-session.md)
- [Core Concepts](01-getting-started/concepts.md)

### Agents

- [Agent Taxonomy](02-agents/overview.md)
- [Syn — Orchestrator](02-agents/syn.md)
- [Academic](02-agents/academic.md)
- [AI Engineer](02-agents/ai-engineer.md)
- [Analytics Engineer](02-agents/analytics-engineer.md)
- [Applied ML Scientist](02-agents/applied-ml-scientist.md)
- [Backend Engineer](02-agents/backend-engineer.md)
- [BI Engineer](02-agents/bi-engineer.md)
- [Data Analyst](02-agents/data-analyst.md)
- [Data Engineer](02-agents/data-engineer.md)
- [Data Modeller](02-agents/data-modeller.md)
- [Data Scientist](02-agents/data-scientist.md)
- [Deep Learning Engineer](02-agents/deep-learning-engineer.md)
- [ML Engineer](02-agents/ml-engineer.md)
- [MLOps Engineer](02-agents/mlops-engineer.md)
- [Researcher](02-agents/researcher.md)

### Protocols

- [The Gate Pattern](03-protocols/gate-pattern.md)
- [Activation Modes](03-protocols/activation-modes.md)
- [Delegated Build](03-protocols/delegated-build.md)
- [Knowledge](03-protocols/knowledge.md)
- [Auto-Verify Mode](03-protocols/auto-verify.md)
- [Autonomous Research (AR)](03-protocols/autonomous-research.md)
- [Behavioral Rules](03-protocols/behavioral-rules.md)
- [DIVERGE: Time-Travel Branches](03-protocols/diverge.md)
- [Engineering Guidelines](03-protocols/engineering-guidelines.md)
- [Experiment Versioning](03-protocols/experiment-versioning.md)
- [Incremental Testing](03-protocols/incremental-testing.md)
- [Join-Path Protocol](03-protocols/join-path.md)
- [Reviewer Verdicts](03-protocols/reviewer-verdicts.md)
- [Decompose & Swarm: Parallel Slices for Large Work](03-protocols/swarm.md)
- [Validation Protocol](03-protocols/validation.md)

### Studio

- [Studio](04-studio/overview.md)
- [Chat](04-studio/chat.md)
- [Artifact Panels](04-studio/panels.md)
- [Sessions](04-studio/sessions.md)
- [Workspace](04-studio/workspace.md)

### Commands and CLI

- [Slash Command Reference](05-commands/reference.md)
- [The `shards` CLI](05-commands/cli.md)
- [`shards doctor`](05-commands/doctor.md)
- [Sessions](05-commands/sessions.md)
- [`shards migrate`](05-commands/migrate.md)

### Outputs

- [Output Directory Map](06-outputs/directory-map.md)

### Workflows

- [Workflow: AI Engineering, Eval-First](07-workflows/ai-eval-first.md)
- [Workflow: Deep Study to Production Model](07-workflows/deep-study-to-production.md)
- [Workflow: DIVERGE Exploration](07-workflows/diverge-exploration.md)
- [Workflow: Quick Adhoc Analysis](07-workflows/quick-analysis.md)

### Jobs and Bindings

- [Jobs and bindings](08-bindings/overview.md)
- [Configuration: shards.config.yaml](08-bindings/config.md)
- [Git binding](08-bindings/git-binding.md)
- [Writing a binding](08-bindings/writing-a-binding.md)
- [Integrations status](08-bindings/integrations-status.md)

## Where this content lives

- **Source of truth:** `src/docs/` in the Shards repo; `manifest.json` lists every page and is the canonical table of contents.
- Edit pages there. If you add or remove a page, update `manifest.json` and this index.
