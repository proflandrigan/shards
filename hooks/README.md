# Shards hook shims (E11.0)

Node, CommonJS, no dependencies beyond `runtime/state/store.js`. Shims never block the host: internal
errors are appended to `.shards/state/hook-errors.log` and the process exits 0. No shim opens the host's
session-log file (enforced by `test/hooks-no-transcript.test.js`).

| Shim | Event | Writes |
|---|---|---|
| `user-prompt-submit.js` | UserPromptSubmit | `.shards/state/sessions/<key>/prompts.jsonl`, `hooks.json` (`promptSeq`) |
| `pre-tool-use.js` | PreToolUse (gate tools only) | `.shards/state/sessions/<key>/hooks.json` (`gateCalls`, `lastGateCall`) |
| `session-start.js` | SessionStart `startup\|resume\|compact\|clear` | `.shards/state/handshake/<pid>.json`; stdout re-ground on `compact`/`resume` |

`lib/host.js` normalises Claude Code vs Codex payloads (`docs/compat.md`); `lib/common.js` has stdin, error log, ppid chain.

## State root and session key
Root: `SHARDS_PROJECT_ROOT`, else `CLAUDE_PROJECT_DIR`, else payload `cwd`, else `process.cwd()`.
Session key = `toSessionKey(session_id)` from `lib/host.js` (invalid chars become `_`; UUIDs unchanged).

## Gate-tool match (PreToolUse)
Regex `/^mcp__.*shards.*__gate_(advance|force_close|confirm)$/i`; the hook matcher is `mcp__.*shards.*__gate_.*`.
Extension point for E11.4 (`permissionDecision: "ask"`) is `decide()` in `pre-tool-use.js`. Codex cannot use `ask` (compat CX-6).

## Config templates
- `claude-code.hooks.json`: plugin `hooks/hooks.json` format, uses `${CLAUDE_PLUGIN_ROOT}`.
- `codex.hooks.json`: `{{SHARDS_HOOKS_DIR}}` placeholder is substituted by the E1.10 build. Only SessionStart, UserPromptSubmit and PreToolUse are used (all supported by Codex per compat CX-6). Format assumed to mirror Claude's [docs-only].

## Platform notes
ppid chain: Linux `/proc/<pid>/stat`; macOS `ps -o ppid= -p`; Windows best-effort `[process.ppid]` only. Needs `node` on PATH (compat WIN-3).
Handshake files older than 24h are pruned on each SessionStart.

## Status
Claude Code: live-checked headless (see test notes in the commit). Codex: OPEN (external), CLI not installed; Codex field names are docs-only.
