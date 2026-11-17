#!/usr/bin/env node
'use strict';
// SubagentStop shim (S5F). When a subagent exits, release the lease binding it held (runtime/leases
// releaseWorker). No output, never blocks. Codex documents SubagentStop with agent_id (compat CX-6, docs-only),
// but Codex PreToolUse carries no agent_id so nothing is ever bound there and this is a harmless no-op.
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
