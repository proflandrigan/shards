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

// E11.4: returns {decision, output}. `ask` is Claude-only: Codex 0.169 ignores permissionDecision "ask" and runs
// the tool (live-verified, compat CX-6); there the gate tools prompt via approval_mode = "prompt" instead.
// E11.6 enforcement for non-gate tools lives in lib/enforce.js (see handler below).
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

// True when this session has a gates.json that cannot be read or parsed (and enforcement is on).
function gateStateUnreadable(n, root, env = process.env) {
  if (String(env.SHARDS_GATE_ENFORCE) === '0') return false;
  try {
    const key = host.toSessionKey(n.sessionId);
    if (!key) return false;
    const st = new StateStore(root, key);
    if (!fs.existsSync(st.file('gates'))) return false;
    st.read('gates');
    return false;
  } catch (_) { return true; }
}

async function handler(n, root) {
  if (!host.isGateTool(n.toolName)) {
    try {
      const e = await require('./lib/enforce').enforce(n, root);
      if (e && e.deny) return require('./lib/enforce').denyOutput(e.deny);
      if (e && e.ask) return require('./lib/enforce').askOutput(e.ask);
    } catch (e) {
      common.logError(root, 'pre-tool-use', e);
      // Fail closed when gate state exists but is unreadable (corrupt gates.json, lock timeout): an unreadable
      // state cannot prove no gate is pending. Unrelated internal errors with no gate state still fail open.
      if (gateStateUnreadable(n, root)) return require('./lib/enforce').denyOutput(`shards: gate state could not be read (${String(e && e.message || e).split('\n')[0]}); blocking this call until it is fixed. Repair or delete the session's gates.json under .shards/state/, or set SHARDS_GATE_ENFORCE=0 to bypass.`);
    }
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
