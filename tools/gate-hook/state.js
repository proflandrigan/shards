// Gate state read/write for .shards/gates/state.json
'use strict';

const fs = require('fs');
const path = require('path');

const GATE_DIR = path.join(process.cwd(), '.shards', 'gates');
const STATE = path.join(GATE_DIR, 'state.json');

// On-disk v2 shape:
//   { version: 2, sessions: { "<sessionId>": { open, id, phase, kind, agent,
//     opened_at, opened_in_turn, transcript_ref } }, history: [ ... ] }
//
// `history` is a SHARED, append-only array of closed/swept/force-closed gates
// from every session. Each session slot holds at most one open gate; a closed
// slot is simply absent (treat missing as closed).
//
// Legacy v1 shape was a single global slot: { open, id, phase, kind, agent,
// opened_at, ..., history }. read() upgrades that to v2 in memory so an in-
// flight gate during the format upgrade still enforces.

// Stable key for a legacy OPEN gate that has no session attribution. We use the
// gate's `agent` field when present (matches handleStop's `agent || sessionId`
// fallback) so the next confirm/sweep can find it, else the literal sentinel.
const LEGACY_KEY = '__legacy__';

function ensureDir() {
  // `recursive: true` is idempotent — safe even if a concurrent writer just
  // created the directory between calls.
  fs.mkdirSync(GATE_DIR, { recursive: true });
}

// Normalize any parsed object into the canonical v2 shape. Backward-compatible:
// a legacy single-slot object (no `version`/`sessions`, has top-level `open`)
// is transparently upgraded in memory. A legacy OPEN gate is placed under the
// gate's `agent` field if present, else LEGACY_KEY, so it still enforces.
function normalize(obj) {
  if (!obj || typeof obj !== 'object') {
    return { version: 2, sessions: {}, history: [] };
  }
  // Already v2 — just backfill missing collections defensively.
  if (obj.version === 2 || obj.sessions) {
    return {
      version: 2,
      sessions: (obj.sessions && typeof obj.sessions === 'object') ? obj.sessions : {},
      history: Array.isArray(obj.history) ? obj.history : [],
    };
  }
  // Legacy single-slot upgrade.
  const history = Array.isArray(obj.history) ? obj.history : [];
  const sessions = {};
  if (obj.open) {
    const key = obj.agent || LEGACY_KEY;
    sessions[key] = {
      open: true,
      id: obj.id,
      phase: typeof obj.phase !== 'undefined' ? obj.phase : null,
      kind: obj.kind || null,
      agent: obj.agent || null,
      opened_at: obj.opened_at || null,
      opened_in_turn: typeof obj.opened_in_turn !== 'undefined' ? obj.opened_in_turn : null,
      transcript_ref: typeof obj.transcript_ref !== 'undefined' ? obj.transcript_ref : null,
    };
  }
  return { version: 2, sessions, history };
}

function read() {
  try {
    return normalize(JSON.parse(fs.readFileSync(STATE, 'utf8')));
  } catch {
    return { version: 2, sessions: {}, history: [] };
  }
}

// Atomic write via tmp + rename. Reference: src/ui/session-index.js.
// Three concurrent readers (UI 2s poll, /chat/end snapshot, gate-hook's own
// pre-tool-use/user-prompt-submit handlers) can hit during a bare writeFileSync
// and observe a partial file → JSON.parse throws → read() silently returns
// default closed state. tmp+rename ensures readers always see the full
// previous or the full next content.
//
// Unique per-PID tmp name avoids same-PID collisions (multiple hook
// invocations chained on the same process aren't expected, but the cost is
// negligible and it matches the session-index.js reference primitive).
function write(s) {
  ensureDir();
  const tmp = `${STATE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, STATE);
  } catch (err) {
    // Best-effort cleanup so a failed write doesn't leak per-writer tmps.
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

// ─── Per-session helpers ──────────────────────────────────────────────────────

// The gate object for one session, or a closed sentinel if that slot is absent.
//
// Backward-compat: a legacy single-slot gate that was upgraded with no agent
// attribution lives under LEGACY_KEY. Since the original v1 slot was global
// (it blocked whichever session was active), we fall back to that LEGACY_KEY
// slot for ANY session that has no slot of its own — so an in-flight gate
// during the format upgrade keeps enforcing regardless of session_id.
function getGate(state, sessionId) {
  const sessions = (state && state.sessions) || {};
  const slot = sessions[sessionId];
  if (slot && slot.open) return slot;
  if (sessionId !== LEGACY_KEY) {
    const legacy = sessions[LEGACY_KEY];
    if (legacy && legacy.open) return legacy;
  }
  return { open: false };
}

// Return a NEW state object with `sessionId`'s slot set to `gate`. Does not
// mutate the input; preserves `history` and all other sessions.
function setGate(state, sessionId, gate) {
  const base = normalize(state);
  return {
    version: 2,
    sessions: { ...base.sessions, [sessionId]: gate },
    history: base.history,
  };
}

// Return a NEW state object with `sessionId`'s slot removed (closed). History
// and other sessions preserved.
function clearGate(state, sessionId) {
  const base = normalize(state);
  const sessions = { ...base.sessions };
  delete sessions[sessionId];
  return { version: 2, sessions, history: base.history };
}

// True if any session slot is currently open.
function anyOpen(state) {
  const base = normalize(state);
  return Object.values(base.sessions).some(g => g && g.open);
}

// The most-recently-opened still-open gate across all sessions (by opened_at),
// or null. Used by the UI read side to reduce the per-session map to a single
// flat gate for the legacy browser contract.
function firstOpen(state) {
  const base = normalize(state);
  let best = null;
  let bestT = -Infinity;
  for (const [sessionId, g] of Object.entries(base.sessions)) {
    if (!g || !g.open) continue;
    const t = g.opened_at ? Date.parse(g.opened_at) : NaN;
    const score = Number.isNaN(t) ? -Infinity : t;
    // Prefer the most recent; a gate with no/invalid opened_at still wins over
    // nothing (best === null) but loses to any dated gate.
    if (best === null || score > bestT) {
      best = { sessionId, ...g };
      bestT = score;
    }
  }
  return best;
}

module.exports = {
  read, write, STATE, GATE_DIR,
  getGate, setGate, clearGate, anyOpen, firstOpen,
  LEGACY_KEY,
};
