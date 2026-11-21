'use strict';
// External copy queue (E6.8). The runtime never writes externally (D4): the agent writes through the host's
// MCP tools and reports each outcome with copy_report. State: <session>/copies.json = {copies: {"<gate>|<target>": Entry}}.
//   status: queued (failed, retry at the next gate) | done | stuck (MAX_ATTEMPTS failures; stop retrying)
const fs = require('fs');
const path = require('path');
const { StateStore } = require('../state/store');
const machine = require('../gates/machine');

const MAX_ATTEMPTS = 5;
const key = (gateId, target) => `${gateId}|${target}`;
const now = () => new Date().toISOString();
const storeOf = (s) => s.state || new StateStore(s.root, s.sessionKey);

// session: {root, sessionKey, state?}. Records one copy result; returns {entry, result}.
async function report(session, { gate_id: gateId, target, ok, error } = {}) {
  if (!gateId || !target) throw new Error('copy_report requires gate_id and target');
  const gate = machine.getGate(session, gateId);
  if (!gate) throw new Error(`copy_report: unknown gate ${gateId}`);
  if (gate.status !== 'confirmed') throw new Error(`copy_report: gate ${gateId} is ${gate.status}; external copies are only made for confirmed gates`);
  let entry; let result;
  await storeOf(session).update('copies', (cur) => {
    const all = cur.copies = cur.copies || {};
    const k = key(gateId, target);
    const e = all[k] || { gate_id: gateId, target, status: 'queued', attempts: 0, first_reported_at: now() };
    if (ok) {
      e.status = 'done'; e.last_error = null; e.completed_at = now();
      result = 'done';
    } else {
      e.attempts += 1;
      e.last_error = String(error || 'unspecified error').slice(0, 1000);
      if (e.status === 'stuck' || e.attempts >= MAX_ATTEMPTS) { e.status = 'stuck'; result = 'stuck'; } else { e.status = 'queued'; result = 'queued'; }
    }
    e.updated_at = now();
    all[k] = e; entry = e;
    return cur;
  });
  return { entry, result };
}

function list(session) {
  const all = storeOf(session).read('copies').copies || {};
  return Object.values(all).filter((e) => e && e.gate_id);
}
const row = (e) => ({ gate_id: e.gate_id, target: e.target, status: e.status, attempts: e.attempts, last_error: e.last_error || null });
function queued(session) { return list(session).filter((e) => e.status === 'queued').map(row); }
function stuck(session) { return list(session).filter((e) => e.status === 'stuck').map(row); }

// Never throws: used by the state header on every response.
function counts(store) {
  try {
    const all = Object.values(store.read('copies').copies || {});
    return { queued: all.filter((e) => e && e.status === 'queued').length, stuck: all.filter((e) => e && e.status === 'stuck').length };
  } catch (_) { return { queued: 0, stuck: 0 }; }
}

// Queue across every session of a project (for the CLI and doctor). -> [{session, ...row}]
function listAll(root) {
  const dir = path.join(root, '.shards', 'state', 'sessions');
  let keys = [];
  try { keys = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch (_) { return []; }
  const out = [];
  for (const k of keys) {
    let es = [];
    try { es = list({ root, sessionKey: k }); } catch (_) { /* corrupt file: skip */ }
    for (const e of es) out.push({ session: k, ...row(e), updated_at: e.updated_at || null });
  }
  return out;
}

module.exports = { MAX_ATTEMPTS, report, list, queued, stuck, counts, listAll };
