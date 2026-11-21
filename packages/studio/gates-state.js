'use strict';

/**
 * gates-state.js — read-only view of v2 gate state for Studio.
 *
 * The runtime owns gates (docs/gates.md): each session keeps
 *   <root>/.shards/state/sessions/<sessionKey>/gates.json  ->  { gates: { <id>: Entry } }
 * Studio never parses chat text for gates and never writes gate state; it only
 * reads these files and reduces them to what the browser needs.
 */

const fs = require('fs');
const path = require('path');

const OPEN_STATUSES = new Set(['pending', 'suspended']);
const HISTORY_LIMIT = 20;

function sessionsDir(shardsDir) {
  return path.join(shardsDir, 'state', 'sessions');
}

function listGateFiles(shardsDir) {
  const dir = sessionsDir(shardsDir);
  let names;
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return names
    .filter((e) => e.isDirectory())
    .map((e) => ({ session: e.name, file: path.join(dir, e.name, 'gates.json') }))
    .sort((a, b) => (a.session < b.session ? -1 : 1));
}

function readAllGates(shardsDir) {
  const out = [];
  for (const { session, file } of listGateFiles(shardsDir)) {
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; } // missing or half-written
    const gates = doc && doc.gates && typeof doc.gates === 'object' ? doc.gates : {};
    for (const [id, g] of Object.entries(gates)) {
      if (g && typeof g === 'object') out.push({ ...g, id: g.id || id, session });
    }
  }
  return out;
}

const ts = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? -Infinity : t; };

function brief(g) {
  return {
    id: g.id, session: g.session, status: g.status, kind: g.kind || null,
    phase: typeof g.phase !== 'undefined' ? g.phase : null,
    agent: g.agent || null, project: g.project || null, summary: g.summary || null,
    requested_at: g.requested_at || null, decided_at: g.decided_at || null,
    decision: g.decision || null,
  };
}

/**
 * Reduce runtime gate state to the browser shape:
 *   { open, id, session, phase, kind, agent, summary, opened_at, confirmCommand, pending: [...], history: [...] }
 * `open` is true when any gate is pending/suspended; the flat fields describe the
 * most recently requested pending gate, else the most recent suspended one.
 */
// Quote one argument for the user's shell. POSIX: single quotes. Windows (cmd.exe and
// PowerShell both accept it): double quotes; backslashes and ~ (8.3 names) are plain there.
function shellQuote(s, platform = process.platform) {
  if (platform === 'win32') return /^[A-Za-z0-9_\\\/.:@%+=,~-]+$/.test(s) ? s : `"${s.replace(/"/g, '""')}"`;
  return /^[A-Za-z0-9_\/.:@%+=,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

function readGateState(shardsDir) {
  const projectDir = path.dirname(path.resolve(shardsDir));
  const all = readAllGates(shardsDir);
  // Pending gates first (only those can be confirmed), each group newest first.
  const pending = all.filter((g) => OPEN_STATUSES.has(g.status))
    .sort((a, b) => ((a.status === 'pending') === (b.status === 'pending') ? 0 : a.status === 'pending' ? -1 : 1)
      || ts(b.requested_at) - ts(a.requested_at));
  const history = all.filter((g) => g.status === 'confirmed' || g.status === 'changes_requested' || g.status === 'force_closed')
    .sort((a, b) => ts(a.decided_at || a.updated_at) - ts(b.decided_at || b.updated_at))
    .slice(-HISTORY_LIMIT).map(brief);
  if (!pending.length) return { open: false, pending: [], history };
  const top = pending[0];
  return {
    open: true,
    id: top.id,
    session: top.session,
    status: top.status,
    phase: typeof top.phase !== 'undefined' ? top.phase : null,
    kind: top.kind || null,
    agent: top.agent || null,
    summary: top.summary || null,
    opened_at: top.requested_at || null,
    // `gates confirm` refuses a suspended gate (it must be resumed first), so offer no command for one.
    confirmCommand: top.status === 'pending'
      ? `shards gates confirm ${top.id} --session ${top.session} --root ${shellQuote(projectDir)}`
      : null,
    pending: pending.map(brief),
    history,
  };
}

/** (phase, gateOpenAtEnd) snapshot for the session index. */
function readGateSnapshot(shardsDir) {
  const s = readGateState(shardsDir);
  if (s.open) return { phase: typeof s.phase === 'number' ? s.phase : null, gateOpenAtEnd: s.id || null };
  for (let i = s.history.length - 1; i >= 0; i--) {
    if (typeof s.history[i].phase === 'number') return { phase: s.history[i].phase, gateOpenAtEnd: null };
  }
  return { phase: null, gateOpenAtEnd: null };
}

/** Cheap change signature (file mtimes + sizes) for polling. */
function gateSignature(shardsDir) {
  return listGateFiles(shardsDir).map(({ session, file }) => {
    try { const st = fs.statSync(file); return `${session}:${st.mtimeMs}:${st.size}`; } catch { return `${session}:-`; }
  }).join('|');
}

/** Poll for changes; calls onChange(state) when the signature changes. Returns {stop}. */
function watchGateState(shardsDir, onChange, pollMs = 1000) {
  let last = gateSignature(shardsDir);
  const timer = setInterval(() => {
    const sig = gateSignature(shardsDir);
    if (sig === last) return;
    last = sig;
    try { onChange(readGateState(shardsDir)); } catch { /* next tick retries */ }
  }, pollMs);
  if (timer.unref) timer.unref();
  return { stop() { clearInterval(timer); } };
}

module.exports = { shellQuote, readGateState, readGateSnapshot, watchGateState, gateSignature };
