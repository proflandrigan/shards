# Install & Setup

Shards installs into an existing project directory. You can run it against any Claude Code-enabled folder — a dbt project, a Python repo, a data science sandbox, or an empty directory you'd like to start working in.

## One-line install

```bash
npx github:proflandrigan/shards install
```

Run from the root of the project you want Shards to manage.

## What gets installed

| Destination | What goes there |
|---|---|
| `.claude/agents/` | Agent persona definitions (one `.md` per shard) |
| `.claude/commands/` | Slash command entry points (`/shards`, `/data-analyst`, etc.) |
| `.claude/settings.json` | Claude Code settings + gate enforcement hooks |
| `.claude/.shards-manifest.json` | Install tracker (used by uninstall) |
| `templates/` | Output document templates (`project-specs.md`, report templates, etc.) |
| `.shards/ui/` | Web UI server and browser client |
| `.shards/hooks/` | Gate enforcement hooks (`gate-hook.js`) |
| `.shards/knowledge/` | Persistent workspace-wide Knowledge Ledger |
| `.shards/ui/docs/` | The guide you are reading (UI-served copy) |
| `docs/shards-guide/` | The guide you are reading (plain markdown copy) |

The installer also creates output directories (`analysis/`, `studies/`, `models/`, `services/`, `research/`, `dashboards/`, `brainstorm/`, `data_models/`, `fixes/`, `projects/`) and appends a Shards section to `CLAUDE.md`.

## Requirements

- Node.js v18+
- Claude Code installed and working
- `git` (recommended — used by the UI's source-control features)
- `gh` (optional — required for PR review features)

## Uninstall

```bash
npx github:proflandrigan/shards uninstall
```

Removes everything tracked in `.claude/.shards-manifest.json`, strips the gate hooks from `.claude/settings.json`, and deletes `.shards/hooks/`. The `.shards/knowledge/` directory is **preserved** because it represents durable project memory.

## Updating

Re-run the install command. The installer skips identical files and backs up any modified ones as `<file>.backup` before overwriting. Safe to re-run after every upstream update.

## Launching the UI

```bash
shards-ui
```

Starts a localhost-only server on the first available port in `7842-7845`, writes the auth token to `.shards/ui.port`, and opens your browser. See [UI Overview](../04-ui/overview.md) for what you can do once it's open.

## See also

- [Your First Session](first-session.md)
- [Core Concepts](concepts.md)
- Source: `tools/install.js`
