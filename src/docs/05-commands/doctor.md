# `shards doctor`

Checks that a project can run Shards: prerequisites, config, MCP registration, hooks, git state and gate permissions. It reads files and runs `node --check`, `python3 --version` and `git`; it never runs `claude` or `codex`.

```
shards doctor [--root dir] [--json] [--fix]
```

| Option | Effect |
|---|---|
| `--root dir` | Project root. Default: `SHARDS_PROJECT_ROOT`, else the current directory. |
| `--json` | Machine-readable output. |
| `--fix` | Runs the two fixes below, then the checks. |
| `--help`, `-h` | Prints usage. |

## Status and exit codes

| Status | Meaning |
|---|---|
| `PASS` | Requirement met, or an optional thing is absent. |
| `WARN` | Degraded or unset; nothing is broken but something will not work (for example gate commits are skipped). |
| `FAIL` | Blocking, or a safety rule is violated. |

Exit `0` when there is no `FAIL`, `1` when there is at least one, `2` on a usage error. Human output is one line per check (`STATUS  id  message`), a `fix:` line under non-PASS checks that have one, and a final `N pass, N warn, N fail`.

## Checks

| id | What it checks |
|---|---|
| `node` | Node 18 or newer (FAIL otherwise). |
| `python3` | Available; WARN if missing (needed for notebook modes only). |
| `git` | git is installed (FAIL otherwise). |
| `config` | `shards.config.yaml` is absent (defaults) or validates against the config schema. Doctor never creates it. |
| `mcp.claude` | A dev plugin is built, or a `shards` MCP entry exists in a Claude settings or `.mcp.json` file. WARN if none. |
| `mcp.codex` | A `shards` MCP section in a Codex `config.toml`. Codex support is unverified. Never FAIL. |
| `hooks` | The plugin `hooks.json` parses and each node hook shim exists and passes `node --check`. |
| `git.repo`, `git.head`, `git.merge` | Inside a repo, on a branch, no merge or rebase in progress. WARN otherwise; gate commits are skipped or deferred. |
| `git.pending` | No pending gate commit records. FAIL if any are `stuck`. |
| `git.ignore` | `.shards/` is gitignored. |
| `permissions.gate-tools` | FAIL if any allow rule covers `gate_advance`, `gate_force_close` or `gate_confirm`. |

### The gate-tool permission rule

Agents must never be able to confirm their own gates. An allow rule that covers a gate tool, a "don't ask again" choice, or an allow for the whole `shards` MCP server would let an agent approve silently, so doctor reports it as FAIL. `gate_request` is fine; it opens gates and confirms nothing. Doctor reads `permissions.allow` in project and user Claude settings and shards sections of Codex config. It checks static config only; see [the gate pattern](../03-protocols/gate-pattern.md) for how confirmation works.

## `--fix`

Does exactly two things:

1. Appends `.shards/` to `.gitignore` when the project is a git repo and the entry is missing.
2. Replays pending gate commit records that are `stuck`.

It does not touch config, MCP registration, hooks, permissions or other pending records; use the `fix:` lines for those.

## `--json`

```json
{
  "checks": [
    { "id": "git.ignore", "status": "WARN", "message": ".shards/ is not gitignored (runtime state may get committed)", "fix": "add \".shards/\" to .gitignore (or run `shards doctor --fix`)" }
  ],
  "summary": { "pass": 1, "warn": 1, "fail": 0 },
  "fixes": ["appended .shards/ to .gitignore"]
}
```

`fix` appears on checks that have one. `fixes` appears only with `--fix`. The exit code follows the rules above.

## Not built yet

- A `/shards:doctor` skill (doctor is CLI-only today).
- Checks for signing requirements, disabled gate commits and the host-prompt gate tier.
