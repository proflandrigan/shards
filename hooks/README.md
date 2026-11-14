# Shards hook shims (E11.0)

Node, CommonJS, no dependencies beyond `runtime/state/store.js`. Shims never block the host: internal
errors are appended to `.shards/state/hook-errors.log` and the process exits 0. No shim opens the host's
session-log file (enforced by `test/hooks-no-transcript.test.js`).

| Shim | Event | Writes |
|---|---|---|
| `user-prompt-submit.js` | UserPromptSubmit | `.shards/state/sessions/<key>/prompts.jsonl`, `hooks.json` (`promptSeq`) |
| `pre-tool-use.js` | PreToolUse (all tools; gate tools recorded, others only auto-verify) | `.shards/state/sessions/<key>/hooks.json` (`gateCalls`, `lastGateCall`) |
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
  only when a block is active does the shim `await check(...)` and print `permissionDecision: "allow"`. Both hosts. Gate tools are never auto-approved.
- E11.6 (optional enforcement, e.g. `deny` when a gate is pending) is a separate joint epic and NOT implemented; extension point is the comment block in `pre-tool-use.js`.
- Nothing emitted adds an allow rule for gate tools.

## Codex gaps (docs-only, CX-6 / CX-1)
No `ask` on PreToolUse (tier-2 host-prompt proof unavailable; per-tool `approval_mode = "prompt"` in `.codex/config.toml` is the
substitute, UNVERIFIED). `agent_id` absent on PreToolUse. Hook payload field names and hooks.json format are assumed to mirror Claude's.

## Config templates
- `claude-code.hooks.json`: plugin `hooks/hooks.json` format, uses `${CLAUDE_PLUGIN_ROOT}`.
- `codex.hooks.json`: `{{SHARDS_HOOKS_DIR}}` placeholder is substituted by the E1.10 build. Only SessionStart, UserPromptSubmit and PreToolUse are used (all supported by Codex per compat CX-6). Format assumed to mirror Claude's [docs-only].

## Platform notes
ppid chain: Linux `/proc/<pid>/stat`; macOS `ps -o ppid= -p`; Windows best-effort `[process.ppid]` only. Needs `node` on PATH (compat WIN-3).
Handshake files older than 24h are pruned on each SessionStart.

## Status
Claude Code: live-checked headless (see test notes in the commit). Codex: OPEN (external), CLI not installed; Codex field names are docs-only.
