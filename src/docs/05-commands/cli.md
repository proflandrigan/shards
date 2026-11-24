# The `shards` CLI

`shards` is the command-line tool at `cli/shards.js`. It builds the plugin packages, installs opt-in project config, and gives operators out-of-band access to gates, sessions and diagnostics. Run `shards --help` for the summary.

From source (nothing is published yet), run it as `node cli/shards.js <command>`.

## Commands

| Command | Purpose |
|---|---|
| `build` | Compile `core/` into a target package (`claude`, `codex` or `skills`). |
| `uninstall-dev` | Remove the dev build output made by `build --dev`. |
| `install` | Opt-in project config: skills, permission preset, CLAUDE.md or AGENTS.md conventions, Codex MCP entry and profiles. |
| `gates` | Operator view and control of gates. |
| `sessions` | List, show, resume and end sessions. See [sessions](sessions.md). |
| `doctor` | Check prerequisites, config, MCP, hooks, git state and gate permissions. See [doctor](doctor.md). |
| `migrate` | Migrate a legacy v1 install. See [migrate](migrate.md). |
| `sync` | `shards sync --status [--json] [--all] [--root <dir>]`: list queued and stuck external copies per gate and target. Read-only. |
| `connect` | `shards connect [--host claude\|codex] [--only atlassian,drive,github] [--json] [--root <dir>] [--home <dir>]`: check which MCP servers are registered and print the official `mcp add` commands for missing ones. Read-only. |

## `shards build`

```
shards build --target <claude|codex|skills> [--dev] [--out dir] [--strict] [--default-agent]
             [--core dir] [--no-bundle-deps] [--marketplace]
```

| Option | Effect |
|---|---|
| `--target` | `claude` (plugin), `codex` (Codex package) or `skills` (generic Agent Skills package). |
| `--dev` | Dev build for working from source. Without it, a release build. |
| `--out dir` | Output directory (default `adapters/claude-code`, `adapters/codex` or `adapters/skills`; with `--marketplace`, the marketplace root, see below). |
| `--strict` | Strict build checks. |
| `--default-agent` | Make Syn the plugin's main agent (Claude). Same as `SHARDS_BUILD_DEFAULT_AGENT=1`. |
| `--core dir` | Build from another `core/` directory. |
| `--no-bundle-deps` | Release `claude` build: skip `node_modules`. Release builds are otherwise a self-contained plugin. |
| `--marketplace` | `claude` or `codex` only (other targets are a usage error). Writes the plugin at `<out>/plugins/shards` plus a marketplace manifest. `claude`: `<out>/.claude-plugin/marketplace.json`, default out `adapters/marketplace`; it builds the release plugin, so it cannot be combined with `--dev`. `codex`: `<out>/.agents/plugins/marketplace.json`, default out `adapters/codex-marketplace`; then run `codex plugin marketplace add <out>` and `codex plugin add shards@shards-local`. |

## `shards uninstall-dev`

```
shards uninstall-dev [--target claude|codex|all] [--out dir]
```

Removes the dev build output (`adapters/<target>`) made by `build --dev`.

## `shards install`

```
shards install (--project | --permissions | --claude-md | --agents-md | --codex)
               [--root d] [--preset file] [--remove] [--dry-run] [--force]
               [--codex-home d] [--codex-config file] [--server path | --plugin-dir d]
```

| Option | Effect |
|---|---|
| `--project` | Copies the generated skills into `<root>/.claude/skills` and `<root>/.agents/skills` (content under `.shards/content`). Manifest-tracked. |
| `--permissions` | Merges a narrow permission preset into `<root>/.claude/settings.json`. It never allows gate tools. |
| `--claude-md` | Inserts the Shards tool-call conventions block into `<root>/CLAUDE.md` (marker-delimited). |
| `--agents-md` | Inserts the Codex fragment into `<root>/AGENTS.md` (marker-delimited). |
| `--codex` | Registers the shards MCP server in Codex: a marker-delimited `[mcp_servers.shards]` block in the Codex `config.toml` (gate tools at approval mode `prompt`, the rest `approve`) plus `shards-<agent>` profile files (`shards-<agent>.config.toml`) copied into the Codex home. Rerun after a plugin upgrade (the server path contains the version). Codex skips untrusted hooks silently, so approve them when Codex asks. |
| `--codex-home d` | `--codex` only. Codex home directory (default `$CODEX_HOME`, else `~/.codex`). |
| `--codex-config file` | `--codex` only. Config file to write (default `<codex-home>/config.toml`; for example `<project>/.codex/config.toml`). |
| `--server path` | `--codex` only. Path to the plugin's `runtime/server.js`; it must exist. |
| `--plugin-dir d` | `--codex` only. Installed or built plugin directory to take the runtime from. Default when neither this nor `--server` is given: the newest installed shards plugin in the Codex cache (an error with a fix hint if none). A dev build uses this repo's `runtime/`. |
| `--preset file` | Use another permission preset JSON file instead of the bundled one (for testing). Used by `--permissions`. |
| `--remove` | Exact unmerge: removes only what `install` added. This is the uninstall. |
| `--dry-run` | Prints what would change; writes nothing. |
| `--force` | Allows running inside the shards source repository. |
| `--root d` | Project root. |

One of the five mode flags is required. `--codex-home`, `--codex-config`, `--server` and `--plugin-dir` are usage errors without `--codex`.

## `shards gates`

```
shards gates status       [--session k] [--root d]
shards gates history      [--session k] [--gate id] [--json] [--root d]
shards gates checkpoints  [--session k] [--json] [--root d]
shards gates violations   [--json] [--root d]
shards gates force-close  <gate-id> | --all [--session k] [--reason "text"] [--root d]
shards gates confirm      <gate-id> [--session k] [--changes "note"] [--root d]
```

This is the operator CLI. A human runs it out of band; agents have no tool that confirms or force-closes a gate. `confirm` is the interim operator confirmation, and `force-close` ends a stuck gate as `force_closed` (never confirmed) and is logged to `.shards/state/gate-operator.log.jsonl`. The top-level `--help` lists only `status` and `confirm`; the other subcommands above exist in `cli/commands/gates.js`. See [the gate pattern](../03-protocols/gate-pattern.md).

## `shards sessions`, `shards doctor`, `shards migrate`

Each has its own page: [sessions](sessions.md), [doctor](doctor.md), [migrate](migrate.md).

## Other binaries

| Binary | Package | Status |
|---|---|---|
| `shards-mcp` | `@proflandrigan/shards-mcp` (staged) | The MCP runtime server (`runtime/server.js`). Started by the host, not run by hand. |
| `shards-ui` | root package, `tools/` | Legacy, deprecated shim. Starts nothing: prints that the UI has moved to Studio (`npx @proflandrigan/shards-studio`) and exits (0 for `status`/`stop`/`help`, 1 otherwise). |
| `shards-gates` | root package, `tools/` | Legacy. Alias for the v1 gate diagnostics. Use `shards gates`. |
| `shards-sessions` | root package, `tools/` | Legacy. Same subcommands as `shards sessions`. Use `shards sessions`. |

The legacy bins are retained deliberately and are not removed in the 2.0 next line (see `docs/release.md`).

## Exit codes

Across subcommands, `0` is success, `1` is a failed check or conflict, and `2` is a usage error (unknown option, missing value).
