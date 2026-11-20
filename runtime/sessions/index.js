'use strict';

const fs = require('fs');
const path = require('path');

const INDEX_VERSION = 1;
const INDEX_FILENAME = 'INDEX.json';
const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;
const PROMPT_PREVIEW_LIMIT = 200;

function indexPath(sessionsDir) {
  return path.join(sessionsDir, INDEX_FILENAME);
}

function readIndex(sessionsDir) {
  const file = indexPath(sessionsDir);
  if (!fs.existsSync(file)) {
    return { version: INDEX_VERSION, sessions: [] };
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Array.isArray(data.sessions)) {
      return { version: INDEX_VERSION, sessions: [] };
    }
    if (data.version !== INDEX_VERSION) {
      data.version = INDEX_VERSION;
    }
    return data;
  } catch {
    return { version: INDEX_VERSION, sessions: [] };
  }
}

function writeIndex(sessionsDir, data) {
  // `recursive: true` is idempotent — safe even if a concurrent writer just
  // created the directory between calls.
  fs.mkdirSync(sessionsDir, { recursive: true });
  const file = indexPath(sessionsDir);
  // Unique tmp name per writer so concurrent processes (server + CLI, or two
  // CLI invocations) can't corrupt each other's in-progress write. The rename
  // is still atomic per writer; last rename wins the final state — that's
  // acceptable for this use case (sub-second mutations, near-zero contention)
  // but a shared tmp path would interleave bytes and produce invalid JSON.
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch (err) {
    // Best-effort cleanup so a failed write doesn't leak per-writer tmps.
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

function findEntry(data, sessionId) {
  return data.sessions.find((s) => s.sessionId === sessionId) || null;
}

function truncatePrompt(text) {
  if (typeof text !== 'string') return null;
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= PROMPT_PREVIEW_LIMIT) return collapsed;
  return collapsed.slice(0, PROMPT_PREVIEW_LIMIT - 1).trimEnd() + '…';
}

function nowIso() {
  return new Date().toISOString();
}

// ─── Mutators ───────────────────────────────────────────────────────────────

function appendSession(sessionsDir, { sessionId, agent, projectName, projectDir, resumedFrom }) {
  if (!sessionId) throw new Error('appendSession: sessionId required');
  const data = readIndex(sessionsDir);
  if (findEntry(data, sessionId)) return data;
  const ts = nowIso();
  data.sessions.push({
    sessionId,
    agent: agent || null,
    projectName: projectName || null,
    projectDir: projectDir || null,
    phase: null,
    status: 'active',
    createdAt: ts,
    lastActivityAt: ts,
    endedAt: null,
    gateOpenAtEnd: null,
    lastUserPrompt: null,
    messageCount: 0,
    resumedFrom: resumedFrom || null,
  });
  writeIndex(sessionsDir, data);
  return data;
}

function updateActivity(sessionsDir, sessionId, { lastUserPrompt, projectName, projectDir, messageCount } = {}) {
  if (!sessionId) return null;
  const data = readIndex(sessionsDir);
  const entry = findEntry(data, sessionId);
  if (!entry) return null;
  entry.lastActivityAt = nowIso();
  if (lastUserPrompt !== undefined) entry.lastUserPrompt = truncatePrompt(lastUserPrompt);
  if (projectName !== undefined && projectName) entry.projectName = projectName;
  if (projectDir !== undefined && projectDir) entry.projectDir = projectDir;
  if (typeof messageCount === 'number') entry.messageCount = messageCount;
  writeIndex(sessionsDir, data);
  return entry;
}

// The runtime is actively serving this session: bump its activity and, if a startup sweep
// marked it `abandoned` while it was still live (another process started after >24h of index
// silence), flip it back to `active` and drop the `gateOpenAtEnd` snapshot that sweep took (it
// only describes sessions that went away). `ended` rows are left untouched: ending is explicit.
function touchLiveSession(sessionsDir, sessionId) {
  if (!sessionId) return null;
  const data = readIndex(sessionsDir);
  const entry = findEntry(data, sessionId);
  if (!entry || entry.status === 'ended') return entry || null;
  if (entry.status === 'abandoned') {
    entry.status = 'active';
    entry.gateOpenAtEnd = null;
  }
  entry.lastActivityAt = nowIso();
  writeIndex(sessionsDir, data);
  return entry;
}

function updatePhase(sessionsDir, sessionId, phase) {
  if (!sessionId || typeof phase !== 'number') return null;
  const data = readIndex(sessionsDir);
  const entry = findEntry(data, sessionId);
  if (!entry) return null;
  entry.phase = phase;
  entry.lastActivityAt = nowIso();
  writeIndex(sessionsDir, data);
  return entry;
}

function markEnded(sessionsDir, sessionId, { gateOpenAtEnd, reason } = {}) {
  if (!sessionId) return null;
  const data = readIndex(sessionsDir);
  const entry = findEntry(data, sessionId);
  if (!entry) return null;
  entry.status = 'ended';
  entry.endedAt = nowIso();
  if (gateOpenAtEnd !== undefined) entry.gateOpenAtEnd = gateOpenAtEnd;
  if (reason) entry.endReason = reason;
  writeIndex(sessionsDir, data);
  return entry;
}

const OPEN_GATE_STATUSES = new Set(['pending', 'suspended']);

function gateTime(g) {
  const t = Date.parse((g && (g.requested_at || g.updated_at)) || '');
  return Number.isFinite(t) ? t : 0;
}

// Most recently requested open (pending or suspended) gate in one session's runtime state, or null.
// Reads <root>/.shards/state/sessions/<key>/gates.json through StateStore (written by
// runtime/gates/machine.js). Missing, invalid-key or corrupt state -> null.
function openGateInSession(root, sessionKey) {
  try {
    const { StateStore } = require('../state/store');
    const store = new StateStore(root, sessionKey); // throws on an invalid key
    if (!fs.existsSync(store.file('gates'))) return null;
    const gates = Object.values(store.read('gates').gates || {})
      .filter((g) => g && typeof g.id === 'string' && OPEN_GATE_STATUSES.has(g.status));
    if (!gates.length) return null;
    gates.sort((a, b) => gateTime(b) - gateTime(a));
    return gates[0];
  } catch {
    return null;
  }
}

// Session-index ids are host session ids; runtime state uses the StateStore key derived from
// them (same mapping the hooks and the correlator use; UUIDs map to themselves).
function toStateKey(sessionId) {
  try { return require('../../hooks/lib/host').toSessionKey(sessionId); } catch { return sessionId; }
}

// Id of the gate holding a session open, for `gateOpenAtEnd`. Never throws; null when none.
//
// `shardsDir` is the project's `.shards` directory (the project root is its parent).
// v2 gate state is per session in runtime state (`.shards/state/sessions/<key>/gates.json`,
// `{gates: {<id>: {status, frame, agent, project, requested_at, ...}}}`); a gate is open while
// `pending` or `suspended`.
//   - With `sessionId`: the most recently requested open gate of that session only (another
//     session's gate is never attributed to it).
//   - Without: the most recently requested open gate across all sessions.
// Legacy fallback: only when the project has no v2 session state at all (an un-migrated v1
// project; nothing in v2 writes the v1 file, and `shards migrate` imports and archives it) the
// v1 single-slot `.shards/gates/state.json` ({open, id}) is read. It has no session scoping.
function readGateOpenId(shardsDir, sessionId) {
  if (!shardsDir || typeof shardsDir !== 'string') return null;
  try {
    const root = path.dirname(shardsDir);
    const sessionsRoot = path.join(shardsDir, 'state', 'sessions');
    let haveV2 = false;
    try { haveV2 = fs.statSync(sessionsRoot).isDirectory(); } catch { haveV2 = false; }
    if (haveV2 && path.basename(shardsDir) === '.shards') {
      if (sessionId) {
        const key = toStateKey(sessionId);
        const g = key ? openGateInSession(root, key) : null;
        return g ? g.id : null;
      }
      let best = null;
      for (const key of fs.readdirSync(sessionsRoot)) {
        const g = openGateInSession(root, key);
        if (g && (!best || gateTime(g) > gateTime(best))) best = g;
      }
      return best ? best.id : null;
    }
    if (haveV2) return null;
    const raw = fs.readFileSync(path.join(shardsDir, 'gates', 'state.json'), 'utf8');
    const state = JSON.parse(raw);
    if (state && state.open) return state.id || null;
    return null;
  } catch {
    return null;
  }
}

// Reclassify `active` sessions idle past the abandonment window as `abandoned`. We can't know
// whether the process actually died, but 24h of inactivity is a strong enough signal to show
// it differently from a healthy live session (`shards sessions list`, Studio).
//
// On `gateOpenAtEnd`: at sweep time we don't know what the gate state was *when the session
// actually went idle*. We snapshot that session's currently open gate (readGateOpenId with the
// entry's session id) anyway, because:
//   (a) showing the gate still holding the session open is more informative than leaving the
//       field null and indistinguishable from a clean exit;
//   (b) an abandoned session's runtime state does not move on by itself, so its open gate is
//       very likely the one it was left at;
//   (c) if nothing is open we leave the field null rather than fabricating an 'unknown'
//       sentinel that downstream code would need to special-case.
// Pass `shardsDir` (the project's `.shards` dir) to enable the snapshot; omit it (e.g. in unit
// tests, or Studio's startup sweep) to skip the read entirely.
function sweepAbandoned(sessionsDir, { nowMs = Date.now(), maxAgeMs = ABANDON_AFTER_MS, shardsDir } = {}) {
  const data = readIndex(sessionsDir);
  let changed = 0;
  for (const entry of data.sessions) {
    if (entry.status !== 'active') continue;
    const last = Date.parse(entry.lastActivityAt || entry.createdAt || 0);
    if (Number.isFinite(last) && nowMs - last > maxAgeMs) {
      entry.status = 'abandoned';
      if (shardsDir && entry.gateOpenAtEnd == null) {
        const gateId = readGateOpenId(shardsDir, entry.sessionId);
        if (gateId) entry.gateOpenAtEnd = gateId;
      }
      changed += 1;
    }
  }
  if (changed > 0) writeIndex(sessionsDir, data);
  return changed;
}

function listSessions(sessionsDir, { project, agent, status } = {}) {
  const data = readIndex(sessionsDir);
  let rows = data.sessions.slice();
  if (project) rows = rows.filter((s) => s.projectDir === project || s.projectName === project);
  if (agent) rows = rows.filter((s) => s.agent === agent);
  if (status) rows = rows.filter((s) => s.status === status);
  rows.sort((a, b) => {
    const ta = Date.parse(a.lastActivityAt || a.createdAt || 0) || 0;
    const tb = Date.parse(b.lastActivityAt || b.createdAt || 0) || 0;
    return tb - ta;
  });
  return rows;
}

function getEntry(sessionsDir, sessionId) {
  const data = readIndex(sessionsDir);
  return findEntry(data, sessionId);
}

module.exports = {
  INDEX_VERSION,
  INDEX_FILENAME,
  ABANDON_AFTER_MS,
  PROMPT_PREVIEW_LIMIT,
  indexPath,
  readIndex,
  writeIndex,
  appendSession,
  updateActivity,
  touchLiveSession,
  updatePhase,
  markEnded,
  sweepAbandoned,
  readGateOpenId,
  listSessions,
  getEntry,
  truncatePrompt,
};
