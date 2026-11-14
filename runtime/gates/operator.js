'use strict';
// Operator actions on gates (E11.13): force-close + audit/violation logs.
const fs = require('fs');
const path = require('path');
const { StateStore } = require('../state/store');
const machine = require('./machine');
const { lockedAppend } = require('../state/append');

const stateDir = (root) => path.join(root, '.shards', 'state');
const operatorLogFile = (root) => path.join(stateDir(root), 'gate-operator.log.jsonl');
const violationsFile = (root) => path.join(stateDir(root), 'gate-violations.jsonl');

function sessionKeys(root) {
  try { return fs.readdirSync(path.join(stateDir(root), 'sessions'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch (_) { return []; }
}

async function logViolation(root, rec) {
  await lockedAppend(violationsFile(root), JSON.stringify({ ts: new Date().toISOString(), ...rec }));
}

function readJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
  } catch (_) { return []; }
}

// sessionKey null = all sessions; gateId 'all' = every open (pending/suspended/changes_requested) gate.
async function forceClose(root, sessionKey, gateId, { actor, via, reason, state } = {}) {
  const keys = sessionKey ? [sessionKey] : sessionKeys(root);
  const closed = [];
  for (const key of keys) {
    const st = state && sessionKey ? state : new StateStore(root, key);
    const session = { root, sessionKey: key, state: st };
    const targets = machine.listGates(session)
      .filter((g) => machine.FORCE_CLOSABLE.includes(g.status) && (gateId === 'all' || g.id === gateId));
    if (!targets.length) continue;
    for (const g of targets) {
      await machine.forceCloseGate(session, g.id, { actor, via, reason });
      closed.push({ session: key, gate: g.id, from: g.status });
      await lockedAppend(operatorLogFile(root), JSON.stringify({
        ts: new Date().toISOString(), action: 'force-close', session: key, gate: g.id, actor: actor || null, via: via || null, reason: reason || null,
      }));
    }
    try { await require('../auto-verify').end(session, 'force_close'); } catch (_) { /* best-effort */ }
  }
  if (closed.length) {
    try { await require('../git').replayPending(root, { force: true }); } catch (_) { /* best-effort */ }
  }
  return closed;
}

module.exports = { forceClose, logViolation, readJsonl, sessionKeys, operatorLogFile, violationsFile };
