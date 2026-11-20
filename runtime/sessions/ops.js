'use strict';
// Shared session operations for the sessions_* MCP tools and `shards sessions` CLI (E2.6).
// Lives outside runtime/tools/ because that directory auto-loads every .js as a tool.
const fs = require('fs');
const path = require('path');
const index = require('./index');

function sessionsDir(root) { return path.join(root, '.shards', 'sessions'); }

// Idempotent: add the session to INDEX.json if missing and bump its activity. The caller is
// serving this session right now, so a row a sweep marked `abandoned` goes back to `active`;
// an `ended` row is left as is.
function registerSession(root, sessionKey, hostName) {
  const dir = sessionsDir(root);
  index.appendSession(dir, { sessionId: sessionKey, agent: null, projectDir: root, projectName: path.basename(root), resumedFrom: null });
  return index.touchLiveSession(dir, sessionKey);
}

// Startup sweep: mark stale active rows abandoned and record the gate each was left at.
function sweepStale(root) {
  return index.sweepAbandoned(sessionsDir(root), { shardsDir: path.join(root, '.shards') });
}

function detectHost(env = process.env) {
  try {
    const c = require('../session/correlate');
    if (typeof c.detectHostName === 'function') return c.detectHostName(env);
  } catch (_) { /* fall through */ }
  return env.SHARDS_HOST || 'claude-code';
}

function resumeHints(id) {
  return {
    claude: `claude --resume ${id}`,
    codex: `codex resume ${id}  (UNVERIFIED: Codex CLI 0.169 was checked live, but codex resume itself was not tested)`,
    t3: 'Open the thread link in T3 Code (thread resume is host-side; no CLI command, see docs/compat.md T3-4)',
  };
}

// Resolve an id or unique prefix to an index entry. Throws on none / ambiguous.
function resolveEntry(root, idOrPrefix) {
  const rows = index.listSessions(sessionsDir(root));
  const exact = rows.find((r) => r.sessionId === idOrPrefix);
  if (exact) return exact;
  const m = idOrPrefix ? rows.filter((r) => r.sessionId.startsWith(idOrPrefix)) : [];
  if (m.length === 0) throw new Error(`No session matches "${idOrPrefix}".`);
  if (m.length > 1) throw new Error(`Ambiguous session prefix "${idOrPrefix}" matches ${m.length} sessions: ${m.map((r) => r.sessionId).join(', ')}`);
  return m[0];
}

function listRows(root, { status, limit } = {}) {
  let rows = index.listSessions(sessionsDir(root), status ? { status } : {});
  if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);
  return rows;
}

function resumeInfo(root, idOrPrefix, env) {
  const entry = resolveEntry(root, idOrPrefix);
  return { entry, hints: resumeHints(entry.sessionId), host: detectHost(env) };
}

// Gates of a session still holding things open: suspended or pending.
function collectOpenGates(root, sessionKey, state) {
  let st = state;
  try {
    if (!st) {
      const { StateStore, sanitizeSessionKey } = require('../state/store');
      sanitizeSessionKey(sessionKey);
      if (!fs.existsSync(path.join(root, '.shards', 'state', 'sessions', sessionKey))) return [];
      st = new StateStore(root, sessionKey);
    }
    const gates = require('../gates');
    return gates.listGates({ root, sessionKey, state: st }).filter((g) => g && (g.status === 'suspended' || g.status === 'pending'));
  } catch (e) { throw new Error(`Cannot read gate state for session ${sessionKey} (${e && e.message ? e.message : e}); refusing to end (fail closed). Run \`shards doctor\` or force-close as operator.`); }
}

// Resolve the session to end: explicit id/prefix, else entry matching currentKey, else most recent active.
function pickSession(root, { id, currentKey } = {}) {
  if (id) return { entry: resolveEntry(root, id), key: null };
  const rows = index.listSessions(sessionsDir(root));
  if (currentKey) {
    const cur = rows.find((r) => r.sessionId === currentKey);
    if (cur) return { entry: cur };
  }
  const active = rows.find((r) => r.status === 'active');
  if (active) return { entry: active };
  if (currentKey) return { entry: null, key: currentKey };
  throw new Error('No session to end: no id given, no current session, and no active session in the index.');
}

async function endSession(root, { id, currentKey, state, deps = {}, reason = 'end' } = {}) {
  const picked = pickSession(root, { id, currentKey });
  const entry = picked.entry;
  const key = entry ? entry.sessionId : picked.key;
  const useState = state && key === currentKey ? state : undefined;

  const open = collectOpenGates(root, key, useState);
  if (open.length) {
    throw new Error(`Refusing to end session ${key}: ${open.length} gate(s) still open: ${open.map((g) => `${g.id} (${g.status})`).join(', ')}. Resolve them first; force-close is operator-only: \`shards gates force-close\`.`);
  }

  const git = deps.git || require('../git');
  let replayed = [];
  let replayError = null;
  try {
    const r = await git.replayPending(root);
    replayed = Array.isArray(r) ? r : [];
  } catch (e) { replayError = e && e.message ? e.message : String(e); }
  const failed = replayed.filter((x) => x && x.outcome && x.outcome !== 'committed' && x.outcome !== 'skipped');
  let still;
  try { still = git.listPending(root) || []; } catch (_) { still = []; }
  const stillPending = still.map((r) => ({ gate: r.gate, status: r.status, reason: r.reason || null }));

  const out = { ended: false, replayed, still_pending: stillPending };
  if (failed.length) out.replay_failures = failed;
  if (replayError) out.replay_error = replayError;
  if (!entry) { out.note = `No index row for session ${key}; nothing marked ended.`; return out; }
  const marked = index.markEnded(sessionsDir(root), entry.sessionId, { reason });
  out.ended = !!marked;
  out.session = entry.sessionId;
  return out;
}

module.exports = { sessionsDir, registerSession, sweepStale, detectHost, resumeHints, resolveEntry, listRows, resumeInfo, collectOpenGates, pickSession, endSession };
