# `shards doctor`

Developer notes for `cli/commands/doctor.js` (E2.12). Describes what the command checks and does today. Planned items are marked `TODO(E<n>)` or `TODO(owner: proflandrigan)`.

## 1. Usage

```
shards doctor [--root <dir>] [--json] [--fix]
```

| Option | Effect |
|--------|--------|
| `--root <dir>` | Project root. Default: `SHARDS_PROJECT_ROOT`, else the current directory. |
| `--json` | Machine output (section 5). |
| `--fix` | Runs the two fixes in section 4, then the checks. Nothing else is changed. |
| `--help`, `-h` | Prints usage, exit 0. |

Unknown options and `--root` without a value are usage errors (exit 2). The command reads files and runs `node --check` on hook shims, `python3 --version`, `git --version`, `git check-ignore`, and the runtime git helpers. It never runs `claude` or `codex`.

## 2. Status and exit codes

| Status | Meaning | Affects exit code |
|--------|---------|-------------------|
| `PASS` | Requirement met, or optional thing absent and therefore fine. | no |
| `WARN` | Degraded or unset. Something will not work (for example, gate commits are skipped) but nothing is broken. | no |
| `FAIL` | Blocking, or a safety rule is violated. | yes |

| Exit | Meaning |
|------|---------|
| `0` | No `FAIL`. Also `--help`. |
| `1` | At least one `FAIL`. An uncaught error also exits 1. |
| `2` | Usage error (bad option, missing `--root` value). |

Human output is one line per check, `STATUS  id  message`, with a `fix:` line under each non-PASS check that has a fix. It ends with `N pass, N warn, N fail`. When `--fix` is not given and `git.ignore` or `git.pending` is not PASS, it prints a hint that `--fix` can help.

## 3. Checks

Checks run in this order. `git.head` and `git.merge` appear only when the project is a git repository.

| id | PASS | WARN | FAIL |
|----|------|------|------|
| `node` | Node is 18 or newer. | n/a | Node older than 18. |
| `python3` | `python3 --version` runs. | not found (needed for notebook modes only). | n/a |
| `git` | `git --version` runs. | n/a | git not found. |
| `config` | No `shards.config.yaml` (defaults used), or the file validates against the runtime config schema. | n/a | YAML does not parse, or schema errors. Doctor never creates the file. |
| `mcp.claude` | A dev plugin is built (`adapters/claude-code/.claude-plugin/plugin.json` and `.shards-dev` marker), or a `shards` MCP entry is found in `.mcp.json`, `.claude/settings.json`, `.claude/settings.local.json`, `~/.claude.json` or `~/.claude/settings.json`. | none registered. | n/a |
| `mcp.codex` | `[mcp_servers.shards]` (or `plugin_shards_shards`) in `.codex/config.toml` or `~/.codex/config.toml`. Message says support is UNVERIFIED. | none registered. Never FAIL. | n/a |
| `hooks` | `adapters/claude-code/hooks/hooks.json` exists, parses, and every `.js` command shim exists and passes `node --check`. Looked up in the project root, then this repo. | no `hooks.json`; no node command shims; a shim is missing or has a syntax error. | `hooks.json` is not valid JSON or has no `hooks` key. |
| `git.repo` | Inside a git repository. | not a repo (gate commits skipped). | n/a |
| `git.head` | HEAD is on a branch. | detached HEAD (gate commits skipped). | n/a |
| `git.merge` | No merge, rebase, cherry-pick or revert in progress. | one is in progress (gate commits deferred). | n/a |
| `git.pending` | No pending gate commit records. | records waiting to replay (not stuck). | one or more records are `stuck`. |
| `git.ignore` | `.shards/` is ignored (`git check-ignore`). Not a repo: PASS. | `.shards/` is not ignored. | n/a |
| `permissions.gate-tools` | No allow rule covers a gate tool (section 6). | n/a | Any rule covers `gate_advance`, `gate_force_close` or `gate_confirm`. |

Notes on what the checks actually read:

- `mcp.claude` and `hooks` look at this repo's `adapters/` as well as the project's, so a dev build of shards itself passes.
- `permissions.gate-tools` reads only `permissions.allow` in JSON settings, and in TOML only sections for the shards MCP server. A settings file that is missing or not valid JSON is skipped silently, not reported.
- `git.pending` treats a failure to read the pending store as "no records".
- The three gate tools are not registered by the runtime today. The permission check is a guard for when they are (E8.3, E11.4). `TODO(E11.4)`.

