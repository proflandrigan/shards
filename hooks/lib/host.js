'use strict';
// Shared host adapter (E11.0). Normalises Claude Code vs Codex hook payloads.
//
// Field names per docs/compat.md (CC-4, CC-5, CX-6). Both hosts document the same
// common fields: session_id, cwd, hook_event_name, permission_mode, tool_name, source,
// prompt. Anything marked [docs-only] below has not been seen in a real payload.
// This module never reads the host's session-log file; the field that points to it is
// ignored on purpose.

const HOSTS = { CLAUDE: 'claude-code', CODEX: 'codex' };

// Gate tools matched on the MCP tool name (E11.0 / E11.4). The server name differs by
// host and packaging (Claude plugin: mcp__plugin_<plugin>_<server>__gate_advance;
// Codex: assumed mcp__<server>__gate_advance [docs-only]), so we match on the pattern.
const GATE_TOOL_RE = /^mcp__.*shards.*__gate_(advance|force_close|confirm)$/i;

function isGateTool(toolName) {
  return typeof toolName === 'string' && GATE_TOOL_RE.test(toolName);
}

function detectHost(payload, env = process.env) {
  if (env.SHARDS_HOST === HOSTS.CODEX || env.SHARDS_HOST === HOSTS.CLAUDE) return env.SHARDS_HOST;
  if (payload && payload.host === HOSTS.CODEX) return HOSTS.CODEX;
  if (payload && payload.host === HOSTS.CLAUDE) return HOSTS.CLAUDE;
  if (env.CLAUDE_PROJECT_DIR || env.CLAUDE_PLUGIN_ROOT || env.CLAUDECODE) return HOSTS.CLAUDE;
  if (env.CODEX_HOME || env.CODEX_SESSION_ID || env.CODEX_THREAD_ID) return HOSTS.CODEX; // [docs-only]
  // Codex documents turn_id as a common field; Claude Code does not. [docs-only]
  if (payload && typeof payload.turn_id === 'string') return HOSTS.CODEX;
  return HOSTS.CLAUDE;
}

function str(v) { return typeof v === 'string' && v ? v : undefined; }

function normalize(payload, env = process.env) {
  const p = payload && typeof payload === 'object' ? payload : {};
  return {
    host: detectHost(p, env),
    event: str(p.hook_event_name),
    sessionId: str(p.session_id),
    cwd: str(p.cwd),
    prompt: typeof p.prompt === 'string' ? p.prompt : (typeof p.user_prompt === 'string' ? p.user_prompt : undefined),
    source: str(p.source),
    toolName: str(p.tool_name),
    toolUseId: str(p.tool_use_id),
    permissionMode: str(p.permission_mode), // absent on some events; undefined means "host did not report"
    agentId: str(p.agent_id),     // Claude Code subagents only; absent on Codex PreToolUse (CX-6)
    agentType: str(p.agent_type),
    turnId: str(p.turn_id),       // Codex [docs-only]
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

module.exports = { HOSTS, GATE_TOOL_RE, isGateTool, detectHost, normalize, toSessionKey, sessionStartOutput };
