# Installation

Status: **nothing is published yet.** The npm packages (`@proflandrigan/shards`, `@proflandrigan/shards-mcp`) and the Claude Code marketplace plugin are built and tested locally but have not been released (see `docs/release.md` in the repository). The from-source path below is the one that works today.

## Prerequisites

- **Node.js 18 or newer.** Required by the CLI and the MCP runtime.
- **git.** Gate confirmations commit your output paths on the current branch ([Git as source of truth](concepts.md#git-as-the-source-of-truth)). Shards still runs without a repository, but records gates elsewhere.
- **Python 3**, only for notebook modes (Notebook Walkthrough, notebook execution). `shards doctor` warns, never fails, if it is missing.
- A host: Claude Code (the verified path), or Codex / another Agent Skills host (unverified, see below).

## From source (works today)

From a checkout of the shards repository:

```bash
node cli/shards.js build --target claude --dev   # writes adapters/claude-code (gitignored)
claude --plugin-dir /abs/path/to/shards/adapters/claude-code
```

Then run `/shards:agents` in the session to list the agents. A dev build points its hooks and MCP server at the repo's own `hooks/` and `runtime/` by absolute path, so edits there apply on the next session. Rebuild only after changing `core/` or the build macros. `--plugin-dir` is not persistent: stop passing it to unload the plugin.

Runtime state lands in `<project>/.shards/state/`. Hook errors are appended to `<project>/.shards/state/hook-errors.log` (hooks always exit 0, so check this log if one seems silent). Rebuilding does not delete stale files; run `node cli/shards.js uninstall-dev` first if you see leftovers. Full notes: `docs/dev-install.md`.

## Claude Code plugin and marketplace (pending)

`shards build --target claude` (without `--dev`) emits a self-contained plugin, and `--marketplace` also writes a `marketplace.json`. The intended install is `/plugin marketplace add proflandrigan/shards`, but the plugin source is generated and pushed to the `marketplace` branch by the release workflow (`.github/workflows/release.yml`, see the release guide), which has not run yet; until the `marketplace` branch is published that command cannot resolve. Treat it as planned.

To make Syn the main-thread agent, use `claude --agent shards:syn` or set `{"agent":"shards:syn"}` in your project `.claude/settings.json`. The build flag `--default-agent` exists but is transitional.

## Codex (checked on Codex CLI 0.169.0)

`shards build --target codex --marketplace --out <dir>` emits the plugin (skills, `hooks/hooks.json`, consult subagents, profile files, bundled runtime) plus a local marketplace file. Install it in three steps:

```bash
codex plugin marketplace add <dir>
codex plugin add shards@shards-local      # skills and hooks
shards install --codex                    # MCP server entry and profiles in $CODEX_HOME
```

`shards install --codex` writes a marked `[mcp_servers.shards]` block into `$CODEX_HOME/config.toml` that points at the installed plugin's runtime (gate tools ask for approval, the other Shards tools are approved), and copies the `shards-<agent>` profiles. Rerun it after upgrading the plugin; `--remove` undoes it and `--dry-run` previews it. Then trust the plugin's hooks when Codex asks: untrusted hooks are skipped silently, and without them pending gates do not block writes. The release guide (`docs/release.md`) has the details, including the manual trust entry.

Start an agent with `$shards:syn` (or any `$shards:<agent>`), or a whole session with `codex -p shards-syn`. To add the Codex conventions fragment to your project:

```bash
shards install --agents-md [--dry-run] [--remove]
```

## Generic Agent Skills hosts and T3 Code

For hosts that read Agent Skills (for example T3 Code), build the generic package or install skills into a project:

```bash
shards build --target skills              # skills/, content/, plugin.json, mcp.json
shards install --project [--dry-run]      # copy skills into .claude/skills and .agents/skills
```

`--project` writes `.shards/content/` (persona and phase files) and records every file with a sha256 in `.shards/project-install.json`. `--project --remove` deletes exactly those files and keeps any you edited. Existing files it did not write are never overwritten. The MCP server is registered separately, for example `claude mcp add shards -- npx -y @proflandrigan/shards-mcp@next`, which only works once that package is published. The generic package schema is unverified against a live host.

### Gemini CLI

Gemini CLI does not read the generic package's `plugin.json` or `mcp.json` (its extensions use `gemini-extension.json`), and `gemini skills install` copies only `SKILL.md`, which breaks the skills' references to persona and phase files. Use the project route instead (verified with Gemini CLI 0.44.1):

```bash
cd <project>
shards install --project                                   # Gemini reads .agents/skills/
gemini mcp add -s project shards node <abs>/runtime/server.js   # writes .gemini/settings.json
```

`<abs>` is a directory holding the Shards `runtime/` with its dependencies, such as a repo checkout. Gemini disables workspace skills and MCP servers in untrusted folders without saying so, so trust the project folder when it asks. Details: `docs/release.md`, "Gemini CLI".

## Opt-in project config

All `shards install` modes accept `--root <dir>`, `--dry-run` and `--remove` (exact undo of what that run added). Running inside the shards source repo needs `--force`.

| Flag | Effect |
|------|--------|
| `--permissions` | Merges a narrow preset into `.claude/settings.json`: read-only git and tooling allowances, edits to `shards/` and the legacy output directories, force-push denials. Gate tools are never allowed, so they always prompt. Added rules are recorded in `.claude/.shards-permissions.json` so `--remove` can undo them. |
| `--claude-md` | Inserts a marker-delimited block of Shards tool-call conventions into `CLAUDE.md`. |
| `--agents-md` | Same, for `AGENTS.md` (Codex). |
| `--project` | Copies skills into the project (above). |

## Verify

```bash
shards doctor [--root dir] [--json] [--fix]
```

Doctor checks Node, Python, git, `shards.config.yaml`, MCP registration, hooks and gate-tool permissions. Statuses are PASS, WARN, FAIL; exit code 1 means at least one FAIL. `--fix` repairs only `.gitignore` entries and stuck gate commits. See [doctor](../05-commands/doctor.md).

## Uninstall

- Dev build: `node cli/shards.js uninstall-dev [--target claude|codex|all]` (removes `adapters/<target>` only if it carries the `.shards-dev` marker), and stop passing `--plugin-dir`.
- Project config: `shards install --project|--permissions|--claude-md|--agents-md --remove`.
- Claude Code auto mode and the opt-in permission preset: see [Claude Code Auto Mode](claude-code-auto-mode.md).
- Coming from v1: see [migrate](../05-commands/migrate.md).