## 4. `--fix`

`--fix` does exactly two things, then runs all checks against the result:

1. If the project is a git repository and `.gitignore` has no `.shards/` entry (`.shards/`, `/.shards/`, `.shards`, `.shards/*` and similar all count), appends `.shards/` on its own line. Creates `.gitignore` if missing.
2. If any pending gate commit record is `stuck`, calls `replayPending(root, {force: true})`. This is the only production caller that passes `force` (see `docs/gates.md` section 6.6). Its result is printed.

Output lines are `fixed: appended .shards/ to .gitignore`, `fixed: replayed N stuck gate commit(s): ...`, or `fixed: nothing to fix`. A failed replay prints `fixed: replay of stuck gate commits failed: <message>`.

`--fix` does not touch config, MCP registration, hook shims, permissions, or non-stuck pending records. Those need manual fixes using the `fix:` lines.

## 5. `--json`

```json
{
  "checks": [
    { "id": "node", "status": "PASS", "message": "Node v22.x.x" },
    { "id": "git.ignore", "status": "WARN", "message": ".shards/ is not gitignored (runtime state may get committed)", "fix": "add \".shards/\" to .gitignore (or run `shards doctor --fix`)" }
  ],
  "summary": { "pass": 1, "warn": 1, "fail": 0 },
  "fixes": ["appended .shards/ to .gitignore"]
}
```

- `checks[]` items have `id`, `status` (`PASS|WARN|FAIL`), `message`, and `fix` when the check has one (usually non-PASS only).
- `summary` keys are lowercase counts.
- `fixes` is present only when `--fix` was given. It is an array of strings, possibly empty.
- The exit code still follows section 2 in JSON mode.

## 6. Gate-tool permission rule (`permissions.gate-tools`)

**Rule.** FAIL when an allow rule would let a host call `gate_advance`, `gate_force_close` or `gate_confirm` without a prompt.

**Why.** Agents must never be able to confirm their own gates. The design (D8) is that the agent has no confirm tool and a human confirms. The planned host-prompt tier (E11.4) relies on the host asking the user every time a gate tool is called. An allow rule, a "don't ask again" setting, or a rule that allows the whole server would let the agent approve its own gate silently. E7.9 says the optional permission presets must never allow these tools, and E11.4 says `doctor` rejects allow rules that cover them.

**What counts as covering.**

| Rule form | Covers gate tools? |
|-----------|--------------------|
| Server name alone: `mcp__shards`, `mcp__plugin_shards_shards` (with or without `()` or `(*)`) | yes |
| A tool name: `gate_advance`, `gate_force_close`, `gate_confirm`, or `mcp__<server>__gate_*` for those names | yes |
| A glob under `mcp__` that matches `<server>__<gate tool>` for either server name | yes |
| `gate_request` | no. It opens gates and confirms nothing. |
| Non-MCP rules such as `Bash(...)` | no |

**Where it looks.** `permissions.allow` in `<root>/.claude/settings.json`, `<root>/.claude/settings.local.json` and `~/.claude/settings.json`. Codex: in `~/.codex/config.toml` and `<root>/.codex/config.toml`, a shards MCP section that sets a gate tool's `approval_mode` to anything other than `prompt`, or an auto-approve style key (`auto_approve*`, `allow*`, `approved_tools`) that names a gate tool or uses `"*"`.

**Remedy shown.** Remove the rules. Gate tools must always prompt.

**Limits.** The check reads static config only. It does not verify that the PreToolUse shim forces `ask` at call time, that the host reports a supervised permission mode, or that the mode was not switched mid-turn. Those are E11.4 and are not built (`TODO(E11.4)`, `TODO(E11.13)`).

## 7. Not yet done

| Item | Status | Ref |
|------|--------|-----|
| `/shards:doctor` skill, including checking binding tool names through the host's MCP | Not built | `TODO(E2.12)` |
| Warnings for signing required, `commit_disabled`, hook failures and `commit_error` gaps | Not built | `TODO(owner: proflandrigan)` |
| Checking the PreToolUse `ask` shim and supervised-mode check | Not built | `TODO(E11.4)` |
| Checking the `.shards/` gitignore entry in target installs (installer does not add it) | Doctor checks the project; installer still does not | `docs/gates.md` section 8 |
