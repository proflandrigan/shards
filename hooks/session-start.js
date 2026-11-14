#!/usr/bin/env node
'use strict';
// SessionStart shim (E11.0) for sources startup | resume | compact | clear.
// Writes a handshake file <root>/.shards/state/handshake/<pid>.json for E2.11, and on
// compact/resume prints re-ground context (SessionStart additionalContext) from
// runtime/reground.js. Never reads the host's session log.
const fs = require('fs');
const path = require('path');
const host = require('./lib/host');
const common = require('./lib/common');
const { atomicWrite } = require('../runtime/state/store');
const { regroundHook } = require('../runtime/reground');

const SOURCES = new Set(['startup', 'resume', 'compact', 'clear']);
const STALE_MS = 24 * 3600 * 1000;

function writeHandshake(root, n) {
  const dir = path.join(root, '.shards', 'state', 'handshake');
  fs.mkdirSync(dir, { recursive: true });
  const rec = { session_id: n.sessionId, source: n.source, cwd: n.cwd || root, ts: new Date().toISOString(), pid: process.pid, ppid_chain: common.ppidChain() };
  atomicWrite(path.join(dir, `${process.pid}.json`), JSON.stringify(rec, null, 2));
  // Prune stale handshakes (pid reuse / dead sessions). Best effort.
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try { if (Date.now() - fs.statSync(path.join(dir, f)).mtimeMs > STALE_MS) fs.unlinkSync(path.join(dir, f)); } catch (_) { /* ignore */ }
  }
  return rec;
}

async function handler(n, root) {
  if (!n.sessionId || !SOURCES.has(n.source)) return ''; // e.g. `fork`, or malformed: do nothing
  writeHandshake(root, n);
  if (n.source !== 'compact' && n.source !== 'resume') return '';
  const r = await regroundHook('compact', { root, sessionKey: host.toSessionKey(n.sessionId), source: n.source, host: n.host });
  return host.sessionStartOutput(n.host, r && r.text);
}

if (require.main === module) common.run('session-start', handler, host);
module.exports = { handler, writeHandshake };
