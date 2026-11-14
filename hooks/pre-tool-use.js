#!/usr/bin/env node
'use strict';
// PreToolUse shim (E11.0). For the gate tools only (mcp__*shards*__gate_advance |
// gate_force_close | gate_confirm) records permission_mode AT CALL TIME, the tool name and
// a timestamp into <session>/hooks.json (gateCalls, newest last, capped; lastGateCall).
// Every other tool: no output, no state. Never reads the host's session log.
const fs = require('fs');
const host = require('./lib/host');
const common = require('./lib/common');
const { StateStore, atomicWrite } = require('../runtime/state/store');

const MAX_GATE_CALLS = 20;

// ---- EXTENSION POINT (E11.4, not implemented here) -------------------------------------
// E11.4 will return {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'ask',
// permissionDecisionReason}} for gate_advance / gate_force_close on Claude Code, so allow
// rules and "don't ask again" cannot skip the prompt. Codex does not support `ask`
// (docs/compat.md CX-6): use deny/PermissionRequest there. Return a JSON string or ''.
function decide(n) { // eslint-disable-line no-unused-vars
  return '';
}
// -----------------------------------------------------------------------------------------

async function handler(n, root) {
  if (!host.isGateTool(n.toolName)) return '';
  const key = host.toSessionKey(n.sessionId);
  if (!key) throw new Error('PreToolUse gate call without session_id');
  const store = new StateStore(root, key);
  await store.withLock(() => {
    fs.mkdirSync(store.sessionDir, { recursive: true });
    const hooks = store.read('hooks');
    const rec = { tool: n.toolName, permission_mode: n.permissionMode || null, ts: new Date().toISOString(), host: n.host };
    if (n.toolUseId) rec.tool_use_id = n.toolUseId;
    if (n.agentId) rec.agent_id = n.agentId;
    const gateCalls = (Array.isArray(hooks.gateCalls) ? hooks.gateCalls : []).concat(rec).slice(-MAX_GATE_CALLS);
    atomicWrite(store.file('hooks'), JSON.stringify({ ...hooks, gateCalls, lastGateCall: rec }, null, 2));
  });
  return decide(n);
}

if (require.main === module) common.run('pre-tool-use', handler, host);
module.exports = { handler, decide };
