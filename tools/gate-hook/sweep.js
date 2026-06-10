// Stale-gate sweep + operator force-close escape hatch.
// Extracted from gate-hook.js for direct unit testing.
'use strict';

const state = require('./state.js');
const { appendViolation, appendHistory } = require('./log.js');

// Operator escape hatch — Bash invocations of `shards-gates force-close`
// (the npm bin or a direct `node tools/shards-gates.js force-close`) are
// allowed even while a gate is open, so a stuck-gate deadlock can be
// unstuck from inside a Claude session. Chain/pipe/command-substitution
// operators are rejected so the override can't piggyback another command.
const FORCE_CLOSE_RE = /\bshards-gates(?:\.js)?\s+force-close\b/;
const SHELL_CHAIN_RE = /[|;&`]|\$\(/;

function isForceCloseBash(toolName, toolInput) {
  if (toolName !== 'Bash') return false;
  const cmd = (toolInput && toolInput.command) || '';
  if (!FORCE_CLOSE_RE.test(cmd)) return false;
  if (SHELL_CHAIN_RE.test(cmd)) return false;
  return true;
}

// Stale-gate sweep — gates with missing/invalid opened_at OR older than 24h
// are auto-closed. Symmetric with the session-index abandonment sweep at
// src/ui/session-index.js (also 24h).
const STALE_GATE_MS = 24 * 60 * 60 * 1000;

// Staleness is a property of a SINGLE gate object (one session's slot), not
// the global state. A non-open gate is never stale.
function isStaleGate(gate, now = Date.now()) {
  if (!gate || !gate.open) return false;
  if (!gate.opened_at) return true;
  const t = Date.parse(gate.opened_at);
  if (Number.isNaN(t)) return true;
  return (now - t) > STALE_GATE_MS;
}

function staleReason(gate) {
  if (!gate.opened_at) return 'missing-opened-at';
  if (Number.isNaN(Date.parse(gate.opened_at))) return 'invalid-opened-at';
  return 'older-than-24h';
}

// Append a stale-sweep record to the shared history + audit logs for one gate.
// Returns the history entry pushed (so callers can compose).
function logStaleSweep(gate, sessionId) {
  const closed_at = new Date().toISOString();
  const reason = staleReason(gate);
  const entry = {
    id: gate.id || 'unknown',
    phase: typeof gate.phase !== 'undefined' ? gate.phase : null,
    kind: gate.kind || null,
    opened_at: gate.opened_at || null,
    closed_at,
    confirmed_by: 'stale-sweep',
    closed_reason: reason,
  };
  appendViolation({
    type: 'stale-sweep',
    gate_id: gate.id || 'unknown',
    opened_at: gate.opened_at || null,
    reason,
    session_id: sessionId,
  });
  appendHistory({
    event: 'closed',
    gate_id: gate.id || 'unknown',
    kind: gate.kind || 'phase',
    confirmed_by: 'stale-sweep',
  });
  return entry;
}

// Sweep stale gates across the v2 state, persisting the result.
//
// Always sweeps THIS session's gate if it is stale. Additionally sweeps any
// OTHER session's gate that is genuinely abandoned (older than 24h, or with a
// missing/invalid opened_at) — those carry no risk of clobbering live work.
// Other sessions' FRESH gates are left untouched.
//
// Each swept gate is appended to the shared `history` with
// confirmed_by:'stale-sweep'. Returns the new state object (also written).
function sweepStaleSessions(s, sessionId, now = Date.now()) {
  const cur = normalizeForSweep(s);
  const sessions = { ...cur.sessions };
  const history = [...cur.history];
  let changed = false;

  for (const [sid, gate] of Object.entries(cur.sessions)) {
    if (!gate || !gate.open) continue;
    const stale = isStaleGate(gate, now);
    // This session's gate sweeps whenever stale; other sessions only when
    // genuinely abandoned (which is exactly what isStaleGate detects: missing/
    // invalid opened_at or >24h). So the predicate is the same either way.
    if (!stale) continue;
    history.push(logStaleSweep(gate, sessionId));
    delete sessions[sid];
    changed = true;
  }

  const next = { version: 2, sessions, history };
  if (changed) state.write(next);
  return next;
}

// Local normalize so sweep doesn't depend on state.normalize being exported —
// mirrors the v2 shape and tolerates legacy input (upgraded by state.read()
// before it reaches here, but we stay defensive).
function normalizeForSweep(s) {
  if (s && (s.version === 2 || s.sessions)) {
    return {
      sessions: (s.sessions && typeof s.sessions === 'object') ? s.sessions : {},
      history: Array.isArray(s.history) ? s.history : [],
    };
  }
  // Legacy single slot.
  const sessions = {};
  if (s && s.open) {
    sessions[s.agent || '__legacy__'] = {
      open: true,
      id: s.id,
      phase: typeof s.phase !== 'undefined' ? s.phase : null,
      kind: s.kind || null,
      agent: s.agent || null,
      opened_at: s.opened_at || null,
    };
  }
  return { sessions, history: Array.isArray(s && s.history) ? s.history : [] };
}

module.exports = {
  FORCE_CLOSE_RE,
  SHELL_CHAIN_RE,
  STALE_GATE_MS,
  isForceCloseBash,
  isStaleGate,
  sweepStaleSessions,
};
