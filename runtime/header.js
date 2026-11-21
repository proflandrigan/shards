'use strict';
// State header: one line prepended to every tool response.
// Format: [shards v12 | agent=data-analyst ph=2 gate=- q=0]   (q = queued external copies, E6.8; ` stuck=N` appended only when N>0)

// Conservative token estimate: ~3.5 chars/token (real tokenizers average ~4 for English,
// so this over-counts and keeps us safely under budget).
function estimateTokens(str) { return Math.ceil(String(str).length / 3.5); }

const HEADER_TOKEN_LIMIT = 60;
const FIELD_MAX = 40;

function clip(v, n) {
  const s = String(v === undefined || v === null || v === '' ? '-' : v).replace(/[\s\]|]+/g, '_');
  return s.length > n ? s.slice(0, n) : s;
}

function render(i, agentMax, gateMax) {
  return `[shards v${i.version} | agent=${clip(i.agent, agentMax)} ph=${clip(i.phase, FIELD_MAX)} gate=${clip(i.gate, gateMax)} q=${clip(i.queued, FIELD_MAX)}${i.stuck > 0 ? ` stuck=${clip(i.stuck, FIELD_MAX)}` : ''}]`;
}

function buildHeader(info = {}) {
  const i = {
    version: Number.isInteger(info.version) ? info.version : 0,
    agent: info.agent, phase: info.phase, gate: info.gate,
    queued: Number.isFinite(info.queued) ? info.queued : 0,
    stuck: Number.isFinite(info.stuck) ? info.stuck : 0,
  };
  let agentMax = FIELD_MAX, gateMax = FIELD_MAX;
  let h = render(i, agentMax, gateMax);
  while (estimateTokens(h) > HEADER_TOKEN_LIMIT && (agentMax > 4 || gateMax > 4)) {
    agentMax = Math.max(4, agentMax - 4);
    gateMax = Math.max(4, gateMax - 4);
    h = render(i, agentMax, gateMax);
  }
  return h;
}

// Derive header info from a StateStore. Never throws (a corrupt file yields defaults).
function headerInfoFromStore(store) {
  const info = { version: 0, agent: '-', phase: '-', gate: '-', queued: 0, stuck: 0 };
  try { info.version = store.getVersion(); } catch (_) { /* ignore */ }
  try {
    const frames = store.read('frames').frames || [];
    const top = frames[frames.length - 1];
    if (top) {
      info.agent = top.agent || '-';
      info.phase = top.phase === undefined ? '-' : top.phase;
      const gates = store.read('gates').gates || {};
      const pending = Object.entries(gates).find(([, g]) => g && g.status === 'pending' && (g.frame === undefined || g.frame === top.id || g.agent === top.agent));
      if (pending) info.gate = pending[1].id || pending[0];
    }
  } catch (_) { /* ignore */ }
  try { const c = require('./copies').counts(store); info.queued = c.queued; info.stuck = c.stuck; } catch (_) { /* ignore */ }
  return info;
}

module.exports = { buildHeader, headerInfoFromStore, estimateTokens, HEADER_TOKEN_LIMIT };
