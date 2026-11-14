#!/usr/bin/env node
'use strict';
// PreToolUse shim (E11.0). For the gate tools only (mcp__*shards*__gate_advance |
// gate_force_close | gate_confirm | gate_suspend) records permission_mode AT CALL TIME, the tool name and
// a timestamp into <session>/hooks.json (gateCalls, newest last, capped; lastGateCall).
// Other tools: no output and no state unless an auto-verify block is active (then may print allow). Never reads the host's session log.
const fs = require('fs');
const host = require('./lib/host');
const common = require('./lib/common');
const { StateStore, atomicWrite } = require('../runtime/state/store');

const MAX_GATE_CALLS = 20;

const MODE_ASK_TOOLS = /__gate_(advance|force_close)$/i;
const ASK_REASON = 'Shards gate confirmation: approve only if you (the human) want this gate advanced/closed.';

// E11.4: returns {decision, output}. `ask` is Claude-only (Codex cannot, compat CX-6).
// EXTENSION POINT (E11.6, optional enforcement; separate joint epic, NOT implemented): a future
// deny/steer decision for gate tools (e.g. a pending gate) would be computed here.
function decide(n) {
  if (n.host === host.HOSTS.CLAUDE && MODE_ASK_TOOLS.test(n.toolName || '')) {
    return { decision: 'ask', output: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: ASK_REASON } }) };
  }
  return { decision: '', output: '' };
}

// E11.12: non-gate tools. Cheap lock-free fast path; no writes unless a block is active.
async function autoVerify(n, root) {
  const key = host.toSessionKey(n.sessionId);
  if (!key) return '';
  const session = { root, sessionKey: key };
  const av = require('../runtime/auto-verify');
  if (!av.isActive(session)) return '';
  const r = await av.check(session, n.toolName, n.toolInput);
  if (!r.approve) return '';
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: `shards auto-verify: ${r.reason}` } });
}

async function handler(n, root) {
  if (!host.isGateTool(n.toolName)) {
    try { return await autoVerify(n, root); } catch (e) { common.logError(root, 'pre-tool-use', e); return ''; }
  }
  const key = host.toSessionKey(n.sessionId);
  if (!key) throw new Error('PreToolUse gate call without session_id');
  const { decision, output } = decide(n);
  const store = new StateStore(root, key);
  await store.withLock(() => {
    fs.mkdirSync(store.sessionDir, { recursive: true });
    const hooks = store.read('hooks');
    const rec = { tool: n.toolName, permission_mode: n.permissionMode || null, ts: new Date().toISOString(), host: n.host, decision };
    if (n.toolUseId) rec.tool_use_id = n.toolUseId;
    if (n.agentId) rec.agent_id = n.agentId;
    const gateCalls = (Array.isArray(hooks.gateCalls) ? hooks.gateCalls : []).concat(rec).slice(-MAX_GATE_CALLS);
    atomicWrite(store.file('hooks'), JSON.stringify({ ...hooks, gateCalls, lastGateCall: rec }, null, 2));
  });
  return output;
}

if (require.main === module) common.run('pre-tool-use', handler, host);
module.exports = { handler, decide };
