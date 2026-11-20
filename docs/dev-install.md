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
- `skills/<agent>/SKILL.md` per agent, `agents/<agent>.md`, plus utility skills emitted from `build/skills.js`: `skills/agents/` (the `/shards:agents` listing), `brainstorm/`, `review-pr/`, `notebook-walkthrough/`, `resume/`, `end/` and (claude only) `shards-conventions/`. The connect, sync, doctor and publish-knowledge skills are deferred to Stage 6.
- `.shards-dev`: marker. `uninstall-dev` only deletes directories that have it.

Codex (`adapters/codex/`, or `adapters/codex-marketplace/plugins/shards/` with `--marketplace`); layout checked on Codex 0.169.0:
- `.codex-plugin/plugin.json`, `hooks/hooks.json` (absolute repo hook paths, each with `--host codex`), `.codex/config.toml` (agents guidance plus a `[mcp_servers.shards]` block pointing at the repo runtime), `.codex/shards-<agent>.config.toml` (profiles), `.codex/agents/<agent>.toml`, `skills/`, `.shards-dev`.

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

## 4. Codex (checked on Codex 0.169.0, 2026-11-19)

```bash
node cli/shards.js build --target codex --dev --marketplace          # -> adapters/codex-marketplace
codex plugin marketplace add "$PWD/adapters/codex-marketplace"
codex plugin add shards@shards-local                                  # skills + hooks
node cli/shards.js install --codex --plugin-dir "$PWD/adapters/codex-marketplace/plugins/shards"
```

The last step writes the `[mcp_servers.shards]` block into `$CODEX_HOME/config.toml` (default `~/.codex`) pointing at this repo's `runtime/server.js` (a dev build has the `.shards-dev` marker, so the installer uses the repo runtime) and copies the profiles. Then trust the hooks (Codex skips untrusted hooks silently; see `docs/release.md`, Codex install step 3). Use a scratch `CODEX_HOME` to keep experiments out of your real config.

- MCP tool names: `mcp__shards__<tool>`. Skills: `$shards:<id>`. Profiles: `codex -p shards-<agent>`.
- Codex ignores `permissionDecision: "ask"` (compat CX-6); the gate tools prompt through `approval_mode = "prompt"` instead.
- Codex copies the plugin into its cache, but the dev hook commands use absolute repo paths, so hook and runtime edits still apply on the next session. Re-run `codex plugin add` after changes to `core/` (skills).

## 5. Uninstall

```bash
node cli/shards.js uninstall-dev                    # both targets
node cli/shards.js uninstall-dev --target claude    # or codex
```

Removes `adapters/<target>` only if it has the `.shards-dev` marker (`--out adapters/codex-marketplace/plugins/shards` for a marketplace dev build). Claude: nothing to undo beyond not passing `--plugin-dir`. Codex: `codex plugin remove shards@shards-local` and `node cli/shards.js install --codex --remove`.

## 6. Troubleshooting

- Rebuilding does not delete stale files. Run `uninstall-dev` first, then build again.
- Hook errors are appended to `<project>/.shards/state/hook-errors.log`. The hooks always exit 0, so check this log when a hook seems silent.
- MCP server not appearing: confirm the tool prefix in section 3 and that `node` is on PATH.

## 7. Codex gate approval

The `[mcp_servers.shards]` block sets `default_tools_approval_mode = "approve"` and `approval_mode = "prompt"` for `gate_advance`, `gate_force_close`, `gate_confirm` and `gate_suspend`. Without the server default every Shards tool needs approval (they carry no `readOnlyHint`) and all fail under `codex exec`; the gate tools stay on `prompt`, the Codex substitute for the Claude `ask` hook decision. Verified on Codex 0.169.0 under `codex exec` (compat CX-1); the interactive prompt was not seen.
