// Auto-verify state read/write for .shards/auto/state.json
'use strict';

const fs = require('fs');
const path = require('path');

const AUTO_DIR = path.join(process.cwd(), '.shards', 'auto');
const STATE = path.join(AUTO_DIR, 'state.json');

function ensureDir() {
  fs.mkdirSync(AUTO_DIR, { recursive: true });
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return { open: false, history: [] };
  }
}

// Atomic write via tmp + rename. See state.js for rationale. Concurrent UI
// polls and hook invocations would otherwise observe partial JSON during a
// bare writeFileSync and silently fall back to { open: false }.
function write(s) {
  ensureDir();
  const tmp = `${STATE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, STATE);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

// Returns true if the auto-verify block has expired (ttl elapsed or budget
// exhausted). Caller is responsible for closing the state when this returns
// true.
function isExpired(s) {
  if (!s || !s.open) return false;
  if (typeof s.tool_budget_remaining === 'number' && s.tool_budget_remaining <= 0) {
    return true;
  }
  if (s.expires_at) {
    return new Date(s.expires_at).getTime() <= Date.now();
  }
  return false;
}

function close(s, reason) {
  const closed_at = new Date().toISOString();
  const historyEntry = {
    id: s.id,
    agent: s.agent,
    phase: s.phase,
    opened_at: s.opened_at,
    closed_at,
    closed_reason: reason,
    approvals_used: (s.tool_budget_initial || 0) - (s.tool_budget_remaining || 0),
  };
  return {
    open: false,
    history: [...(s.history || []), historyEntry],
  };
}

module.exports = { read, write, isExpired, close, STATE, AUTO_DIR };
