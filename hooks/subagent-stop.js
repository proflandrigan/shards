#!/usr/bin/env node
'use strict';
// SubagentStop shim (S5F). When a subagent exits, release the lease binding it held (runtime/leases
// releaseWorker). No output, never blocks. Both hosts send agent_id on SubagentStop and on PreToolUse inside a
// subagent (Codex 0.169 live-verified payloads, compat CX-6), so Codex workers bound by fanout_claim are released too.
const fs = require('fs');
const host = require('./lib/host');
const common = require('./lib/common');

async function handler(n, root) {
  const key = host.toSessionKey(n.sessionId);
  if (!key || !n.agentId) return '';
  const { StateStore } = require('../runtime/state/store');
  const state = new StateStore(root, key);
  if (!fs.existsSync(state.file('leases'))) return '';
  await require('../runtime/leases').releaseWorker({ root, sessionKey: key, state }, n.agentId);
  return '';
}

if (require.main === module) common.run('subagent-stop', handler, host);
module.exports = { handler };
