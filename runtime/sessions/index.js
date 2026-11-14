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

// Read the current gate state from .shards/gates/state.json. Returns the open
// gate id (string) or null. Caller passes the shards root, not the gates dir.
// Tolerant of missing/corrupt state — never throws. Mirrors readGateSnapshot
// in src/ui/server.js and tools/shards-sessions.js so all three end-of-session
// code paths produce identical `gateOpenAtEnd` shapes.
function readGateOpenId(shardsDir) {
  if (!shardsDir) return null;
  try {
    const raw = fs.readFileSync(path.join(shardsDir, 'gates', 'state.json'), 'utf8');
    const state = JSON.parse(raw);
    if (state && state.open) return state.id || null;
    return null;
  } catch {
    return null;
  }
}

// On server startup, anything still tagged `active` past the abandonment
// window is reclassified — we can't know if the process actually died, but
// 24h of inactivity is a strong enough signal to surface it differently in
// the UI than a healthy live session.
//
// On `gateOpenAtEnd`: at sweep time we don't know what the gate state was
// *when the session actually went idle* — that ship sailed 24h+ ago. We
// snapshot whatever's open right now anyway, because:
//   (a) For UI-Sessions display, showing the currently-open gate is more
//       informative than leaving the field null and indistinguishable from
//       a clean exit.
//   (b) In the common case (single project, one session at a time) the gate
//       state is unlikely to have moved on much since the session went idle.
//   (c) If the field is null, we leave it null rather than fabricating an
//       'unknown' sentinel that downstream code would need to special-case.
// Pass `shardsDir` to enable the snapshot; omit it (e.g. in unit tests) to
// skip the read entirely.
function sweepAbandoned(sessionsDir, { nowMs = Date.now(), maxAgeMs = ABANDON_AFTER_MS, shardsDir } = {}) {
  const data = readIndex(sessionsDir);
  let changed = 0;
  let cachedGateId; // undefined sentinel — read at most once per sweep
  for (const entry of data.sessions) {
    if (entry.status !== 'active') continue;
    const last = Date.parse(entry.lastActivityAt || entry.createdAt || 0);
    if (Number.isFinite(last) && nowMs - last > maxAgeMs) {
      entry.status = 'abandoned';
      if (shardsDir && entry.gateOpenAtEnd == null) {
        if (cachedGateId === undefined) cachedGateId = readGateOpenId(shardsDir);
        if (cachedGateId) entry.gateOpenAtEnd = cachedGateId;
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
  updatePhase,
  markEnded,
  sweepAbandoned,
  readGateOpenId,
  listSessions,
  getEntry,
  truncatePrompt,
};
