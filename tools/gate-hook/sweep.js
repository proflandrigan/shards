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

function isStale(s, now = Date.now()) {
  if (!s || !s.open) return false;
  if (!s.opened_at) return true;
  const t = Date.parse(s.opened_at);
  if (Number.isNaN(t)) return true;
  return (now - t) > STALE_GATE_MS;
}

function sweepStale(s, sessionId) {
  const closed_at = new Date().toISOString();
  const reason = !s.opened_at ? 'missing-opened-at' :
                 Number.isNaN(Date.parse(s.opened_at)) ? 'invalid-opened-at' :
                 'older-than-24h';
  const newState = {
    open: false,
    history: [...(s.history || []), {
      id: s.id || 'unknown',
      phase: s.phase || null,
      kind: s.kind || null,
      opened_at: s.opened_at || null,
      closed_at,
      confirmed_by: 'stale-sweep',
      closed_reason: reason,
    }],
  };
  state.write(newState);
  appendViolation({
    type: 'stale-sweep',
    gate_id: s.id || 'unknown',
    opened_at: s.opened_at || null,
    reason,
    session_id: sessionId,
  });
  appendHistory({
    event: 'closed',
    gate_id: s.id || 'unknown',
    kind: s.kind || 'phase',
    confirmed_by: 'stale-sweep',
  });
  return newState;
}

module.exports = {
  FORCE_CLOSE_RE,
  SHELL_CHAIN_RE,
  STALE_GATE_MS,
  isForceCloseBash,
  isStale,
  sweepStale,
};
