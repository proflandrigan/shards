# Shards Developer Guide

Shards is a suite of data, ML, and AI engineering agents built on top of Claude Code. Each agent is a "shard of Syn's brain" — a specialist fragment with a distinct persona, a phased workflow, and a gate-based documentation pattern that produces an auditable decision trail for every project.

This guide is the canonical reference for everything Shards does: every agent, every mode, every protocol, every UI feature.

## How to read this guide

- **New to Shards?** Start with [Install & Setup](01-getting-started/install.md), then [Your First Session](01-getting-started/first-session.md), then [Core Concepts](01-getting-started/concepts.md).
- **Picking an agent?** See [Agent Taxonomy](02-agents/overview.md).
- **Curious about a specific feature?** Jump straight to the relevant page from the left sidebar.
- **Reading offline?** The full guide is installed as plain markdown at `docs/shards-guide/` in your project after `npx github:proflandrigan/shards install`. Every page here renders correctly in GitHub and any markdown viewer.

## What's inside

- **[Getting Started](01-getting-started/install.md)** — install, first session, core concepts.
- **[Agents](02-agents/overview.md)** — one page per agent, covering persona, menu options, phases, consultants, and where output lands.
- **[Shared Protocols](03-protocols/gate-pattern.md)** — the gate pattern, DIVERGE parallel exploration, Autonomous Research, the Knowledge Ledger, and more.
- **[Shards UI](04-ui/overview.md)** — every panel, keybinding, and feature in the browser UI.
- **[Commands](05-commands/reference.md)** — every slash command at a glance.
- **[Outputs](06-outputs/directory-map.md)** — where each agent writes files.
- **[Workflows](07-workflows/quick-analysis.md)** — end-to-end examples of real projects.

## Where this content lives

- **Source of truth:** `src/docs/` in the Shards repo.
- **Installed location (UI):** `.shards/ui/docs/` — served by the in-UI guide panel.
- **Installed location (markdown):** `docs/shards-guide/` in your project — for reading in an editor or on GitHub.

Both installed copies are kept in sync by `tools/install.js`. Edits should be made in `src/docs/` and reinstalled.
