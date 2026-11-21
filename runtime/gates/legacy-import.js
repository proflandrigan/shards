'use strict';
// E11.11: import legacy (v1 gate-hook) gate history into v2 runtime state and git notes.
//
// Sources (under <root>/.shards/gates/):
//   state.json   single-slot format  { open, id, phase, kind, agent, opened_at, ..., history: [] }
//                v2 sessions format  { version: 2, sessions: { <sid>: {open, id, ...} }, history: [] }
//   gates.jsonl  event log: {event: opened|closed|advisory|validation-passed, gate_id, kind, ts, ...}
//   violations.jsonl (archived only)
//
// Destinations
//   <root>/.shards/state/sessions/legacy-import/gates.json        imported gates (StateStore, "gates")
//   <root>/.shards/state/sessions/legacy-import/legacy-gates.jsonl verbatim copy of gates.jsonl
//   refs/notes/shards-legacy-gates on HEAD                         one line per imported gate (if a repo with commits)
//
// Closed gates import as `confirmed` with proof.tier "legacy-import". Gates still open in
// the legacy state import as `changes_requested` (terminal-ish, re-requestable) so they never
// block the v2 workflow. The source files are ARCHIVED (moved) to .shards/archive/legacy-gates/,
// never deleted, which also makes the import repeatable: a second run finds nothing to do.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SESSION_KEY = 'legacy-import';
const NOTES_REF = 'refs/notes/shards-legacy-gates';
const KINDS = new Set(['phase', 'final', 'execute', 'handoff', 'checkpoint', 'confirm']);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return e.code === 'ENOENT' ? null : { __error: e.message }; }
}

function readJsonl(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return { rows: [], bad: 0, text: null }; }
  const rows = []; let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o && typeof o === 'object') rows.push(o); else bad++; } catch (_) { bad++; }
  }
  return { rows, bad, text };
}

// Normalize either state.json shape to {history: [], open: [{...slot, session}]}.
function normalizeState(obj) {
  if (!obj || typeof obj !== 'object' || obj.__error) return { history: [], open: [] };
  const history = Array.isArray(obj.history) ? obj.history.filter((h) => h && typeof h === 'object') : [];
  const open = [];
  if (obj.version === 2 || (obj.sessions && typeof obj.sessions === 'object')) {
    for (const [sid, g] of Object.entries(obj.sessions || {})) if (g && g.open) open.push({ ...g, session: sid });
  } else if (obj.open) {
    open.push({ ...obj, session: obj.agent || null });
  }
  return { history, open };
}

function cleanId(id, fallback) {
  const s = String(id == null ? '' : id).replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 120);
  return ID_RE.test(s) ? s : fallback;
}

function buildGates(state, events) {
  const gates = []; // {id, status, kind, phase, agent, opened_at, closed_at, confirmed_by, origin}
  const histCount = new Map();
  for (const h of state.history) {
    histCount.set(h.id, (histCount.get(h.id) || 0) + 1);
    gates.push({ id: h.id, status: 'confirmed', kind: h.kind, phase: h.phase, agent: h.agent, opened_at: h.opened_at, closed_at: h.closed_at, confirmed_by: h.confirmed_by, origin: 'state.history' });
  }
  // gates.jsonl 'closed' events beyond what state.history holds (history may have been trimmed).
  const closedBy = new Map();
  const openedBy = new Map();
  for (const e of events) {
    const id = e.gate_id;
    if (!id) continue;
    if (e.event === 'closed') { if (!closedBy.has(id)) closedBy.set(id, []); closedBy.get(id).push(e); }
    else if (e.event === 'opened') { if (!openedBy.has(id)) openedBy.set(id, []); openedBy.get(id).push(e); }
  }
  for (const [id, closed] of closedBy) {
    const extra = closed.length - (histCount.get(id) || 0);
    if (extra <= 0) continue;
    const opened = openedBy.get(id) || [];
    closed.slice(0, extra).forEach((e, i) => {
      gates.push({ id, status: 'confirmed', kind: e.kind, phase: undefined, agent: undefined, opened_at: opened[i] && opened[i].ts, closed_at: e.ts, confirmed_by: e.confirmed_by, origin: 'gates.jsonl' });
    });
  }
  for (const g of state.open) {
    gates.push({ id: g.id, status: 'changes_requested', kind: g.kind, phase: g.phase, agent: g.agent, opened_at: g.opened_at, closed_at: null, confirmed_by: null, origin: 'state.open', session: g.session });
  }
  gates.sort((a, b) => String(a.closed_at || a.opened_at || '').localeCompare(String(b.closed_at || b.opened_at || '')) || 0);
  return gates;
}

function toEntry(g, key, index) {
  const ts = g.closed_at || g.opened_at || new Date(0).toISOString();
  const opened = g.opened_at || ts;
  const kind = KINDS.has(g.kind) ? g.kind : 'phase';
  const confirmed = g.status === 'confirmed';
  const history = [{ ts: opened, from: null, to: 'pending' }];
  const entry = {
    id: key, status: g.status, kind,
    phase: g.phase === undefined ? null : g.phase,
    track: null, project: null,
    agent: g.agent || null, frame: null,
    summary: confirmed ? 'Imported from legacy gate history' : 'Legacy gate was still open at migration; abandoned',
    record_ref: null, validates: null,
    requested_at: opened, updated_at: ts,
    history,
    legacy: { source: g.origin, index, id: g.id == null ? null : g.id, kind: g.kind == null ? null : g.kind, ...(g.session ? { session: g.session } : {}) },
  };
  if (confirmed) {
    entry.decided_at = ts; entry.decision = 'confirmed';
    entry.proof = { tier: 'legacy-import', user: g.confirmed_by || 'unknown', ts };
    history.push({ ts, from: 'pending', to: 'confirmed', by: 'legacy-import' });
  } else {
    entry.decided_at = ts; entry.decision = 'changes_requested';
    entry.note = 'legacy gate open at migration';
    entry.proof = { tier: 'legacy-import', user: 'migrate', ts };
    history.push({ ts, from: 'pending', to: 'changes_requested', by: 'legacy-import' });
  }
  return entry;
}

