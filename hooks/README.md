# Shards hook shims (E11.0)

Node, CommonJS, no dependencies beyond `runtime/state/store.js`. Shims never block the host: internal
errors are appended to `.shards/state/hook-errors.log` and the process exits 0. No shim opens the host's
session-log file (enforced by `test/hooks-no-transcript.test.js`).

| Shim | Event | Writes |
|---|---|---|
| `user-prompt-submit.js` | UserPromptSubmit | `.shards/state/sessions/<key>/prompts.jsonl`, `hooks.json` (`promptSeq`) |
| `pre-tool-use.js` | PreToolUse (all tools; gate tools recorded, others only auto-verify) | `.shards/state/sessions/<key>/hooks.json` (`gateCalls`, `lastGateCall`) |
| `subagent-stop.js` | SubagentStop | `.shards/state/sessions/<key>/leases.json` (releases the exiting worker's lease binding; no output) |
| `session-start.js` | SessionStart `startup\|resume\|compact\|clear` | `.shards/state/handshake/<pid>.json`; stdout re-ground on `compact`/`resume` |

`lib/host.js` normalises Claude Code vs Codex payloads (`docs/compat.md`); `lib/common.js` has stdin, error log, ppid chain.

## State root and session key
Root: `SHARDS_PROJECT_ROOT`, else `CLAUDE_PROJECT_DIR`, else payload `cwd`, else `process.cwd()`.
Session key = `toSessionKey(session_id)` from `lib/host.js` (invalid chars become `_`; UUIDs unchanged).

## Gate-tool match (PreToolUse)
Regex `/^mcp__.*shards.*__gate_(advance|force_close|confirm)$/i`. The hook matcher is now `.*` (all tools) because
auto-verify (E11.12) needs every tool call; the gate-tool-only fast exit stays in code.

- E11.4: `decide()` returns `permissionDecision: "ask"` for `gate_advance` / `gate_force_close` on Claude Code and the
  gateCalls record carries `decision: 'ask'`. On Codex `ask` is unsupported (CX-6): returns '' and records `decision: ''`
  (tier 2 is off on Codex). `gate_confirm` is recorded only.
- E11.12: for non-gate tools, `runtime/auto-verify` `isActive(session)` is checked first (cheap, lock-free, no writes);
  only when a block is active does the shim `await check(...)` and print `permissionDecision: "allow"`. Both hosts. Gate tools are never auto-approved. What it approves is `runtime/lib/auto-allowlist.js`: the read-only tools (`Read`, `Glob`, `Grep`, `WebSearch`), single (non-compound) Bash commands from a hardcoded read-only list, and SELECT-only warehouse CLI calls. Arguments are checked per command: `git branch`/`tag`/`remote` only in listing forms, `file` without `-C`/`-m`, and only `dbt show`/`dbt debug` (other dbt subcommands install packages or write `target/`).
- E11.6 enforcement (`hooks/lib/enforce.js`, runtime state only): for write/exec tools, `deny` while the active frame has a pending gate (unless the caller's `agent_id` is bound to a fan-out lease slice), deny writes outside a bound worker's slice, deny lead writes inside a leased slice; `fanout_claim` calls bind agent_id to a slice. `SHARDS_GATE_ENFORCE=0` disables the deny paths.
- Nothing emitted adds an allow rule for gate tools.

## Codex (live-checked on Codex 0.169.0, compat CX-6 / CX-7)
Codex ignores `ask` on PreToolUse (tier 2 is off there); the gate tools prompt through `approval_mode = "prompt"` in the
`[mcp_servers.shards]` block that `shards install --codex` writes. `agent_id`/`agent_type` are present on PreToolUse inside
subagents, so fan-out binding works (unit-tested, not live). `apply_patch` arrives as `{command: "<patch>"}`.
Host detection (`lib/host.js`): the `--host codex` argv flag on every emitted Codex hook command wins; then `SHARDS_HOST`, then
`turn_id` in the payload, then `PLUGIN_ROOT` without `CLAUDE_PROJECT_DIR`. Env alone is not enough: Codex sets `CLAUDE_PLUGIN_ROOT`
for plugin hooks, and a Codex launched from Claude Code inherits `CLAUDECODE`.

## Config templates
- `claude-code.hooks.json`: plugin `hooks/hooks.json` format, uses `${CLAUDE_PLUGIN_ROOT}`.
- `codex.hooks.json`: `{{SHARDS_HOOKS_DIR}}` placeholder is substituted by the build (`${PLUGIN_ROOT}/hooks` in the release plugin, which Codex expands; the repo `hooks/` dir in dev) and emitted as the plugin's `hooks/hooks.json`, where Codex 0.169 discovers it. Every command ends in `--host codex`. SessionStart, UserPromptSubmit, PreToolUse and SubagentStop are used. Codex skips the hooks until they are trusted (docs/release.md).

## Platform notes
ppid chain: Linux `/proc/<pid>/stat`; macOS `ps -o ppid= -p`; Windows best-effort `[process.ppid]` only. Needs `node` on PATH (compat WIN-3).
Handshake files older than 24h are pruned on each SessionStart.

## Status
Claude Code: live-checked headless (see test notes in the commit). Codex: live-checked on Codex 0.169.0 (2026-11-19): payload fields, plugin hook discovery, a pending gate denying `apply_patch`. Fixtures: `test/fixtures/codex/`.
