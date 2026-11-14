# Dev install (shards build --dev)

Local-only developer setup. Output goes to `adapters/` (gitignored). Run all commands from the repo root.

## 1. Build

```bash
node cli/shards.js build --target claude --dev   # -> adapters/claude-code
node cli/shards.js build --target codex --dev    # -> adapters/codex (docs-only, see section 4)
```

Options: `--out <dir>` overrides the output dir, `--strict` fails on warnings, `--core <dir>` overrides `core/`.

## 2. What is emitted

Claude (`adapters/claude-code/`):
- `.claude-plugin/plugin.json`: plugin manifest (name `shards`).
- `.mcp.json`: MCP server `shards` (`node <repo>/runtime/server.js`), env `SHARDS_PROJECT_ROOT=${CLAUDE_PROJECT_DIR}`.
- `hooks/hooks.json`: SessionStart, UserPromptSubmit and PreToolUse shims.
- `skills/<agent>/SKILL.md` per agent, `agents/<agent>.md`, plus `skills/agents/SKILL.md` (the `/shards:agents` listing).
- `.shards-dev`: marker. `uninstall-dev` only deletes directories that have it.

Codex (`adapters/codex/`), docs-only:
- `.codex-plugin/plugin.json`, `.codex/config.toml` (`[mcp_servers.shards]`), `.codex/hooks.json`, `.codex/agents/<agent>.toml`, `skills/`, `.shards-dev`.

Dev mode points hook commands and the MCP server at the repo's own `hooks/` and `runtime/` by absolute path. Edits to `runtime/` or `hooks/` apply on the next session with no rebuild. Rebuild only after changes to `core/` or to macros (`build/MACROS.md`, `build/render.js`, `build/emit.js`), because those are compiled into the generated skills and agents.

## 3. Load and verify (Claude Code)

```bash
claude --plugin-dir /abs/path/to/shards/adapters/claude-code
```

Then, in the session, run `/shards:agents` to list agents.

- MCP tool prefix: `mcp__plugin_shards_shards__<tool>` (verified live on Claude Code 2.1.325).
- Project root: `SHARDS_PROJECT_ROOT=${CLAUDE_PROJECT_DIR}` expands to the project you launched in (verified; server cwd is the project dir).
- State lands in `<project>/.shards/state/`:
  - `handshake/<pid>.json` (SessionStart)
  - `sessions/<id>/prompts.jsonl` and `sessions/<id>/hooks.json` (prompt and gate-call counters)

`--plugin-dir` is not persistent. Stop passing it to unload the plugin; hooks are plugin-scoped, so they go away with it.

## 4. Codex (OPEN, external TODO)

Owner: proflandrigan. Codex is not installed, so nothing here is verified. Plugin loading and the field names in `.codex-plugin/plugin.json` and `.codex/hooks.json` are assumptions. Codex cannot use `permissionDecision: "ask"` (compat CX-6).

`shards build --target codex --dev` prints the manual options. Follow that printed guidance: add the `.codex/config.toml` MCP entry to `~/.codex/config.toml`, copy or symlink `.codex/hooks.json` into the project, and copy or symlink `skills/` into `~/.codex/skills`.

## 5. Uninstall

```bash
node cli/shards.js uninstall-dev                    # both targets
node cli/shards.js uninstall-dev --target claude    # or codex
```

Removes `adapters/<target>` only if it has the `.shards-dev` marker. Claude: nothing to undo beyond not passing `--plugin-dir`. Codex: remove the copied or symlinked files and the `[mcp_servers.shards]` entry you added to `~/.codex/config.toml`.

## 6. Troubleshooting

- Rebuilding does not delete stale files. Run `uninstall-dev` first, then build again.
- Hook errors are appended to `<project>/.shards/state/hook-errors.log`. The hooks always exit 0, so check this log when a hook seems silent.
- MCP server not appearing: confirm the tool prefix in section 3 and that `node` is on PATH.

## 7. Codex gate approval (docs-only, UNVERIFIED)

The generated `.codex/config.toml` also sets `approval_mode = "prompt"` under `[mcp_servers.shards.tools.gate_advance]` and `[mcp_servers.shards.tools.gate_force_close]`. This is the Codex substitute for the Claude `ask` hook decision (Codex PreToolUse cannot `ask`, compat CX-6). The key and value come from Codex docs only (CX-1); Codex is not installed, so this is unverified. Copy those tables along with the `[mcp_servers.shards]` entry.