function gitEnv() {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
  env.GIT_TERMINAL_PROMPT = '0';
  return env;
}
function git(root, args, input) {
  return execFileSync('git', args, { cwd: root, env: gitEnv(), input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

// Attach (or refresh) a note on HEAD listing the imported gates. Never touches branches/index.
function writeNote(root, lines) {
  let head;
  try { head = git(root, ['rev-parse', '--verify', '-q', 'HEAD^{commit}']).trim(); } catch (_) { return { status: 'skipped', reason: 'no git repository with commits' }; }
  const body = ['Shards legacy gate history (imported by `shards migrate`)', ...lines].join('\n') + '\n';
  let existing = null;
  try { existing = git(root, ['notes', '--ref', NOTES_REF, 'show', head]); } catch (_) { /* none */ }
  if (existing === body) return { status: 'unchanged', ref: NOTES_REF, commit: head };
  // Append rather than overwrite when a different note exists (a prior partial import).
  let finalBody = body;
  if (existing && !existing.includes(lines[0])) finalBody = existing.replace(/\n*$/, '\n') + lines.join('\n') + '\n';
  const env = [];
  try { if (!git(root, ['config', 'user.name']).trim()) throw new Error(); } catch (_) { env.push('-c', 'user.name=shards'); }
  try { if (!git(root, ['config', 'user.email']).trim()) throw new Error(); } catch (_) { env.push('-c', 'user.email=shards@localhost'); }
  try {
    git(root, [...env, 'notes', '--ref', NOTES_REF, 'add', '-f', '-F', '-', head], finalBody);
    return { status: 'written', ref: NOTES_REF, commit: head };
  } catch (e) {
    return { status: 'failed', reason: String(e.stderr || e.message).trim() };
  }
}

function archiveTarget(dir, name) {
  let t = path.join(dir, name); let n = 2;
  while (fs.existsSync(t)) t = path.join(dir, `${name}.${n++}`);
  return t;
}

async function importLegacyGateHistory({ root, dryRun = false, notes = true } = {}) {
  const gateDir = path.join(root, '.shards', 'gates');
  const res = { found: false, imported: 0, skippedExisting: 0, openAbandoned: 0, bad: 0, archived: [], notes: { status: 'skipped', reason: 'nothing to import' }, errors: [] };
  const files = ['state.json', 'gates.jsonl', 'violations.jsonl'].filter((f) => fs.existsSync(path.join(gateDir, f)));
  if (!files.length) return res;
  res.found = true;

  const rawState = readJson(path.join(gateDir, 'state.json'));
  if (rawState && rawState.__error) {
    res.errors.push(`state.json: corrupt JSON (${rawState.__error}); left in place, nothing imported from it`);
  }
  const jsonl = readJsonl(path.join(gateDir, 'gates.jsonl'));
  res.bad = jsonl.bad;
  if (res.errors.length) return res;

  const gates = buildGates(normalizeState(rawState), jsonl.rows);
  const seen = new Map();
  const planned = gates.map((g, i) => {
    const base = cleanId(g.id, `legacy-gate-${i + 1}`);
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    const key = n === 1 ? base : `${base}.${n}`;
    return { key, entry: toEntry(g, key, i) };
  });

  const { StateStore } = require('../state/store');
  const store = new StateStore(root, SESSION_KEY);
  if (!dryRun) {
    await store.update('gates', (cur) => {
      cur.gates = cur.gates || {};
      for (const p of planned) {
        if (cur.gates[p.key]) { res.skippedExisting++; continue; }
        cur.gates[p.key] = p.entry; res.imported++;
      }
      return cur;
    });
    if (jsonl.text !== null) {
      const dest = path.join(store.sessionDir, 'legacy-gates.jsonl');
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, jsonl.text);
    }
  } else {
    const cur = fs.existsSync(store.file('gates')) ? store.read('gates').gates || {} : {};
    for (const p of planned) { if (cur[p.key]) res.skippedExisting++; else res.imported++; }
  }
  res.openAbandoned = planned.filter((p) => p.entry.status === 'changes_requested').length;

  if (notes && planned.length) {
    const lines = planned.map((p) => `Shards-Legacy-Gate: ${p.key} kind=${p.entry.kind} phase=${p.entry.phase === null ? '-' : p.entry.phase} status=${p.entry.status} at=${p.entry.updated_at}`);
    res.notes = dryRun ? { status: 'dry-run', ref: NOTES_REF } : writeNote(root, lines);
  }

  // Archive (move, never delete) the legacy gate files. Only after a successful import.
  if (!dryRun && res.notes.status !== 'failed') {
    const archDir = path.join(root, '.shards', 'archive', 'legacy-gates');
    fs.mkdirSync(archDir, { recursive: true });
    for (const f of files) {
      const to = archiveTarget(archDir, f);
      fs.renameSync(path.join(gateDir, f), to);
      res.archived.push(path.relative(root, to).split(path.sep).join('/'));
    }
    try { fs.rmdirSync(gateDir); } catch (_) { /* other files remain: keep */ }
  } else if (dryRun) {
    res.archived = files.map((f) => `.shards/archive/legacy-gates/${f}`);
  }
  return res;
}

module.exports = { importLegacyGateHistory, normalizeState, buildGates, SESSION_KEY, NOTES_REF };
