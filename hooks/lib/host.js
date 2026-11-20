'use strict';
// Shared host adapter (E11.0). Normalises Claude Code vs Codex hook payloads.
//
// Field names per docs/compat.md (CC-4, CC-5, CX-6). Both hosts send the same
// common fields: session_id, cwd, hook_event_name, permission_mode, tool_name, source,
// prompt. Codex fields were checked against real Codex 0.169.0 payloads; anything marked
// [docs-only] below has not been seen in a real payload.
// This module never reads the host's session-log file; the field that points to it is
// ignored on purpose.

const HOSTS = { CLAUDE: 'claude-code', CODEX: 'codex' };

// Gate tools matched on the MCP tool name (E11.0 / E11.4). The server name differs by
// host and packaging (Claude plugin: mcp__plugin_<plugin>_<server>__gate_advance;
// Codex: mcp__<server>__gate_advance, live-verified as mcp__shards__<tool>), so we match on the pattern.
const GATE_TOOL_RE = /^mcp__.*shards.*__gate_(advance|force_close|confirm|suspend)$/i;

function isGateTool(toolName) {
  return typeof toolName === 'string' && GATE_TOOL_RE.test(toolName);
}

// Explicit marker from the hook command line: `node <shim>.js --host codex` (the emitted Codex hooks.json and
// MCP args carry it; an argv flag needs no shell syntax, so it works in Codex hook command strings on every OS).
function argvHost(argv = process.argv.slice(2)) {
  if (!Array.isArray(argv)) return undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = a === '--host' ? argv[i + 1] : (typeof a === 'string' && a.startsWith('--host=') ? a.slice(7) : undefined);
    if (v === HOSTS.CODEX || v === HOSTS.CLAUDE) return v;
  }
  return undefined;
}

// Order (live-checked on Codex 0.169.0, docs/compat.md CX-6): explicit marker first, then the payload, then env.
// Env alone is unreliable: Codex sets CLAUDE_PLUGIN_ROOT for plugin hook commands, and a Codex started from a
// Claude Code terminal inherits CLAUDECODE, so env checks for Claude must come after the Codex payload checks.
function detectHost(payload, env = process.env, argv = process.argv.slice(2)) {
  const a = argvHost(argv);
  if (a) return a;
  if (env.SHARDS_HOST === HOSTS.CODEX || env.SHARDS_HOST === HOSTS.CLAUDE) return env.SHARDS_HOST;
  if (payload && payload.host === HOSTS.CODEX) return HOSTS.CODEX;
  if (payload && payload.host === HOSTS.CLAUDE) return HOSTS.CLAUDE;
  // Codex sends turn_id on UserPromptSubmit/PreToolUse (live-verified); Claude Code does not send it.
  if (payload && typeof payload.turn_id === 'string' && payload.turn_id) return HOSTS.CODEX;
  // Codex plugin hooks get PLUGIN_ROOT/PLUGIN_DATA (verified); Claude Code always sets CLAUDE_PROJECT_DIR for hooks.
  if ((env.PLUGIN_ROOT || env.PLUGIN_DATA) && !env.CLAUDE_PROJECT_DIR) return HOSTS.CODEX;
  if (env.CLAUDE_PROJECT_DIR || env.CLAUDE_PLUGIN_ROOT || env.CLAUDECODE) return HOSTS.CLAUDE;
  if (env.CODEX_HOME || env.CODEX_SESSION_ID || env.CODEX_THREAD_ID) return HOSTS.CODEX; // [docs-only]
  return HOSTS.CLAUDE;
}

function str(v) { return typeof v === 'string' && v ? v : undefined; }

// tool_input is always an object for consumers. Codex 0.169 sends apply_patch as {command: "<patch text>"}
// (live-verified, CX-6), which writes.js patchText reads. A bare string (older docs) is kept as {input: <string>}
// instead of being dropped. Other non-objects become {}.
function toolInputOf(v) {
  if (typeof v === 'string') return { input: v };
  return v && typeof v === 'object' ? v : {};
}

function normalize(payload, env = process.env, argv = process.argv.slice(2)) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    host: detectHost(p, env, argv),
    event: str(p.hook_event_name),
    sessionId: str(p.session_id),
    cwd: str(p.cwd),
    prompt: typeof p.prompt === 'string' ? p.prompt : (typeof p.user_prompt === 'string' ? p.user_prompt : undefined),
    source: str(p.source),
    toolName: str(p.tool_name),
    toolUseId: str(p.tool_use_id),
    toolInput: toolInputOf(p.tool_input),
    permissionMode: str(p.permission_mode), // absent on some events; undefined means "host did not report"
    agentId: str(p.agent_id),     // subagent calls only, both hosts (Codex 0.169: on PreToolUse inside a subagent, CX-6)
    agentType: str(p.agent_type),
    turnId: str(p.turn_id),       // Codex only (UserPromptSubmit, PreToolUse; not SessionStart)
    model: str(p.model),
  };
}

// Map a host session id to a StateStore session key ([A-Za-z0-9._-]+, <=128, no "..").
// E2.11 MUST use the same mapping. Valid ids (UUIDs) map to themselves.
function toSessionKey(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  let k = sessionId.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.\./g, '._').slice(0, 128);
  if (k === '.' || k === '') return null;
  return k;
}

// SessionStart stdout in the host's additionalContext format. Claude Code documents
// {hookSpecificOutput:{hookEventName:'SessionStart',additionalContext}}; Codex is assumed
// to accept the same shape [docs-only]. Returns '' when there is nothing to inject.
function sessionStartOutput(host, text) { // eslint-disable-line no-unused-vars
  if (!text || !String(text).trim()) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: String(text) } });
}

module.exports = { HOSTS, GATE_TOOL_RE, isGateTool, argvHost, detectHost, normalize, toSessionKey, sessionStartOutput };
