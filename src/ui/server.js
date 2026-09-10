#!/usr/bin/env node

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const { randomUUID } = require('crypto');
const { ChatSession, reconnectOrCleanup } = require('./chat-session');
const symbolIndex = require('./symbol-index');
const { permissionPattern } = require('./permission-pattern');
const { isCcReadOnlyAutoApprovable } = require('./cc-readonly');
const sessionIndex = require('./session-index');

let PROJECT_DIR = process.cwd();
let SHARDS_DIR = path.join(PROJECT_DIR, '.shards');
let PORT_FILE = path.join(SHARDS_DIR, 'ui.port');
let PID_FILE = path.join(SHARDS_DIR, 'ui.pid');
let LOG_FILE = path.join(SHARDS_DIR, 'ui.log');
let AGENTS_DIR = path.join(PROJECT_DIR, '.claude', 'agents');
let COMMANDS_DIR = path.join(PROJECT_DIR, '.claude', 'commands');
let SESSIONS_DIR = path.join(SHARDS_DIR, 'sessions');
let KNOWLEDGE_DIR = path.join(SHARDS_DIR, 'knowledge');
let INDEX_HTML = path.join(__dirname, 'index.html');

function initPaths(projectDir, options = {}) {
  PROJECT_DIR = projectDir;
  SHARDS_DIR = path.join(PROJECT_DIR, '.shards');
  PORT_FILE = path.join(SHARDS_DIR, 'ui.port');
  PID_FILE = path.join(SHARDS_DIR, 'ui.pid');
  LOG_FILE = path.join(SHARDS_DIR, 'ui.log');
  AGENTS_DIR = path.join(PROJECT_DIR, '.claude', 'agents');
  COMMANDS_DIR = path.join(PROJECT_DIR, '.claude', 'commands');
  SESSIONS_DIR = path.join(SHARDS_DIR, 'sessions');
  KNOWLEDGE_DIR = path.join(SHARDS_DIR, 'knowledge');
  const uiDir = options.uiDir || __dirname;
  INDEX_HTML = path.join(uiDir, 'index.html');
  ELECTRON_MODE = !!options.electronMode;
  VENDOR_DIR = options.vendorDir || null;
}

let ELECTRON_MODE = false;
let VENDOR_DIR = null;

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

const PORTS = [7842, 7843, 7844, 7845];
const OUTPUT_DIRS = ['analysis', 'studies', 'models', 'services', 'research', 'dashboards', 'brainstorm', 'data_models', 'experiments'];

// ─── P1: Auth token ──────────────────────────────────────────────────────────

const AUTH_TOKEN = randomUUID();

// ─── P5: TLS configuration ──────────────────────────────────────────────────

const TLS_CERT = process.env.SHARDS_TLS_CERT || null;
const TLS_KEY = process.env.SHARDS_TLS_KEY || null;
const BIND_ADDR = process.env.SHARDS_BIND || '127.0.0.1';
const TRUST_PROXY = process.env.SHARDS_TRUST_PROXY === '1';

// ─── File-poll guards (see pollFiles / scanDir) ─────────────────────────────

const POLL_MAX_BYTES = Number(process.env.SHARDS_POLL_MAX_BYTES) || 2 * 1024 * 1024; // 2 MB
const POLL_SKIP_EXT = new Set([
  // Binary data formats
  '.pkl', '.pickle', '.parquet', '.feather', '.h5', '.hdf5',
  '.npy', '.npz', '.arrow', '.orc',
  // Archives
  '.zip', '.gz', '.tgz', '.tar', '.bz2', '.xz', '.7z',
  // Compiled / opaque
  '.so', '.dylib', '.dll', '.exe', '.bin',
  // Images & PDFs (served via /browse/file/raw, no need to broadcast)
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg', '.pdf',
  // Media
  '.mp4', '.mov', '.mp3', '.wav',
]);
const pollSkipWarned = new Set();

// ─── P3: Session Store ──────────────────────────────────────────────────────

// Output dirs Shards specialists write under — used to derive a project slug
// from a touched file path (e.g. analysis/churn-q4/queries.sql → "churn-q4").
const PROJECT_OUTPUT_DIRS = [
  'analysis', 'studies', 'models', 'services', 'data_models', 'research',
  'dashboards', 'brainstorm', 'experiments', 'fixes', 'presentations', 'projects',
];
const PROJECT_PATH_RE = new RegExp(`^(${PROJECT_OUTPUT_DIRS.join('|')})/([^/]+)/`);

const AGENT_META = {
  'syn':                    { color: '#FFD700', label: 'Syn (Orchestrator)',           category: 'route', keywords: [] },
  'data-analyst':           { color: '#4CAF50', label: 'Data Analyst',                category: 'analytics',  keywords: ['sql', 'query', 'adhoc'] },
  'data-scientist':         { color: '#2196F3', label: 'Data Scientist',              category: 'data',  keywords: ['eda', 'exploratory', 'statistical'] },
  'data-engineer':          { color: '#FF9800', label: 'Data Engineer',               category: 'data',  keywords: ['pipeline', 'etl', 'warehouse'] },
  'data-modeller':          { color: '#00BCD4', label: 'Data Modeller',               category: 'data',  keywords: ['schema', 'erd', 'dimensional'] },
  'analytics-engineer':     { color: '#8BC34A', label: 'Analytics Engineer',          category: 'data',  keywords: ['dbt', 'transform', 'staging'] },
  'ml-engineer':            { color: '#F44336', label: 'ML Engineer',                 category: 'mlai', keywords: ['recommender', 'classification', 'production ml'] },
  'ai-engineer':            { color: '#9C27B0', label: 'AI Engineer',                 category: 'mlai', keywords: ['llm', 'rag', 'prompt'] },
  'applied-ml-scientist':   { color: '#673AB7', label: 'Applied ML Scientist',       category: 'mlai', keywords: ['novel', 'research', 'architecture'] },
  'deep-learning-engineer': { color: '#03A9F4', label: 'Deep Learning Engineer',     category: 'mlai', keywords: ['neural', 'pytorch', 'transformer'] },
  'mlops-engineer':         { color: '#FF5722', label: 'MLOps Engineer',              category: 'mlai', keywords: ['deploy', 'serving', 'monitoring'] },
  'bi-engineer':            { color: '#E91E63', label: 'BI Engineer',                 category: 'analytics', keywords: ['dashboard', 'visualization', 'streamlit'] },
  'backend-engineer':       { color: '#9E9E9E', label: 'Backend Engineer',            category: 'review', keywords: ['python', 'fastapi', 'code review'] },
  'researcher':             { color: '#795548', label: 'Researcher',                  category: 'review', keywords: ['statistics', 'methodology'] },
  'academic':               { color: '#607D8B', label: 'Academic',                    category: 'review', keywords: ['safety', 'ethics', 'bias'] },
};

function detectProjectFromRelPath(relPath) {
  if (!relPath || relPath.startsWith('..')) return null;
  const norm = relPath.replace(/\\/g, '/');
  const m = norm.match(PROJECT_PATH_RE);
  if (!m) return null;
  return { projectDir: `${m[1]}/${m[2]}`, projectName: m[2] };
}

// Read the gate state file and reduce it to a (phase, gateOpenAtEnd) snapshot
// suitable for stamping into the session index. We treat the "current phase"
// as: the open gate's phase if one is open, otherwise the most recent closed
// gate's phase. Returns nulls if there's no gate activity to report.
function readGateSnapshot(shardsDir) {
  const file = path.join(shardsDir, 'gates', 'state.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const state = JSON.parse(raw);
    // Reduce to the single most-recent open gate. Handles both the legacy
    // single-slot shape ({ open, ... }) and the v2 per-session shape
    // ({ version: 2, sessions: { ... } }).
    const open = reduceOpenGate(state);
    if (open) {
      return { phase: typeof open.phase === 'number' ? open.phase : null, gateOpenAtEnd: open.id || null };
    }
    const history = Array.isArray(state && state.history) ? state.history : [];
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h && typeof h.phase === 'number') return { phase: h.phase, gateOpenAtEnd: null };
    }
    return { phase: null, gateOpenAtEnd: null };
  } catch {
    return { phase: null, gateOpenAtEnd: null };
  }
}

class SessionStore {
  constructor({ sessionId, agent }) {
    this.sessionId = sessionId;
    this.agent = agent;
    this.title = null;
    this.transcript = [];
    this.sessionFiles = new Set();
    this.chatSession = null;
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
    this.projectName = null;
    this.projectDir = null;

    // Attempt to load existing session data from disk
    try {
      const filePath = path.join(SESSIONS_DIR, `${sessionId}-transcript.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.transcript) this.transcript = data.transcript;
        if (data.title) this.title = data.title;
        if (data.createdAt) this.createdAt = new Date(data.createdAt);
        if (data.lastActivityAt) this.lastActivityAt = new Date(data.lastActivityAt);
        if (data.projectName) this.projectName = data.projectName;
        if (data.projectDir) this.projectDir = data.projectDir;
      }
    } catch (e) {
      // Ignore errors loading session data — starts fresh
    }
  }

  touch() {
    this.lastActivityAt = new Date();
  }

  // Returns true if projectName/projectDir changed (caller should broadcast).
  setProjectFromRelPath(relPath) {
    if (this.projectName) return false;
    const detected = detectProjectFromRelPath(relPath);
    if (!detected) return false;
    this.projectName = detected.projectName;
    this.projectDir = detected.projectDir;
    return true;
  }

  save() {
    try {
      if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
      const filePath = path.join(SESSIONS_DIR, `${this.sessionId}-transcript.json`);
      fs.writeFileSync(filePath, JSON.stringify({
        sessionId: this.sessionId,
        agent: this.agent,
        title: this.title,
        transcript: this.transcript,
        createdAt: this.createdAt,
        lastActivityAt: this.lastActivityAt,
        projectName: this.projectName,
        projectDir: this.projectDir,
      }, null, 2));
    } catch (err) {
      log(`Error saving session ${this.sessionId}: ${err.message}`);
    }
  }
}

const sessions = new Map(); // sessionId -> SessionStore

function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s) s.touch();
  return s || null;
}

// ─── Permission request store ────────────────────────────────────────────────

const permissionRequests = new Map();
// id → { id, tool, command, sessionId, decision: null|'allow'|'deny', createdAt }

// Pending entries used to be retained indefinitely "in case the user comes
// back to decide" — but a permission card whose browser session ended (closed
// tab, refresh, abandoned chat) is never going to be decided. The relay
// polling that entry will sit in `pending` for its full poll timeout
// (SHARDS_UI_PERMISSION_TIMEOUT_MS, default 10 min) and the entry itself never
// frees. Cleanup now removes pending entries that have exceeded the relay's
// poll timeout — by then the relay has already fallen through to CC's native
// prompt, so the entry serves no purpose. Decided entries still age out at
// the 5-minute mark.
const DECIDED_TTL_MS = 5 * 60 * 1000;
const PENDING_TTL_MS = 11 * 60 * 1000;  // relay default + 1min buffer
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of permissionRequests) {
    const ttl = req.decision === null ? PENDING_TTL_MS : DECIDED_TTL_MS;
    if (now - req.createdAt > ttl) permissionRequests.delete(id);
  }
}, 60_000);

// ─── Settings cache for permission fast paths ───────────────────────────────

const READONLY_PRESET = [
  // Git read-only
  'Bash(git log:*)', 'Bash(git status:*)', 'Bash(git diff:*)',
  'Bash(git branch:*)', 'Bash(git show:*)', 'Bash(git rev-parse:*)',
  'Bash(git remote:*)', 'Bash(git tag:*)', 'Bash(git stash list:*)',
  // File exploration
  'Bash(find:*)', 'Bash(ls:*)', 'Bash(tree:*)', 'Bash(file:*)',
  'Bash(stat:*)', 'Bash(du:*)', 'Bash(df:*)',
  // File reading
  'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(less:*)',
  // Search
  'Bash(grep:*)', 'Bash(rg:*)', 'Bash(ag:*)', 'Bash(fzf:*)',
  // Inspection
  'Bash(wc:*)', 'Bash(echo:*)', 'Bash(pwd:*)', 'Bash(which:*)',
  'Bash(whoami:*)', 'Bash(env:*)', 'Bash(printenv:*)',
  'Bash(type:*)', 'Bash(command -v:*)', 'Bash(uname:*)',
  // Data inspection
  'Bash(sort:*)', 'Bash(uniq:*)', 'Bash(cut:*)', 'Bash(awk:*)',
  'Bash(diff:*)', 'Bash(comm:*)', 'Bash(jq:*)',
];

let settingsCache = { allow: [], deny: [] };

function loadSettingsCache() {
  let allow = [];
  let deny = [];
  let hasSettingsJson = false;

  // Read .claude/settings.json (project-level, managed by UI)
  try {
    const raw = JSON.parse(fs.readFileSync(
      path.join(PROJECT_DIR, '.claude', 'settings.json'), 'utf8'
    ));
    allow = (raw.permissions && raw.permissions.allow) || [];
    deny  = (raw.permissions && raw.permissions.deny)  || [];
    hasSettingsJson = true;
  } catch {}

  // Merge .claude/settings.local.json (user-level, managed by Claude Code)
  try {
    const local = JSON.parse(fs.readFileSync(
      path.join(PROJECT_DIR, '.claude', 'settings.local.json'), 'utf8'
    ));
    const localAllow = (local.permissions && local.permissions.allow) || [];
    const localDeny  = (local.permissions && local.permissions.deny)  || [];
    for (const entry of localAllow) {
      if (!allow.includes(entry)) allow.push(entry);
    }
    for (const entry of localDeny) {
      if (!deny.includes(entry)) deny.push(entry);
    }
  } catch {}

  // Fall back to readonly preset when no settings.json exists
  if (!hasSettingsJson && allow.length === 0) {
    allow = [...READONLY_PRESET];
  }

  settingsCache = { allow, deny };
}
loadSettingsCache();

// Ensure the PreToolUse hook exists — without it, non-whitelisted Bash commands
// are denied by Claude Code's internal permission system in stream-json mode
// and never reach the browser permission card flow.
//
// Hook timeout is in seconds. Default Claude Code hook timeout is 600s;
// we extend to 1800s (30 min) so users have a realistic window to respond
// to a permission card before Claude Code falls back to its internal rules.
const PRETOOL_HOOK_TIMEOUT_SEC = 1800;

function ensurePreToolUseHook() {
  const settingsPath = path.join(PROJECT_DIR, '.claude', 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];

  const relayPath = path.join(__dirname, 'relay.js');
  let mutated = false;

  // Find an existing relay entry if any, and patch its timeout in place
  // so older installations pick up the longer window without manual edits.
  let hasRelay = false;
  for (const entry of settings.hooks.PreToolUse) {
    if (!entry.hooks) continue;
    for (const h of entry.hooks) {
      if (h.command && h.command.includes('relay.js')) {
        hasRelay = true;
        if (h.timeout !== PRETOOL_HOOK_TIMEOUT_SEC) {
          h.timeout = PRETOOL_HOOK_TIMEOUT_SEC;
          mutated = true;
        }
      }
    }
  }

  if (!hasRelay) {
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [{
        type: 'command',
        command: `node ${relayPath} pre-tool-use`,
        timeout: PRETOOL_HOOK_TIMEOUT_SEC,
      }],
    });
    mutated = true;
    console.log('[shards-ui] Added missing PreToolUse hook to settings.json');
  }

  if (mutated) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
}
ensurePreToolUseHook();

function matchesPermission(command, patterns) {
  for (const pattern of patterns) {
    const m = pattern.match(/^Bash\((.+)\)$/);
    if (!m) continue;
    const glob = m[1];
    // The colon in Bash(cmd:*) is Claude Code's delimiter between command prefix
    // and argument glob — replace with a pattern matching space-or-end-of-string
    const regex = new RegExp('^' + glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/:/, '( |$)')
      .replace(/\*/g, '.*') + '$');
    if (regex.test(command)) return true;
  }
  return false;
}

function persistPermission(command, decision) {
  const settingsPath = path.join(PROJECT_DIR, '.claude', 'settings.json');
  let settings = {};
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}

  if (!settings.permissions) settings.permissions = {};
  const key = decision === 'allow' ? 'allow' : 'deny';
  if (!settings.permissions[key]) settings.permissions[key] = [];

  // Persist as a prefix glob (Bash(cmd:*)) rather than the literal command, so
  // clicking Always Allow on `python3 foo.py` also covers `python3 bar.py`.
  // For launcher commands (git, dbt, npm, …) the subcommand is included in the
  // prefix — Bash(git status:*) — so scope doesn't widen to every git call.
  const entry = permissionPattern(command);
  if (!settings.permissions[key].includes(entry)) {
    settings.permissions[key].push(entry);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    loadSettingsCache();
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

let clients = [];       // SSE response objects: { res, sessionId (optional filter) }
let files = {};         // relPath -> content
let panelSources = {};  // panelId -> { filePath, panel, title, agent, lastContent }
let panelWatchers = {}; // panelId -> fs.FSWatcher

// Dedicated SSE channel for gate-state / gate-block / auto-state events.
// Kept separate from the main `clients` channel so subscribers that only care
// about gate transitions don't pay the cost of decoding every tool / file
// broadcast. Each entry: { res } — no per-session filtering since gates are
// project-scoped.
let gateClients = [];

// ─── Gate-mode env vars ─────────────────────────────────────────────────────
// Captured at server startup. The Claude Code hook processes spawn in their
// own env (which may or may not inherit these), but the UI server can only
// honestly report what *it* sees. If the user disables enforcement only in
// the CC side without also exporting it to the UI server, the banner won't
// fire — documented in the /gate-mode handler below.
const GATE_ENFORCE = process.env.SHARDS_GATE_ENFORCE !== '0';
const CHECKPOINT_ENFORCE = process.env.SHARDS_CHECKPOINT_ENFORCE !== '0';
const AUTO_VERIFY = process.env.SHARDS_AUTO_VERIFY !== '0';

// ─── Broadcast ───────────────────────────────────────────────────────────────

function broadcast(event) {
  let data;
  try {
    data = `data: ${JSON.stringify(event)}\n\n`;
  } catch (err) {
    const type = event && event.type;
    const path = event && event.path;
    console.error(`broadcast: failed to serialize event type=${type} path=${path}: ${err.message}`);
    return;
  }
  clients = clients.filter((client) => {
    // If client subscribed to a specific session, only send matching events
    if (client.sessionId && event.sessionId && client.sessionId !== event.sessionId) {
      return true; // keep client, just skip this event
    }
    try {
      client.res.write(data);
      return true;
    } catch {
      return false;
    }
  });
}

// ─── Gate SSE broadcast ──────────────────────────────────────────────────────
//
// Broadcasts gate-related events (gate-state changes, gate-block reasons,
// auto-state changes) on a dedicated SSE channel. Replaces the 2s polling the
// browser previously did on /gate-state — see Bug H2 in the integration audit.

function broadcastGate(event) {
  let data;
  try {
    data = `data: ${JSON.stringify(event)}\n\n`;
  } catch (err) {
    log(`broadcastGate: failed to serialize event type=${event && event.type}: ${err.message}`);
    return;
  }
  gateClients = gateClients.filter((client) => {
    try { client.res.write(data); return true; } catch { return false; }
  });
}

// ─── Gate / auto / violations watchers ──────────────────────────────────────
//
// fs.watch on the JSON state files (plus violations log). We debounce by 50ms
// to coalesce mid-write events (atomic-write replaces emit two change events
// in quick succession on most platforms) and ignore JSON.parse errors so the
// watcher survives a half-written file — the next change event will retry.

const GATE_STATE_FILE = () => path.join(SHARDS_DIR, 'gates', 'state.json');
const AUTO_STATE_FILE = () => path.join(SHARDS_DIR, 'auto', 'state.json');
const VIOLATIONS_FILE = () => path.join(SHARDS_DIR, 'gates', 'violations.jsonl');

let _gateWatchers = [];
let _gateStateDebounce = null;
let _autoStateDebounce = null;
let _violationsDebounce = null;
let _violationsOffset = 0;

// Reduce a parsed gate-state object to its single most-recent OPEN gate, or
// null if none is open. Handles the legacy single-slot shape ({ open, id, ...})
// and the v2 per-session shape ({ version: 2, sessions: { "<id>": {...} } }).
function reduceOpenGate(state) {
  if (!state || typeof state !== 'object') return null;
  // v2 per-session map.
  if (state.sessions && typeof state.sessions === 'object') {
    let best = null;
    let bestT = -Infinity;
    for (const g of Object.values(state.sessions)) {
      if (!g || !g.open) continue;
      const t = g.opened_at ? Date.parse(g.opened_at) : NaN;
      const score = Number.isNaN(t) ? -Infinity : t;
      if (best === null || score > bestT) { best = g; bestT = score; }
    }
    return best;
  }
  // Legacy single slot.
  return state.open ? state : null;
}

// Reduce a parsed gate-state object to the flat shape the browser expects:
// { open, id, phase, kind, agent, opened_at, history }. The v2 per-session map
// collapses to the single most-recent open gate; `history` is always the shared
// top-level array. This preserves the browser-facing JSON contract unchanged.
function reduceGateState(state) {
  const history = Array.isArray(state && state.history) ? state.history : [];
  const open = reduceOpenGate(state);
  if (!open) return { open: false, history };
  return {
    open: true,
    id: open.id || null,
    phase: typeof open.phase !== 'undefined' ? open.phase : null,
    kind: open.kind || null,
    agent: open.agent || null,
    opened_at: open.opened_at || null,
    history,
  };
}

// Read state.json and reduce it to the flat browser contract. Returns null only
// when the file is unreadable (caller substitutes a closed default).
function readGateStateFile() {
  try {
    const raw = fs.readFileSync(GATE_STATE_FILE(), 'utf8');
    return reduceGateState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readAutoStateFile() {
  try {
    const raw = fs.readFileSync(AUTO_STATE_FILE(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Pull only the bytes appended since we last read (so we don't replay every
// historical violation each time the file changes).
function readNewViolations() {
  const file = VIOLATIONS_FILE();
  let stat;
  try { stat = fs.statSync(file); } catch { return []; }
  if (stat.size < _violationsOffset) {
    // File was truncated/rotated — reset offset and treat from start.
    _violationsOffset = 0;
  }
  if (stat.size === _violationsOffset) return [];
  let chunk;
  try {
    const fd = fs.openSync(file, 'r');
    const length = stat.size - _violationsOffset;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, _violationsOffset);
    fs.closeSync(fd);
    chunk = buf.toString('utf8');
  } catch {
    return [];
  }
  _violationsOffset = stat.size;
  const out = [];
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { out.push(JSON.parse(trimmed)); } catch { /* skip half-written line; next event retries */ }
  }
  return out;
}

function emitGateState() {
  const state = readGateStateFile() || { open: false, history: [] };
  broadcastGate({ type: 'gate-state', state });
}

function emitAutoState() {
  const state = readAutoStateFile();
  if (state) broadcastGate({ type: 'auto-state', state });
}

function emitViolations() {
  const entries = readNewViolations();
  for (const v of entries) {
    broadcastGate({
      type: 'gate-block',
      reason: v.reason || v.type || 'Gate violation',
      kind: v.type || null,
      gateId: v.gate_id || null,
      agent: v.agent || null,
      phase: v.phase || null,
      sessionId: v.session_id || null,
      ts: v.ts || null,
    });
  }
}

function startGateWatchers() {
  // Initialise violations offset to current size so we don't replay history.
  try {
    const stat = fs.statSync(VIOLATIONS_FILE());
    _violationsOffset = stat.size;
  } catch {
    _violationsOffset = 0;
  }

  const setupWatch = (file, kind) => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    } catch {}
    try {
      const watcher = fs.watch(path.dirname(file), (event, filename) => {
        if (!filename) return;
        if (path.basename(file) !== filename) return;
        if (kind === 'gate') {
          if (_gateStateDebounce) clearTimeout(_gateStateDebounce);
          _gateStateDebounce = setTimeout(emitGateState, 50);
        } else if (kind === 'auto') {
          if (_autoStateDebounce) clearTimeout(_autoStateDebounce);
          _autoStateDebounce = setTimeout(emitAutoState, 50);
        } else if (kind === 'violations') {
          if (_violationsDebounce) clearTimeout(_violationsDebounce);
          _violationsDebounce = setTimeout(emitViolations, 50);
        }
      });
      watcher.on('error', (err) => {
        log(`gate watcher (${kind}) error: ${err.message}`);
      });
      _gateWatchers.push(watcher);
    } catch (err) {
      log(`gate watcher (${kind}) setup failed: ${err.message}`);
    }
  };

  setupWatch(GATE_STATE_FILE(), 'gate');
  setupWatch(AUTO_STATE_FILE(), 'auto');
  setupWatch(VIOLATIONS_FILE(), 'violations');
}

function stopGateWatchers() {
  for (const w of _gateWatchers) {
    try { w.close(); } catch {}
  }
  _gateWatchers = [];
}

function stopPanelWatcher(panelId) {
  if (panelWatchers[panelId]) {
    try { panelWatchers[panelId].close(); } catch {}
    delete panelWatchers[panelId];
  }
}

function startPanelWatcher(panelId, info) {
  stopPanelWatcher(panelId); // ensure clean start

  try {
    const watcher = fs.watch(info.filePath, (event) => {
      if (event === 'change') {
        // debounce slightly to ensure file is written
        setTimeout(() => {
          const currentInfo = panelSources[panelId];
          if (!currentInfo) return; // panel was closed
          const content = readFileSafe(currentInfo.filePath);
          if (content !== null && content !== currentInfo.lastContent) {
            panelSources[panelId] = { ...currentInfo, lastContent: content };
            const parsedData = parsePanelFileContent(currentInfo.filePath, content);
            broadcast({
              type: 'ui-panel-update',
              panelId,
              panel: currentInfo.panel,
              title: currentInfo.title,
              agent: currentInfo.agent,
              data: parsedData,
            });
          }
        }, 100);
      }
    });
    watcher.on('error', (err) => {
      log(`Panel watcher error for ${info.filePath}: ${err.message}`);
      stopPanelWatcher(panelId);
    });
    panelWatchers[panelId] = watcher;
  } catch (err) {
    log(`Failed to start watcher for ${info.filePath}: ${err.message}`);
  }
}

// ─── File scanning (polling) ──────────────────────────────────────────────────

function readFileSafe(fullPath) {
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }
}

// ─── CSV/TSV parser (RFC 4180) ────────────────────────────────────────────

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field/row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return { columns: [], data: [] };

  const columns = rows[0];
  const data = [];
  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    for (let c = 0; c < columns.length; c++) {
      obj[columns[c]] = rows[r][c] !== undefined ? rows[r][c] : '';
    }
    data.push(obj);
  }

  return { columns, data };
}

// Cap recursion depth for the 3s output-dir poll. 12 is more permissive than
// walkSearch's 8 (the user's own output dirs can nest deeper than ad-hoc search
// scope) but still bounded. Symlinks are skipped outright via lstat to prevent
// a symlink cycle under analysis/ from re-running pollFiles indefinitely.
const SCAN_MAX_DEPTH = 12;

function scanDir(dir, result, depth) {
  if (depth === undefined) depth = 0;
  if (depth > SCAN_MAX_DEPTH) return;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      // Skip symlinks (both file and dir) — prevents infinite recursion via
      // symlink loops on the 3s poll. Dirent.isSymbolicLink() reflects the
      // type the OS reported in readdir; lstat is the authoritative check in
      // case the dirent type wasn't populated by the filesystem.
      if (entry.isSymbolicLink()) continue;
      try {
        if (fs.lstatSync(fullPath).isSymbolicLink()) continue;
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        scanDir(fullPath, result, depth + 1);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (POLL_SKIP_EXT.has(ext)) {
        if (!pollSkipWarned.has(fullPath)) {
          pollSkipWarned.add(fullPath);
          console.warn(`pollFiles: skipping ${fullPath} (extension ${ext} in skip list)`);
        }
        continue;
      }

      let size;
      try {
        size = fs.statSync(fullPath).size;
      } catch {
        continue;
      }
      if (size > POLL_MAX_BYTES) {
        if (!pollSkipWarned.has(fullPath)) {
          pollSkipWarned.add(fullPath);
          console.warn(`pollFiles: skipping ${fullPath} (${size} bytes > ${POLL_MAX_BYTES})`);
        }
        continue;
      }

      const relPath = path.relative(PROJECT_DIR, fullPath);
      const content = readFileSafe(fullPath);
      if (content !== null) result[relPath] = content;
    }
  } catch {}
}

function pollFiles() {
  const current = {};
  for (const dir of OUTPUT_DIRS) {
    const dirPath = path.join(PROJECT_DIR, dir);
    if (fs.existsSync(dirPath)) scanDir(dirPath, current);
  }

  // Collect all sessionFiles across active sessions
  const allSessionFiles = new Set();
  for (const store of sessions.values()) {
    for (const f of store.sessionFiles) allSessionFiles.add(f);
  }

  for (const [relPath, content] of Object.entries(current)) {
    if (files[relPath] !== content) {
      files[relPath] = content;
      broadcast({ type: 'artifact-updated', path: relPath, content, sessionFile: allSessionFiles.has(relPath) });
    }
  }

  setTimeout(pollFiles, 3000);
}

// ─── Panel file content parser ────────────────────────────────────────────────

function parsePanelFileContent(filePath, content) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    try { return JSON.parse(content); } catch { return content; }
  }
  if (ext === '.csv') {
    return parseDelimited(content, ',');
  }
  if (ext === '.tsv') {
    return parseDelimited(content, '\t');
  }
  return content;
}

// ─── Event handler (observer mode - relay) ──────────────────────────────────

function handleEvent(body) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ack: false };
  }

  const { eventType, seq, sessionId: eventSessionId, ...data } = payload;

  // Prefer the session id carried by the relay event itself (forwarded from
  // the Claude Code hook's stdin payload — same value as the SessionStore
  // key for UI-spawned sessions, since we pass --session-id to the CLI). If
  // a matching store exists, use it directly. This is the fix for two
  // concurrent sessions seeing each other's events misattributed to "most
  // recently active session."
  //
  // Fall back to the previous "most recently active" heuristic when:
  //   - the event lacks a sessionId (legacy relay processes before this fix
  //     ship, or queued events written under the old shape)
  //   - the event references a session not tracked by this server (claude run
  //     outside the UI in the same project — hooks still fire)
  let activeStore = null;
  let activeSessionId = null;
  if (eventSessionId) {
    const store = sessions.get(eventSessionId);
    if (store) {
      activeStore = store;
      activeSessionId = eventSessionId;
    }
  }
  if (!activeStore) {
    for (const [id, store] of sessions) {
      if (store.chatSession && store.chatSession.isRunning) {
        if (!activeStore || store.lastActivityAt > activeStore.lastActivityAt) {
          activeStore = store;
          activeSessionId = id;
        }
      }
    }
  }

  switch (eventType) {
    case 'user-message':
      if (activeStore) activeStore.transcript.push({ role: 'user', content: data.content, agent: data.agent, source: 'observer' });
      broadcast({ type: 'user-message', content: data.content, agent: data.agent, sessionId: activeSessionId });
      break;
    case 'agent-message':
      if (activeStore) activeStore.transcript.push({ role: 'assistant', content: data.content, agent: data.agent, source: 'observer' });
      broadcast({ type: 'agent-message', content: data.content, agent: data.agent, sessionId: activeSessionId });
      break;
    case 'agent-activated':
      broadcast({ type: 'agent-activated', agent: data.agent, sessionId: activeSessionId });
      break;
    case 'agent-changed':
      broadcast({ type: 'agent-changed', from: data.from, to: data.to, sessionId: activeSessionId });
      break;
    case 'agent-consulting':
      broadcast({ type: 'agent-consulting', agent: data.agent, sessionId: activeSessionId });
      break;
    case 'event-log':
      broadcast({ type: 'event-log', text: data.text, sessionId: activeSessionId });
      break;
    case 'file-touched': {
      const relPath = path.relative(PROJECT_DIR, data.filePath);
      if (activeStore) {
        activeStore.sessionFiles.add(relPath);
        if (activeStore.setProjectFromRelPath(relPath)) {
          activeStore.save();
          try {
            sessionIndex.updateActivity(SESSIONS_DIR, activeSessionId, {
              projectName: activeStore.projectName,
              projectDir: activeStore.projectDir,
            });
          } catch (err) {
            log(`session-index updateActivity (file-touched) failed: ${err.message}`);
          }
          broadcast({
            type: 'session-context',
            sessionId: activeSessionId,
            projectName: activeStore.projectName,
            projectDir: activeStore.projectDir,
          });
        }
      }
      broadcast({ type: 'file-touched', path: relPath, sessionId: activeSessionId });
      break;
    }
    case 'session-end':
      broadcast({ type: 'session-end', sessionId: activeSessionId });
      if (activeStore) activeStore.sessionFiles = new Set();
      break;

    // ─── ui-panel: agent pushes an interactive panel to the browser ─────
    case 'ui-panel': {
      const { panel, panelId, title, data: panelData, source, type: panelType, agent: panelAgent } = data;
      if (!panel || !panelId) break;

      let resolvedData = panelData !== undefined ? panelData : null;

      // If source file path provided, read it and watch for changes
      if (source) {
        const content = readFileSafe(source);
        if (content !== null) {
          resolvedData = parsePanelFileContent(source, content);
          const info = {
            filePath: source,
            panel,
            title: title || panel,
            agent: panelAgent || null,
            lastContent: content,
          };
          panelSources[panelId] = info;
          startPanelWatcher(panelId, info);
        }
      }

      broadcast({
        type: 'ui-panel',
        panel,
        panelId,
        title: title || panel,
        data: resolvedData,
        source: source || null,
        panelType: panelType || null,
        agent: panelAgent || null,
      });
      break;
    }

    // ─── ui-panel-close: agent or server closes a panel ─────────────────
    case 'ui-panel-close': {
      const { panelId } = data;
      if (panelId) {
        if (panelSources[panelId]) delete panelSources[panelId];
        stopPanelWatcher(panelId);
      }
      broadcast({ type: 'ui-panel-close', panelId: panelId || null });
      break;
    }
  }

  return { ack: true, seq: seq || null };
}

// ─── Agent listing ──────────────────────────────────────────────────────────

function listAgents() {
  const agents = [];
  try {
    const entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const name = entry.name.replace(/\.md$/, '');
      const content = readFileSafe(path.join(AGENTS_DIR, entry.name));
      if (!content) continue;

      // Parse YAML frontmatter
      let description = '';
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const descMatch = fmMatch[1].match(/description:\s*["']?(.+?)["']?\s*$/m);
        if (descMatch) description = descMatch[1];
      }

      agents.push({ name, description });
    }
  } catch {}
  // Enrich with metadata
  for (const a of agents) {
    const meta = AGENT_META[a.name] || {};
    a.description = a.description || meta.description || '';
    a.label = meta.label || a.name;
    a.color = meta.color || '#3860c0';
    a.category = meta.category || 'other';
    a.keywords = meta.keywords || [];
  }
  return agents;
}

function listSkills() {
  const roots = [
    { dir: path.join(PROJECT_DIR, '.claude', 'skills'), scope: 'project' },
    { dir: path.join(os.homedir(), '.claude', 'skills'), scope: 'user' },
  ];
  const seen = new Set();
  const skills = [];

  for (const { dir, scope } of roots) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }

    for (const entry of entries) {
      if (!entry.isDirectory() || seen.has(entry.name)) continue;
      const skillPath = path.join(dir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const content = readFileSafe(skillPath);
      if (!content) continue;

      let description = '';
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const descMatch = fmMatch[1].match(/description:\s*["']?(.+?)["']?\s*$/m);
        if (descMatch) description = descMatch[1];
      }

      seen.add(entry.name);
      skills.push({ name: entry.name, description, scope });
    }
  }
  return skills;
}

// ─── Chat session management ────────────────────────────────────────────────

function handleChatEvent(event) {
  const { type, sessionId } = event;
  const store = getSession(sessionId);

  switch (type) {
    case 'chat-token':
      broadcast({ type: 'chat-token', text: event.text, index: event.index, sessionId });
      break;

    case 'chat-tool-use':
      broadcast({ type: 'chat-tool-use', tool: event.tool, id: event.id, index: event.index, sessionId });
      break;

    case 'chat-tool-input-delta':
      broadcast({ type: 'chat-tool-input-delta', partial_json: event.partial_json, index: event.index, sessionId });
      break;

    case 'chat-block-stop':
      broadcast({ type: 'chat-block-stop', index: event.index, sessionId });
      break;

    case 'chat-message': {
      const content = event.content;
      let textContent = '';
      if (Array.isArray(content)) {
        textContent = content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
      } else if (typeof content === 'string') {
        textContent = content;
      }
      const agent = store ? store.agent : 'unknown';
      if (store) {
        store.transcript.push({ role: 'assistant', content: textContent, agent, source: 'chat' });
        store.save();
      }
      broadcast({ type: 'chat-message', content: textContent, agent, sessionId });
      break;
    }

    case 'chat-turn-end':
      broadcast({ type: 'chat-turn-end', sessionId, cost: event.cost, duration: event.duration });
      break;

    case 'chat-init': {
      // When forking, the CLI assigns a new session ID — re-key the store
      if (event.oldSessionId && event.sessionId !== event.oldSessionId) {
        const store = sessions.get(event.oldSessionId);
        if (store) {
          sessions.delete(event.oldSessionId);
          sessions.set(event.sessionId, store);
          store.sessionId = event.sessionId;
        }
      }
      broadcast({ type: 'chat-init', sessionId });
      break;
    }

    case 'chat-error':
      broadcast({ type: 'chat-error', error: event.error, sessionId });
      break;

    case 'chat-stderr':
      broadcast({ type: 'chat-stderr', text: event.text, sessionId });
      break;
  }
}

function handleChatExit({ code, sessionId }) {
  const store = getSession(sessionId);
  if (store) {
    store.chatSession = null;
    // Remove session metadata file
    try { fs.unlinkSync(path.join(SESSIONS_DIR, `${sessionId}.json`)); } catch {}
  }

  // Abort any pending permission requests tied to this session. Without this,
  // a relay process started by the now-dead chat session keeps polling for a
  // decision that will never come (the browser card disappeared with the
  // session). Marking these as denied lets the relay's next poll resolve
  // immediately and fall through to CC's native permission flow.
  for (const [id, req] of permissionRequests) {
    if (req.sessionId === sessionId && req.decision === null) {
      req.decision = 'deny';
      req.createdAt = Date.now();  // restart TTL so the entry isn't immediately collected
      broadcast({ type: 'permission-resolved', id, decision: 'deny', reason: 'session-ended' });
    }
  }
  // Mark ended in the index if not already (covers natural CLI exit, crashes,
  // and the path where the user closes the browser without hitting End Chat).
  try {
    const entry = sessionIndex.getEntry(SESSIONS_DIR, sessionId);
    if (entry && entry.status === 'active') {
      const snap = readGateSnapshot(SHARDS_DIR);
      sessionIndex.markEnded(SESSIONS_DIR, sessionId, {
        gateOpenAtEnd: snap.gateOpenAtEnd,
        reason: code === 0 ? 'process_exit' : 'process_crash',
      });
      if (typeof snap.phase === 'number') sessionIndex.updatePhase(SESSIONS_DIR, sessionId, snap.phase);
    }
  } catch (err) {
    log(`session-index markEnded (handleChatExit) failed: ${err.message}`);
  }
  broadcast({ type: 'chat-ended', sessionId, code: code || 0 });
}

// ─── Slash command parsing ──────────────────────────────────────────────────

function parseSlashCommand(message) {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return null;

  const cmd = trimmed.slice(1).split(/\s+/)[0].toLowerCase();
  if (!cmd) return null;

  // Utility commands
  const utilities = ['stop', 'clear', 'help'];
  if (utilities.includes(cmd)) {
    return { type: 'utility', command: cmd };
  }

  // Claude Code built-in commands handled by the UI
  const builtins = ['context', 'rewind', 'exit', 'model'];
  if (builtins.includes(cmd)) {
    const rest = trimmed.slice(1 + cmd.length).trim();
    return { type: 'builtin', command: cmd, args: rest || null };
  }

  // Agent commands — check against installed agents
  const agents = listAgents();

  // Explicit /agent <name> form — always unambiguous
  if (cmd === 'agent') {
    const name = trimmed.slice(1 + cmd.length).trim();
    if (agents.some(a => a.name === name)) {
      return { type: 'agent', agent: name };
    }
    return null;
  }

  // Bare agent name — backward compatible shortcut
  if (agents.some(a => a.name === cmd)) {
    return { type: 'agent', agent: cmd };
  }

  // Everything else — skills, project commands, CC builtins we don't
  // special-case — goes to the CLI verbatim.
  return { type: 'passthrough' };
}

// ─── Chat session creation helper ───────────────────────────────────────────

function startNewChatSession(agent, options = {}) {
  const { resumeSessionId, permissionMode, callerSessionId, initialMessage, model } = options;

  // Kill existing session for the caller if running
  if (callerSessionId) {
    const oldStore = getSession(callerSessionId);
    if (oldStore && oldStore.chatSession && oldStore.chatSession.isRunning) {
      oldStore.chatSession.stop();
    }
  }

  const sessionId = randomUUID();

  const store = new SessionStore({ sessionId, agent });
  sessions.set(sessionId, store);

  try {
    sessionIndex.appendSession(SESSIONS_DIR, {
      sessionId,
      agent,
      resumedFrom: resumeSessionId || null,
    });
  } catch (err) {
    log(`session-index appendSession failed: ${err.message}`);
  }

  const chatSess = new ChatSession({
    agent,
    sessionId,
    resumeSessionId,
    cwd: PROJECT_DIR,
    sessionsDir: SESSIONS_DIR,
    permissionMode: permissionMode || 'acceptEdits',
    model,
    onEvent: handleChatEvent,
    onExit: handleChatExit,
  });

  store.chatSession = chatSess;
  chatSess.start();

  // Opening message. For an agent session this is the activation prompt from
  // .claude/commands/<agent>.md; for a plain session it's the user's own first
  // message, or nothing at all if they haven't typed yet.
  let firstMessage = null;

  if (agent) {
    const cmdFile = path.join(COMMANDS_DIR, `${agent}.md`);
    try {
      const raw = fs.readFileSync(cmdFile, 'utf8');
      firstMessage = raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
    } catch {
      firstMessage = `You are now activated as the ${agent} agent. Greet the user and display your activation menu.`;
    }
    if (initialMessage) {
      firstMessage += '\n\nThe user has already provided their request upfront. ' +
        '**Skip the greeting and activation menu entirely.** Go directly to Phase 0 triage.' +
        '\n\nUser request:\n\n' + initialMessage;
    }
  } else if (initialMessage) {
    firstMessage = initialMessage;
  }

  if (firstMessage) {
    try {
      chatSess.send(firstMessage);
    } catch (err) {
      chatSess.stop();
      sessions.delete(sessionId);
      broadcast({ type: 'chat-error', error: `Session start failed: ${err.message}`, sessionId });
      return { sessionId, agent };
    }
  }

  broadcast({ type: 'chat-started', agent, sessionId, autoActivated: !!agent });
  return { sessionId, agent };
}

// ─── Request body parser ────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
  });
}

function jsonResponse(res, cors, statusCode, data) {
  res.writeHead(statusCode, { ...cors, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── Server ──────────────────────────────────────────────────────────────────

// ─── P1: Auth middleware ──────────────────────────────────────────────────────

function checkAuth(req, parsedUrl) {
  // Check Authorization header first
  const authHeader = req.headers['authorization'];
  if (authHeader === `Bearer ${AUTH_TOKEN}`) return true;
  // Check query param (for SSE EventSource which can't set headers)
  if (parsedUrl && parsedUrl.searchParams.get('token') === AUTH_TOKEN) return true;
  return false;
}

function rejectAuth(res, cors) {
  jsonResponse(res, cors, 401, { error: 'Unauthorized' });
}

function createHandler() {
  return async (req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Log client IP if trust-proxy is enabled
    if (TRUST_PROXY) {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      log(`${req.method} ${req.url} from ${clientIp}`);
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(200, cors);
      res.end();
      return;
    }

    // ─── P1: Public endpoints (no auth required) ────────────────

    // Serve HTML page — inject auth token as meta tag
    if (req.method === 'GET' && parsedUrl.pathname === '/') {
      try {
        let html = fs.readFileSync(INDEX_HTML, 'utf8');
        // Inject token into HTML as a meta tag before </head>
        html = html.replace('</head>', `<meta name="shards-token" content="${AUTH_TOKEN}">\n</head>`);
        // Electron mode: swap CDN URLs for local vendor paths and inject detection flag
        if (ELECTRON_MODE) {
          html = html.replace('</head>', `<script>window.__shardsElectronServer = true;</script>\n</head>`);
          if (VENDOR_DIR) {
            html = html.replace('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', 'vendor/inter-font/inter.css');
            html = html.replace('https://unpkg.com/tabulator-tables@6.3.1/dist/css/tabulator_midnight.min.css', 'vendor/tabulator-tables/tabulator_midnight.min.css');
            html = html.replace('https://unpkg.com/tabulator-tables@6.3.1/dist/js/tabulator.min.js', 'vendor/tabulator-tables/tabulator.min.js');
            html = html.replace('https://cdn.plot.ly/plotly-2.35.2.min.js', 'vendor/plotly/plotly.min.js');
            html = html.replace('https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js', 'vendor/mermaid/mermaid.min.js');
            // Inject xterm.js and fit addon for terminal support
            html = html.replace('</head>',
              '<link rel="stylesheet" href="vendor/xterm/xterm.css">\n' +
              '<script src="vendor/xterm/xterm.js"><\/script>\n' +
              '<script src="vendor/xterm/xterm-addon-fit.js"><\/script>\n' +
              '</head>');
          }
        }
        res.writeHead(200, { ...cors, 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(500);
        res.end('index.html not found');
      }
      return;
    }

    // Static file serving (JS/CSS/images) — no auth (public assets)
    if (req.method === 'GET') {
      const MIME = {
        '.js': 'application/javascript', '.css': 'text/css',
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
      };
      const ext = path.extname(parsedUrl.pathname).toLowerCase();
      if (MIME[ext]) {
        const decodedPath = decodeURIComponent(parsedUrl.pathname);
        let filePath = path.join(__dirname, decodedPath);
        let resolved = path.resolve(filePath);
        // In Electron mode, also serve from vendor directory
        if (ELECTRON_MODE && VENDOR_DIR && decodedPath.startsWith('/vendor/')) {
          filePath = path.join(VENDOR_DIR, decodedPath.slice('/vendor/'.length));
          resolved = path.resolve(filePath);
          if (!resolved.startsWith(path.resolve(VENDOR_DIR))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }
        } else if (!resolved.startsWith(__dirname)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const isBinary = !['.js', '.css', '.svg'].includes(ext);
        try {
          const content = fs.readFileSync(resolved, isBinary ? null : 'utf8');
          res.writeHead(200, { ...cors, 'Content-Type': MIME[ext] });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not found');
        }
        return;
      }
    }

    // ─── Developer Guide (docs) ──────────────────────────────────────────────
    // Serves the Shards Developer Guide from .shards/ui/docs/ — no auth,
    // public static docs. __dirname here is the .shards/ui/ directory in the
    // target install.
    const DOCS_DIR = path.join(__dirname, 'docs');

    if (req.method === 'GET' && parsedUrl.pathname === '/docs/manifest') {
      try {
        const raw = fs.readFileSync(path.join(DOCS_DIR, 'manifest.json'), 'utf8');
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
        res.end(raw);
      } catch {
        res.writeHead(404, { ...cors });
        res.end('Guide manifest not found');
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/docs/page') {
      const file = parsedUrl.searchParams.get('file');
      if (!file) {
        res.writeHead(400, { ...cors });
        res.end('Missing file');
        return;
      }
      const filePath = path.join(DOCS_DIR, file);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(DOCS_DIR) + path.sep)) {
        res.writeHead(403, { ...cors });
        res.end('Forbidden');
        return;
      }
      if (!resolved.endsWith('.md')) {
        res.writeHead(400, { ...cors });
        res.end('Only .md files are served');
        return;
      }
      try {
        const content = fs.readFileSync(resolved, 'utf8');
        res.writeHead(200, { ...cors, 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(content);
      } catch {
        res.writeHead(404, { ...cors });
        res.end('Not found');
      }
      return;
    }

    // ─── Knowledge Ledger bulk-read ──────────────────────────────────────────
    if (req.method === 'GET' && parsedUrl.pathname === '/knowledge/entries') {
      if (!checkAuth(req, parsedUrl)) { rejectAuth(res, cors); return; }
      const KNOWLEDGE_CATEGORIES = ['entities', 'infrastructure', 'patterns', 'features'];
      const indexContent = readFileSafe(path.join(KNOWLEDGE_DIR, 'INDEX.md')) || '';
      const entries = [];
      for (const cat of KNOWLEDGE_CATEGORIES) {
        const catDir = path.join(KNOWLEDGE_DIR, cat);
        try {
          const files = fs.readdirSync(catDir, { withFileTypes: true });
          for (const f of files) {
            if (!f.isFile() || !f.name.endsWith('.md')) continue;
            const fullPath = path.join(catDir, f.name);
            const content = readFileSafe(fullPath);
            if (content !== null) {
              entries.push({
                path: path.relative(PROJECT_DIR, fullPath),
                content,
              });
            }
          }
        } catch { /* directory missing — skip */ }
      }
      jsonResponse(res, cors, 200, { indexContent, entries });
      return;
    }

    /**
     * Resolve a user-supplied path and verify it stays within PROJECT_DIR.
     * Returns the resolved absolute path, or null if out of bounds.
     */
    function resolveSafe(userPath) {
      const resolved = path.resolve(userPath);
      if (resolved !== PROJECT_DIR && !resolved.startsWith(PROJECT_DIR + path.sep)) {
        return null;
      }
      return resolved;
    }

    // Raw file serving (images, PDFs) — auth via query param
    if (req.method === 'GET' && parsedUrl.pathname === '/browse/file/raw') {
      if (!checkAuth(req, parsedUrl)) {
        rejectAuth(res, cors);
        return;
      }
      const filePath = parsedUrl.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400);
        res.end('Missing path');
        return;
      }
      const resolved = resolveSafe(filePath);
      if (!resolved) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const RAW_MIME = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp', '.ico': 'image/x-icon',
        '.pdf': 'application/pdf',
      };
      const rawExt = path.extname(resolved).toLowerCase();
      const mimeType = RAW_MIME[rawExt];
      if (!mimeType) {
        res.writeHead(415);
        res.end('Unsupported file type');
        return;
      }
      try {
        const stat = fs.statSync(resolved);
        if (stat.size > 50 * 1024 * 1024) {
          res.writeHead(413);
          res.end('File too large (>50MB)');
          return;
        }
        const data = fs.readFileSync(resolved);
        res.writeHead(200, {
          ...cors,
          'Content-Type': mimeType,
          'Content-Length': data.length,
        });
        res.end(data);
      } catch (err) {
        res.writeHead(404);
        res.end('File not found');
      }
      return;
    }

    // Text file serving (for pinboard context)
    if (req.method === 'GET' && parsedUrl.pathname === '/browse/file/text') {
      if (!checkAuth(req, parsedUrl)) {
        rejectAuth(res, cors);
        return;
      }
      const filePath = parsedUrl.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing path' }));
        return;
      }
      const resolved = resolveSafe(filePath);
      if (!resolved) {
        res.writeHead(403, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
      try {
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) {
          res.writeHead(400, { ...cors, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not a file' }));
          return;
        }
        if (stat.size > 1024 * 1024) {
          res.writeHead(413, { ...cors, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'File too large (>1MB)' }));
          return;
        }
        const content = fs.readFileSync(resolved, 'utf-8');
        res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(content);
      } catch (err) {
        res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File not found' }));
      }
      return;
    }

    // ─── P1: All remaining endpoints require auth ───────────────

    if (!checkAuth(req, parsedUrl)) {
      rejectAuth(res, cors);
      return;
    }

    // ─── SSE endpoint (auth via query param token) ──────────────

    if (req.method === 'GET' && parsedUrl.pathname === '/events') {
      const filterSessionId = parsedUrl.searchParams.get('sessionId') || null;
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: {"type":"connected"}\n\n');
      clients.push({ res, sessionId: filterSessionId });
      req.on('close', () => {
        clients = clients.filter((c) => c.res !== res);
      });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/transcript') {
      const sid = parsedUrl.searchParams.get('sessionId');
      if (sid) {
        const store = getSession(sid);
        jsonResponse(res, cors, 200, store ? store.transcript : []);
      } else {
        // Return all transcripts merged
        const all = [];
        for (const store of sessions.values()) {
          all.push(...store.transcript);
        }
        jsonResponse(res, cors, 200, all);
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/files') {
      const allSessionFiles = new Set();
      for (const store of sessions.values()) {
        for (const f of store.sessionFiles) allSessionFiles.add(f);
      }
      jsonResponse(res, cors, 200, { files, sessionFiles: [...allSessionFiles] });
      return;
    }

    // ─── P3: Sessions list endpoint ─────────────────────────────

    if (req.method === 'GET' && parsedUrl.pathname === '/sessions') {
      const list = [];
      for (const [id, store] of sessions) {
        list.push({
          sessionId: id,
          agent: store.agent,
          title: store.title,
          active: !!(store.chatSession && store.chatSession.isRunning),
          createdAt: store.createdAt.toISOString(),
          lastActivityAt: store.lastActivityAt.toISOString(),
          messageCount: store.transcript.length,
          projectName: store.projectName,
          projectDir: store.projectDir,
        });
      }
      jsonResponse(res, cors, 200, list);
      return;
    }

    // ─── Disk-backed session index (includes ended/abandoned) ───
    if (req.method === 'GET' && parsedUrl.pathname === '/sessions/index') {
      const project = parsedUrl.searchParams.get('project') || undefined;
      const agent = parsedUrl.searchParams.get('agent') || undefined;
      const status = parsedUrl.searchParams.get('status') || undefined;
      let entries;
      try {
        entries = sessionIndex.listSessions(SESSIONS_DIR, { project, agent, status });
      } catch (err) {
        jsonResponse(res, cors, 500, { error: err.message });
        return;
      }
      // Annotate each entry with `active: true` if there's a live in-memory
      // session for it. The disk record may be stale; the in-memory map is
      // authoritative for "is the process actually running right now."
      const annotated = entries.map((e) => {
        const live = sessions.get(e.sessionId);
        return {
          ...e,
          active: !!(live && live.chatSession && live.chatSession.isRunning),
        };
      });
      jsonResponse(res, cors, 200, { version: sessionIndex.INDEX_VERSION, sessions: annotated });
      return;
    }

    // ─── Directory browser endpoints ───────────────────────────────────

    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/browse')) {

      // ─── File search endpoint ──────────────────────────────────
      if (parsedUrl.pathname === '/browse/search') {
        const query = (parsedUrl.searchParams.get('q') || '').toLowerCase();
        if (!query) {
          jsonResponse(res, cors, 200, { results: [] });
          return;
        }
        const results = [];
        const skip = new Set(['.git', 'node_modules', '__pycache__', '.shards', '.venv', 'venv']);
        function walkSearch(dir, depth) {
          if (depth > 8 || results.length >= 50) return;
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (results.length >= 50) break;
              if (entry.name.startsWith('.') && skip.has(entry.name)) continue;
              if (skip.has(entry.name)) continue;
              const full = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                walkSearch(full, depth + 1);
              } else {
                const rel = path.relative(PROJECT_DIR, full);
                if (rel.toLowerCase().indexOf(query) !== -1) {
                  results.push(rel);
                }
              }
            }
          } catch {}
        }
        walkSearch(PROJECT_DIR, 0);
        jsonResponse(res, cors, 200, { results });
        return;
      }

      if (parsedUrl.pathname === '/browse') {
        let dir = parsedUrl.searchParams.get('dir') || PROJECT_DIR;
        dir = resolveSafe(dir);
        if (!dir) {
          jsonResponse(res, cors, 403, { error: 'Forbidden' });
          return;
        }

        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          const items = [];
          for (const entry of entries) {
            if (entry.name.startsWith('.') && entry.name !== '..') continue;
            const fullPath = path.join(dir, entry.name);
            const isDir = entry.isDirectory();
            let size = 0;
            if (!isDir) {
              try { size = fs.statSync(fullPath).size; } catch {}
            }
            items.push({ name: entry.name, type: isDir ? 'dir' : 'file', size });
          }
          items.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          const parent = path.dirname(dir);
          jsonResponse(res, cors, 200, {
            path: dir,
            parent: parent !== dir ? parent : null,
            entries: items,
          });
        } catch (err) {
          jsonResponse(res, cors, 400, { error: `Cannot read directory: ${err.message}` });
        }
        return;
      }

      if (parsedUrl.pathname === '/browse/file') {
        const filePath = parsedUrl.searchParams.get('path');
        if (!filePath) {
          jsonResponse(res, cors, 400, { error: 'Missing path parameter' });
          return;
        }
        const resolved = resolveSafe(filePath);
        if (!resolved) {
          jsonResponse(res, cors, 403, { error: 'Forbidden' });
          return;
        }
        try {
          const stat = fs.statSync(resolved);
          const isNotebook = resolved.endsWith('.ipynb');
          const maxSize = isNotebook ? 10 * 1024 * 1024 : 2 * 1024 * 1024;
          if (stat.size > maxSize) {
            jsonResponse(res, cors, 400, { error: `File too large (>${isNotebook ? '10' : '2'}MB)` });
            return;
          }
          const content = fs.readFileSync(resolved, 'utf8');
          const relPath = path.relative(PROJECT_DIR, resolved);
          jsonResponse(res, cors, 200, { path: resolved, relPath, content });
        } catch (err) {
          jsonResponse(res, cors, 400, { error: `Cannot read file: ${err.message}` });
        }
        return;
      }
    }

    // ─── Symbol / Code Intelligence endpoints ─────────────────────

    if (req.method === 'GET' && parsedUrl.pathname === '/symbols/status') {
      jsonResponse(res, cors, 200, symbolIndex.getStatus());
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/symbols/reindex') {
      try {
        symbolIndex.buildIndex(PROJECT_DIR, log);
        jsonResponse(res, cors, 200, { ok: true, ...symbolIndex.getStatus() });
      } catch (err) {
        jsonResponse(res, cors, 500, { error: `Reindex failed: ${err.message}` });
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/symbols/definition') {
      const name = parsedUrl.searchParams.get('name');
      const file = parsedUrl.searchParams.get('file') || '';
      if (!name) {
        jsonResponse(res, cors, 400, { error: 'Missing name parameter' });
        return;
      }
      const definitions = symbolIndex.getDefinitions(name, file);
      // Add preview line from disk
      for (const def of definitions) {
        try {
          const absPath = path.join(PROJECT_DIR, def.file);
          const lines = fs.readFileSync(absPath, 'utf8').split('\n');
          def.preview = lines[def.line - 1] || def.pattern || '';
        } catch {
          def.preview = def.pattern || '';
        }
      }
      jsonResponse(res, cors, 200, { definitions });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/symbols/references') {
      const name = parsedUrl.searchParams.get('name');
      const file = parsedUrl.searchParams.get('file') || '';
      if (!name) {
        jsonResponse(res, cors, 400, { error: 'Missing name parameter' });
        return;
      }
      const references = symbolIndex.getReferences(name, PROJECT_DIR);
      jsonResponse(res, cors, 200, { references });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/symbols/hover') {
      const name = parsedUrl.searchParams.get('name');
      const file = parsedUrl.searchParams.get('file') || '';
      const line = parseInt(parsedUrl.searchParams.get('line') || '0', 10);
      if (!name) {
        jsonResponse(res, cors, 400, { error: 'Missing name parameter' });
        return;
      }
      const info = symbolIndex.getHoverEnriched(name, file, line);
      if (info) {
        jsonResponse(res, cors, 200, info);
      } else {
        jsonResponse(res, cors, 200, { found: false });
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/symbols/completions') {
      const prefix = parsedUrl.searchParams.get('prefix') || '';
      const file = parsedUrl.searchParams.get('file') || '';
      if (!prefix) {
        jsonResponse(res, cors, 200, { completions: [] });
        return;
      }
      const completions = symbolIndex.getCompletions(prefix, file);
      jsonResponse(res, cors, 200, { completions });
      return;
    }

    // ─── File save endpoint ─────────────────────────────────────────
    if (req.method === 'POST' && parsedUrl.pathname === '/browse/file/save') {
      const body = await readBody(req);
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { path: filePath, content } = params;
      if (!filePath || typeof content !== 'string') {
        jsonResponse(res, cors, 400, { error: 'Missing path or content parameter' });
        return;
      }

      const resolved = resolveSafe(filePath);
      if (!resolved) {
        jsonResponse(res, cors, 403, { error: 'Forbidden' });
        return;
      }
      try {
        fs.writeFileSync(resolved, content, 'utf8');
        // Update symbol index for saved file
        try {
          const relPath = path.relative(PROJECT_DIR, resolved);
          symbolIndex.updateFileIndex(PROJECT_DIR, relPath);
        } catch {}
        jsonResponse(res, cors, 200, { ok: true, path: resolved });
      } catch (err) {
        jsonResponse(res, cors, 500, { error: `Cannot write file: ${err.message}` });
      }
      return;
    }

    // ─── CSV/TSV parse endpoint ────────────────────────────────────
    if (req.method === 'POST' && parsedUrl.pathname === '/browse/file/parse-csv') {
      const body = await readBody(req);
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { path: filePath, delimiter } = params;
      if (!filePath || (delimiter !== ',' && delimiter !== '\t')) {
        jsonResponse(res, cors, 400, { error: 'Missing path or invalid delimiter (use "," or "\\t")' });
        return;
      }

      const resolved = resolveSafe(filePath);
      if (!resolved) {
        jsonResponse(res, cors, 403, { error: 'Forbidden' });
        return;
      }
      try {
        const stat = fs.statSync(resolved);
        if (stat.size > 2 * 1024 * 1024) {
          jsonResponse(res, cors, 400, { error: 'File too large (>2MB)' });
          return;
        }
        const content = fs.readFileSync(resolved, 'utf8');
        const result = parseDelimited(content, delimiter);
        jsonResponse(res, cors, 200, result);
      } catch (err) {
        jsonResponse(res, cors, 400, { error: `Parse failed: ${err.message}` });
      }
      return;
    }

    // ─── Git endpoints ─────────────────────────────────────────────

    // Resolve the active repo directory from an optional ?repo=<relPath> param.
    // Returns { repoDir, repoRel } where repoRel is the stripped prefix (e.g. "repo-a").
    function getRepoDir(pu) {
      const repo = pu.searchParams.get('repo');
      if (!repo || repo === '.' || repo === '') return { repoDir: PROJECT_DIR, repoRel: '' };
      // Strip any path traversal attempts
      const safe = path.normalize(repo).replace(/^(\.\.\/|\/|\.\.\\|\\)+/, '');
      if (!safe) return { repoDir: PROJECT_DIR, repoRel: '' };
      const resolved = path.resolve(PROJECT_DIR, safe);
      // Must stay inside PROJECT_DIR
      if (resolved !== PROJECT_DIR && !resolved.startsWith(PROJECT_DIR + path.sep)) {
        return { repoDir: PROJECT_DIR, repoRel: '' };
      }
      return { repoDir: resolved, repoRel: safe };
    }

    // Strip a repo-relative prefix from a file path so git commands get the
    // right path relative to their cwd (the subrepo root).
    function stripRepoPrefix(filePath, repoRel) {
      if (!repoRel) return filePath;
      const prefix = repoRel.replace(/\\/g, '/') + '/';
      const fp = filePath.replace(/\\/g, '/');
      return fp.startsWith(prefix) ? fp.slice(prefix.length) : fp;
    }

    // GET /git/repos — discover all git repos at PROJECT_DIR and one level deep
    if (req.method === 'GET' && parsedUrl.pathname === '/git/repos') {
      const repos = [];
      // Check root itself
      try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_DIR, encoding: 'utf8', timeout: 5000 }).trim();
        repos.push({ name: path.basename(PROJECT_DIR), relPath: '.', branch, isRoot: true });
      } catch {}
      // Scan one level of subdirectories
      try {
        const entries = fs.readdirSync(PROJECT_DIR, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
          const subDir = path.join(PROJECT_DIR, entry.name);
          if (!fs.existsSync(path.join(subDir, '.git'))) continue;
          try {
            const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: subDir, encoding: 'utf8', timeout: 5000 }).trim();
            repos.push({ name: entry.name, relPath: entry.name, branch, isRoot: false });
          } catch {}
        }
      } catch {}
      jsonResponse(res, cors, 200, { repos });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/git/status') {
      const { repoDir, repoRel } = getRepoDir(parsedUrl);
      try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoDir, encoding: 'utf8', timeout: 5000 }).trim();
        const statusRaw = execSync('git status --porcelain', { cwd: repoDir, encoding: 'utf8', timeout: 5000 });
        const changes = [];
        for (const line of statusRaw.split('\n')) {
          if (!line) continue;
          const xy = line.substring(0, 2);
          const filePath = line.substring(3).trim();
          // Skip renamed file arrow notation — use destination
          const actualPath = filePath.includes(' -> ') ? filePath.split(' -> ')[1] : filePath;
          let status = 'modified';
          if (xy[0] === '?' || xy[1] === '?') status = 'untracked';
          else if (xy[0] === 'A' || xy[1] === 'A') status = 'added';
          else if (xy[0] === 'D' || xy[1] === 'D') status = 'deleted';
          else if (xy[0] === 'R' || xy[1] === 'R') status = 'renamed';
          const staged = xy[0] !== ' ' && xy[0] !== '?';
          // Prefix path with repoRel so the browser can locate the file from PROJECT_DIR
          const fullPath = repoRel && repoRel !== '.' ? repoRel + '/' + actualPath : actualPath;
          changes.push({ path: fullPath, status, staged });
        }
        jsonResponse(res, cors, 200, { branch, changes, repoRel: repoRel || null });
      } catch (err) {
        // Not a git repo or git not available
        jsonResponse(res, cors, 200, { branch: null, changes: [], error: err.message });
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/git/diff') {
      const filePath = parsedUrl.searchParams.get('path');
      if (!filePath) {
        jsonResponse(res, cors, 400, { error: 'Missing path parameter' });
        return;
      }
      const { repoDir, repoRel } = getRepoDir(parsedUrl);
      // File path relative to the repo root (strip subrepo prefix if present)
      const gitPath = stripRepoPrefix(filePath, repoRel);
      try {
        // Try staged diff first, then unstaged
        let diff = '';
        try {
          diff = execFileSync('git', ['diff', '--', gitPath], { cwd: repoDir, encoding: 'utf8', timeout: 10000 });
        } catch {}
        if (!diff) {
          try {
            diff = execFileSync('git', ['diff', '--cached', '--', gitPath], { cwd: repoDir, encoding: 'utf8', timeout: 10000 });
          } catch {}
        }
        // For untracked files, show full content as "added"
        if (!diff) {
          const resolved = path.resolve(repoDir, gitPath);
          try {
            const content = fs.readFileSync(resolved, 'utf8');
            diff = '--- /dev/null\n+++ b/' + gitPath + '\n@@ -0,0 +1,' + content.split('\n').length + ' @@\n' +
              content.split('\n').map(l => '+' + l).join('\n');
          } catch {}
        }
        // Get original (HEAD) content for side-by-side diff
        let original = '';
        try {
          original = execFileSync('git', ['show', `HEAD:${gitPath}`], { cwd: repoDir, encoding: 'utf8', timeout: 5000 });
        } catch {}
        // Get current working copy
        let modified = '';
        try {
          const resolved = path.resolve(repoDir, gitPath);
          modified = fs.readFileSync(resolved, 'utf8');
        } catch {}
        jsonResponse(res, cors, 200, { diff, original, modified, path: filePath });
      } catch (err) {
        jsonResponse(res, cors, 400, { error: err.message });
      }
      return;
    }

    // ─── GitHub PR endpoints ──────────────────────────────────────────

    if (req.method === 'GET' && parsedUrl.pathname === '/git/pr-info') {
      const { repoDir: prInfoDir } = getRepoDir(parsedUrl);
      try {
        const raw = execSync('gh pr view --json number,title,state,url,headRefName,baseRefName,author,reviewDecision', {
          cwd: prInfoDir, encoding: 'utf8', timeout: 10000,
        });
        const pr = JSON.parse(raw);
        jsonResponse(res, cors, 200, { pr: {
          number: pr.number,
          title: pr.title,
          state: pr.state,
          url: pr.url,
          branch: pr.headRefName,
          base: pr.baseRefName,
          author: (pr.author && pr.author.login) ? pr.author.login : String(pr.author || ''),
          reviewDecision: pr.reviewDecision || null,
        }});
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('ENOENT') || msg.includes('executable not found')) {
          jsonResponse(res, cors, 200, { pr: null, ghMissing: true });
        } else {
          jsonResponse(res, cors, 200, { pr: null, error: msg.split('\n')[0] });
        }
      }
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/git/pr-comments') {
      const prNumber = parsedUrl.searchParams.get('pr');
      if (!prNumber) { jsonResponse(res, cors, 400, { error: 'Missing pr parameter' }); return; }
      if (!/^\d+$/.test(prNumber)) { jsonResponse(res, cors, 400, { error: 'Invalid pr parameter' }); return; }
      const { repoDir: prCommentsDir } = getRepoDir(parsedUrl);
      try {
        // Resolve owner/repo from gh CLI
        let repo = null;
        try {
          repo = execSync("gh repo view --json owner,name --jq '.owner.login + \"/\" + .name'", {
            cwd: prCommentsDir, encoding: 'utf8', timeout: 10000,
          }).trim();
        } catch {}

        if (!repo) {
          jsonResponse(res, cors, 200, { error: 'Could not determine repository', threads: [], generalComments: [], reviews: [] });
          return;
        }

        // Inline review comments
        let reviewComments = [];
        try {
          const raw = execSync(`gh api repos/${repo}/pulls/${prNumber}/comments --paginate`, {
            cwd: PROJECT_DIR, encoding: 'utf8', timeout: 30000,
          });
          reviewComments = JSON.parse(raw);
          if (reviewComments.length > 500) reviewComments = reviewComments.slice(0, 500);
        } catch {}

        // General PR conversation comments
        let generalComments = [];
        try {
          const raw = execSync(`gh api repos/${repo}/issues/${prNumber}/comments --paginate`, {
            cwd: PROJECT_DIR, encoding: 'utf8', timeout: 30000,
          });
          generalComments = JSON.parse(raw).map(function(c) {
            return {
              id: c.id,
              body: c.body,
              author: (c.user && c.user.login) ? c.user.login : '',
              createdAt: c.created_at,
              updatedAt: c.updated_at,
              url: c.html_url,
            };
          });
        } catch {}

        // Reviews (APPROVED / CHANGES_REQUESTED / etc.)
        let reviews = [];
        try {
          const raw = execSync(`gh api repos/${repo}/pulls/${prNumber}/reviews`, {
            cwd: PROJECT_DIR, encoding: 'utf8', timeout: 15000,
          });
          reviews = JSON.parse(raw).map(function(r) {
            return {
              id: r.id,
              state: r.state,
              body: r.body || '',
              author: (r.user && r.user.login) ? r.user.login : '',
              submittedAt: r.submitted_at,
            };
          }).filter(function(r) { return r.state !== 'COMMENTED' || r.body; });
        } catch {}

        // Thread inline comments: group by path + line + review_id
        const commentMap = {};
        for (const c of reviewComments) commentMap[c.id] = c;

        const threadMap = {};
        const rootComments = reviewComments.filter(function(c) { return !c.in_reply_to_id; });
        for (const c of rootComments) {
          const tid = String(c.pull_request_review_id) + ':' + c.path + ':' + (c.line || c.original_line || 0);
          if (!threadMap[tid]) {
            threadMap[tid] = {
              threadId: tid,
              file: c.path,
              line: c.line || c.original_line || 0,
              startLine: c.start_line || c.line || c.original_line || 0,
              diffHunk: c.diff_hunk || '',
              resolved: false,
              comments: [],
            };
          }
          threadMap[tid].comments.push({
            id: c.id,
            author: (c.user && c.user.login) ? c.user.login : '',
            body: c.body,
            createdAt: c.created_at,
            url: c.html_url,
            isReply: false,
          });
        }

        // Attach replies
        const replyComments = reviewComments.filter(function(c) { return !!c.in_reply_to_id; });
        for (const c of replyComments) {
          const parent = commentMap[c.in_reply_to_id];
          if (!parent) continue;
          const tid = String(parent.pull_request_review_id) + ':' + parent.path + ':' + (parent.line || parent.original_line || 0);
          if (threadMap[tid]) {
            threadMap[tid].comments.push({
              id: c.id,
              author: (c.user && c.user.login) ? c.user.login : '',
              body: c.body,
              createdAt: c.created_at,
              url: c.html_url,
              isReply: true,
            });
          }
        }

        const threads = Object.values(threadMap).sort(function(a, b) {
          return a.file.localeCompare(b.file) || a.line - b.line;
        });

        jsonResponse(res, cors, 200, { pr: parseInt(prNumber), threads, generalComments, reviews });
      } catch (err) {
        const msg = err.message || '';
        if (msg.includes('ENOENT') || msg.includes('executable not found')) {
          jsonResponse(res, cors, 200, { error: 'gh CLI not installed', ghMissing: true, threads: [], generalComments: [], reviews: [] });
        } else {
          jsonResponse(res, cors, 200, { error: msg.split('\n')[0], threads: [], generalComments: [], reviews: [] });
        }
      }
      return;
    }

    // ─── Permission approval endpoints ─────────────────────────

    // POST /pre-tool-use — relay posts permission request
    if (req.method === 'POST' && parsedUrl.pathname === '/pre-tool-use') {
      loadSettingsCache(); // Refresh from disk so CLI flag changes take effect immediately
      const body = await readBody(req);
      let params;
      try { params = JSON.parse(body); } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { tool, command, sessionId: claudeSessionId } = params;

      // Fast path: deny first (CC evaluates deny before any allow/hook
      // decision), then settings allowlist, then CC's built-in read-only
      // classifier — so read-only commands the CLI auto-approves (ls, cat,
      // grep, read-only git forms, read-only tools) never reach a card.
      if (matchesPermission(command, settingsCache.deny)) {
        jsonResponse(res, cors, 200, { id: randomUUID(), status: 'denied' });
        return;
      }
      if (matchesPermission(command, settingsCache.allow) ||
          isCcReadOnlyAutoApprovable(tool, { command })) {
        jsonResponse(res, cors, 200, { id: randomUUID(), status: 'allowed' });
        return;
      }

      // Pending — store and broadcast
      const id = randomUUID();
      permissionRequests.set(id, {
        id, tool, command, sessionId: claudeSessionId, decision: null, createdAt: Date.now(),
      });

      // Find most-recently-active running session for routing
      let activeStore = null;
      let activeSessionId = null;
      for (const [sid, store] of sessions) {
        if (store.chatSession && store.chatSession.isRunning) {
          if (!activeStore || store.lastActivityAt > activeStore.lastActivityAt) {
            activeStore = store;
            activeSessionId = sid;
          }
        }
      }

      broadcast({
        type: 'permission-request',
        id,
        tool: tool || 'Bash',
        command: command || '',
        sessionId: activeSessionId,
      });

      jsonResponse(res, cors, 200, { id, status: 'pending' });
      return;
    }

    // GET /chat/permission/:id — relay polls for decision
    if (req.method === 'GET' && parsedUrl.pathname.startsWith('/chat/permission/')) {
      const id = parsedUrl.pathname.split('/').pop();
      const entry = permissionRequests.get(id);

      if (!entry) {
        jsonResponse(res, cors, 200, { status: 'not_found' });
        return;
      }
      if (entry.decision === null) {
        jsonResponse(res, cors, 200, { status: 'pending' });
        return;
      }

      const decision = entry.decision;
      permissionRequests.delete(id);

      broadcast({
        type: 'permission-resolved',
        id,
        decision,
      });

      jsonResponse(res, cors, 200, { status: decision });
      return;
    }

    // POST /chat/permission — browser submits decision
    if (req.method === 'POST' && parsedUrl.pathname === '/chat/permission') {
      const body = await readBody(req);
      let params;
      try { params = JSON.parse(body); } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { id, decision, persist, command } = params;
      const entry = permissionRequests.get(id);
      if (!entry) {
        jsonResponse(res, cors, 404, { error: 'Permission request not found' });
        return;
      }

      entry.decision = decision;

      if (persist && command) {
        persistPermission(command, decision);
      }

      jsonResponse(res, cors, 200, { ok: true });
      return;
    }

    // ─── Gate state endpoint ────────────────────────────────────────

    // GET /gate-state — returns current gate state from .shards/gates/state.json
    if (req.method === 'GET' && parsedUrl.pathname === '/gate-state') {
      const gateStatePath = path.join(SHARDS_DIR, 'gates', 'state.json');
      try {
        const raw = fs.readFileSync(gateStatePath, 'utf8');
        // Collapse the v2 per-session map (or legacy single slot) to the flat
        // gate object the browser expects. Contract unchanged.
        jsonResponse(res, cors, 200, reduceGateState(JSON.parse(raw)));
      } catch {
        jsonResponse(res, cors, 200, { open: false, history: [] });
      }
      return;
    }

    // GET /gate-state-stream — SSE channel pushing gate-state / gate-block /
    // auto-state events on file change. Browser uses this in place of the
    // legacy 2s poll (Bug H2 + H5 in the integration audit). On connect we
    // immediately send the current gate-state so the client doesn't need a
    // second /gate-state request to seed initial state.
    if (req.method === 'GET' && parsedUrl.pathname === '/gate-state-stream') {
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('data: {"type":"connected"}\n\n');
      // Seed initial gate state for this client only — broadcast helpers
      // append to all subscribers, but a fresh subscriber needs the snapshot
      // before its first change event arrives.
      const initial = readGateStateFile() || { open: false, history: [] };
      try { res.write(`data: ${JSON.stringify({ type: 'gate-state', state: initial })}\n\n`); } catch {}
      gateClients.push({ res });
      req.on('close', () => {
        gateClients = gateClients.filter((c) => c.res !== res);
      });
      return;
    }

    // GET /gate-mode — returns enforcement flags as the UI server sees them.
    // The Claude Code hook process runs in a different env; if the user only
    // exports SHARDS_GATE_ENFORCE=0 to CC without also exporting it to the UI
    // server, this endpoint will still report enforcement on. The browser
    // surfaces a banner reflecting whatever the server reports — accurate for
    // the common case where both processes are launched from the same shell.
    if (req.method === 'GET' && parsedUrl.pathname === '/gate-mode') {
      jsonResponse(res, cors, 200, {
        enforce: GATE_ENFORCE,
        checkpointEnforce: CHECKPOINT_ENFORCE,
        autoVerify: AUTO_VERIFY,
      });
      return;
    }

    // ─── Permissions management endpoints ──────────────────────────

    // GET /permissions — return current allow/deny lists + available presets
    if (req.method === 'GET' && parsedUrl.pathname === '/permissions') {
      loadSettingsCache();
      jsonResponse(res, cors, 200, {
        allow: settingsCache.allow,
        deny: settingsCache.deny,
        presets: {
          permissive: [
            ...READONLY_PRESET,
            'Bash(python:*)', 'Bash(python3:*)', 'Bash(node:*)',
            'Bash(npm:*)', 'Bash(pip:*)', 'Bash(pip3:*)',
          ],
          readonly: [...READONLY_PRESET],
        },
      });
      return;
    }

    // POST /permissions — update allow list
    if (req.method === 'POST' && parsedUrl.pathname === '/permissions') {
      const body = await readBody(req);
      let params;
      try { params = JSON.parse(body); } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const settingsPath = path.join(PROJECT_DIR, '.claude', 'settings.json');
      let settings = {};
      try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}

      if (!settings.permissions) settings.permissions = {};
      if (!settings.permissions.allow) settings.permissions.allow = [];

      // params.add: array of patterns to add
      if (Array.isArray(params.add)) {
        for (const p of params.add) {
          if (typeof p === 'string' && p.trim() && !settings.permissions.allow.includes(p.trim())) {
            settings.permissions.allow.push(p.trim());
          }
        }
      }

      // params.remove: array of patterns to remove
      if (Array.isArray(params.remove)) {
        const toRemove = new Set(params.remove.map(p => (typeof p === 'string' ? p.trim() : '')));
        settings.permissions.allow = settings.permissions.allow.filter(p => !toRemove.has(p));
      }

      // params.set: replace the entire allow list
      if (Array.isArray(params.set)) {
        settings.permissions.allow = params.set.filter(p => typeof p === 'string' && p.trim());
      }

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      loadSettingsCache();

      jsonResponse(res, cors, 200, { ok: true, allow: settingsCache.allow });
      return;
    }

    // ─── P2: Event endpoint with ack ────────────────────────────
    if (req.method === 'POST' && parsedUrl.pathname === '/event') {
      const body = await readBody(req);
      const result = handleEvent(body);
      jsonResponse(res, cors, 200, result);
      return;
    }

    // ─── Chat endpoints ─────────────────────────────────────────────

    if (req.method === 'GET' && parsedUrl.pathname === '/agents') {
      jsonResponse(res, cors, 200, listAgents());
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/api/skills') {
      jsonResponse(res, cors, 200, listSkills());
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/chat/status') {
      const activeSessions = [];
      for (const [id, store] of sessions) {
        if (store.chatSession && store.chatSession.isRunning) {
          activeSessions.push({
            sessionId: id,
            agent: store.agent,
            title: store.title,
            transcript: store.transcript,
            startedAt: store.createdAt.toISOString(),
            projectName: store.projectName,
            projectDir: store.projectDir,
          });
        }
      }
      jsonResponse(res, cors, 200, { sessions: activeSessions });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/chat/start') {
      const body = await readBody(req);
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { agent, permissionMode, sessionId: callerSessionId, initialMessage,
              resumeSessionId, model } = params;

      // agent is optional — null/omitted starts a plain session.
      if (agent) {
        const agentFile = path.join(AGENTS_DIR, `${agent}.md`);
        if (!fs.existsSync(agentFile)) {
          jsonResponse(res, cors, 404, { error: `Agent "${agent}" not found` });
          return;
        }
      }

      // Validate resume target. We allow resuming only sessions that have
      // ended or been abandoned — resuming a session whose process is still
      // believed to be live would race with the existing CLI on --session-id.
      if (resumeSessionId) {
        const entry = sessionIndex.getEntry(SESSIONS_DIR, resumeSessionId);
        if (!entry) {
          jsonResponse(res, cors, 404, { error: `Resume target "${resumeSessionId}" not found in session index` });
          return;
        }
        if (entry.status === 'active') {
          const live = sessions.get(resumeSessionId);
          if (live && live.chatSession && live.chatSession.isRunning) {
            jsonResponse(res, cors, 409, { error: 'Resume target is still active. End it first.' });
            return;
          }
        }
      }

      log(`/chat/start requested for agent="${agent || '(plain)'}"${resumeSessionId ? ` resume="${resumeSessionId}"` : ''}`);
      const result = startNewChatSession(agent || null, {
        permissionMode, callerSessionId, initialMessage, resumeSessionId, model,
      });
      jsonResponse(res, cors, 200, result);
      return;
    }

    // ─── Permission mode switch ─────────────────────────────────────────────
    if (req.method === 'POST' && parsedUrl.pathname === '/chat/mode') {
      const body = await readBody(req);
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { sessionId: targetSessionId, mode } = params;
      const validModes = ['default', 'acceptEdits', 'plan'];
      if (!mode || !validModes.includes(mode)) {
        jsonResponse(res, cors, 400, { error: `Invalid mode. Use one of: ${validModes.join(', ')}` });
        return;
      }

      const store = targetSessionId ? getSession(targetSessionId) : null;
      if (store && store.chatSession && store.chatSession.isRunning) {
        const agent = store.agent;
        broadcast({ type: 'chat-system-notice', text: 'Switching to **' + mode + '** mode…', sessionId: targetSessionId });
        const result = startNewChatSession(agent, { callerSessionId: targetSessionId, resumeSessionId: targetSessionId, permissionMode: mode });
        jsonResponse(res, cors, 200, { ok: true, switched: true, agent: result.agent, sessionId: result.sessionId });
      } else {
        // No active session — mode will be applied on next session start
        jsonResponse(res, cors, 200, { ok: true, deferred: true });
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/chat/send') {
      const body = await readBody(req);
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { message, sessionId: targetSessionId, attachments: rawAttachments } = params;
      const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];
      if (!message && attachments.length === 0) {
        jsonResponse(res, cors, 400, { error: 'Missing message parameter' });
        return;
      }

      // ─── Attachment validation ──────────────────────────────
      // Mirrors the client-side checks in chat.js so we don't ship malformed
      // image blocks to the Claude CLI. Anthropic's Messages API rejects
      // unsupported MIME types and oversize payloads; better to fail fast here
      // with a clear error than to surface an opaque CLI error mid-turn.
      const ATTACH_MAX_COUNT = 5;
      const ATTACH_MAX_BYTES = 5 * 1024 * 1024;
      const ATTACH_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
      if (attachments.length > ATTACH_MAX_COUNT) {
        jsonResponse(res, cors, 400, { error: `Too many attachments (max ${ATTACH_MAX_COUNT}).` });
        return;
      }
      for (const a of attachments) {
        if (!a || typeof a !== 'object') {
          jsonResponse(res, cors, 400, { error: 'Invalid attachment entry' });
          return;
        }
        if (!ATTACH_ALLOWED_MIME.has(a.mediaType)) {
          jsonResponse(res, cors, 400, { error: `Unsupported attachment mediaType: ${a.mediaType}` });
          return;
        }
        if (typeof a.dataBase64 !== 'string' || a.dataBase64.length === 0) {
          jsonResponse(res, cors, 400, { error: 'Attachment missing dataBase64' });
          return;
        }
        // Decoded size = ceil(base64_len * 3 / 4) - padding
        const padding = a.dataBase64.endsWith('==') ? 2 : a.dataBase64.endsWith('=') ? 1 : 0;
        const decodedBytes = Math.floor(a.dataBase64.length * 3 / 4) - padding;
        if (decodedBytes > ATTACH_MAX_BYTES) {
          jsonResponse(res, cors, 400, { error: 'Attachment exceeds 5MB limit' });
          return;
        }
      }

      // ─── Slash command interception ─────────────────────────
      const slashCmd = parseSlashCommand(message);

      if (slashCmd) {
        if (slashCmd.type === 'agent') {
          const toAgent = slashCmd.agent;
          const agentFile = path.join(AGENTS_DIR, `${toAgent}.md`);
          if (!fs.existsSync(agentFile)) {
            jsonResponse(res, cors, 404, { error: `Agent "${toAgent}" not found` });
            return;
          }

          // Find caller's current session to get fromAgent
          const callerStore = targetSessionId ? getSession(targetSessionId) : null;
          const fromAgent = callerStore ? callerStore.agent : null;

          broadcast({ type: 'chat-agent-switching', from: fromAgent, to: toAgent, sessionId: targetSessionId });
          const result = startNewChatSession(toAgent, { callerSessionId: targetSessionId });
          jsonResponse(res, cors, 200, { ok: true, switched: true, agent: result.agent, sessionId: result.sessionId });
          return;
        }

        if (slashCmd.command === 'stop') {
          const store = targetSessionId ? getSession(targetSessionId) : null;
          if (store && store.chatSession && store.chatSession.isRunning) {
            store.chatSession.stop();
          }
          jsonResponse(res, cors, 200, { ok: true, stopped: true });
          return;
        }

        if (slashCmd.command === 'help') {
          const agents = listAgents();
          let helpText = '**Available Commands**\n\n';
          helpText += '**Agents:**\n';
          for (const a of agents) {
            helpText += `  \`/${a.name}\` — ${a.description || 'Switch to ' + a.name}\n`;
          }
          helpText += '\n**Utility:**\n';
          helpText += '  `/compact` — Summarize conversation to free up context\n';
          helpText += '  `/stop` — Stop the current session\n';
          helpText += '  `/clear` — Clear the messages panel\n';
          helpText += '  `/help` — Show this help message\n';
          helpText += '\n**Claude Code:**\n';
          helpText += '  `/init` — Initialize a CLAUDE.md file\n';
          helpText += '  `/exit` — End the current session\n';
          helpText += '  `/context` — Show token usage (terminal only)\n';
          helpText += '  `/rewind` — Restore to previous point (terminal only)\n';
          helpText += '  `/config` — Open settings panel\n';
          helpText += '  `/model <name>` — Change the active LLM model\n';
          helpText += '  `/effort <level>` — Set compute intensity (low/medium/high)\n';
          helpText += '  `/mode` — Cycle permission mode (Shift+Tab)\n';
          broadcast({ type: 'chat-system-notice', text: helpText, sessionId: targetSessionId });
          jsonResponse(res, cors, 200, { ok: true, help: true });
          return;
        }

        if (slashCmd.command === 'clear') {
          broadcast({ type: 'chat-clear-messages', sessionId: targetSessionId });
          jsonResponse(res, cors, 200, { ok: true, cleared: true });
          return;
        }
      }

      // ─── Claude Code built-in command handling ─────────────
      if (slashCmd && slashCmd.type === 'builtin') {
        if (slashCmd.command === 'exit') {
          const store = targetSessionId ? getSession(targetSessionId) : null;
          if (store && store.chatSession && store.chatSession.isRunning) {
            store.chatSession.stop();
          }
          jsonResponse(res, cors, 200, { ok: true, stopped: true });
          return;
        }

        if (slashCmd.command === 'model') {
          if (!slashCmd.args) {
            broadcast({ type: 'chat-system-notice', text: 'Usage: `/model <model-name>` — e.g., `/model claude-sonnet-4-6`', sessionId: targetSessionId });
            jsonResponse(res, cors, 200, { ok: true });
            return;
          }
          const store = targetSessionId ? getSession(targetSessionId) : null;
          if (store && store.chatSession && store.chatSession.isRunning) {
            const agent = store.agent;
            broadcast({ type: 'chat-system-notice', text: 'Switching model to `' + slashCmd.args + '`…', sessionId: targetSessionId });
            const result = startNewChatSession(agent, { callerSessionId: targetSessionId, resumeSessionId: targetSessionId, model: slashCmd.args });
            jsonResponse(res, cors, 200, { ok: true, switched: true, agent: result.agent, sessionId: result.sessionId });
          } else {
            broadcast({ type: 'chat-system-notice', text: 'No active session. Start a session first.', sessionId: targetSessionId });
            jsonResponse(res, cors, 200, { ok: true });
          }
          return;
        }
      }

      // ─── Regular message send ───────────────────────────────
      // Find the target session
      let store = targetSessionId ? getSession(targetSessionId) : null;
      if (!store) {
        // Fall back to most recently active session
        for (const s of sessions.values()) {
          if (s.chatSession && s.chatSession.isRunning) {
            if (!store || s.lastActivityAt > store.lastActivityAt) store = s;
          }
        }
      }
      if (!store || !store.chatSession || !store.chatSession.isRunning) {
        jsonResponse(res, cors, 400, { error: 'No active chat session' });
        return;
      }

      try {
        store.chatSession.send(message, attachments);
        const agent = store.agent;
        // Transcript-form attachments mirror the wire format. We keep
        // dataBase64 so the chat history can re-render thumbnails on reload;
        // the alternative (writing files to .shards/sessions/<id>/attachments/)
        // is worth doing only if transcript sizes start to bite.
        const transcriptAttachments = attachments.map((a) => ({
          mediaType: a.mediaType,
          dataBase64: a.dataBase64,
          name: a.name,
          sizeBytes: a.sizeBytes,
        }));
        const transcriptEntry = { role: 'user', content: message, agent, source: 'chat' };
        if (transcriptAttachments.length > 0) transcriptEntry.attachments = transcriptAttachments;
        store.transcript.push(transcriptEntry);
        store.save();
        try {
          sessionIndex.updateActivity(SESSIONS_DIR, store.sessionId, {
            lastUserPrompt: message,
            messageCount: store.transcript.length,
            projectName: store.projectName,
            projectDir: store.projectDir,
          });
        } catch (err) {
          log(`session-index updateActivity failed: ${err.message}`);
        }
        const broadcastMsg = { type: 'chat-user-message', content: message, agent, sessionId: store.sessionId };
        if (transcriptAttachments.length > 0) broadcastMsg.attachments = transcriptAttachments;
        broadcast(broadcastMsg);
        jsonResponse(res, cors, 200, { ok: true });
      } catch (err) {
        jsonResponse(res, cors, 500, { error: err.message });
      }
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/chat/rename') {
      const body = await readBody(req);
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { sessionId: renameSessionId, title } = params;
      if (!renameSessionId) {
        jsonResponse(res, cors, 400, { error: 'Missing sessionId' });
        return;
      }

      const renameStore = getSession(renameSessionId);
      if (renameStore) {
        renameStore.title = title || null;
        renameStore.save();
      }

      jsonResponse(res, cors, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/chat/end') {
      const body = await readBody(req);
      let params = {};
      try { params = JSON.parse(body); } catch {}
      const { sessionId: endSessionId } = params;
      if (!endSessionId) {
        jsonResponse(res, cors, 400, { error: 'Missing sessionId' });
        return;
      }

      const store = getSession(endSessionId);
      const snap = readGateSnapshot(SHARDS_DIR);

      // Stop the CLI if still running. We intentionally do not mutate
      // .shards/gates/state.json — gates are project-scoped state and may
      // still be legitimately open for a future resume of this same project.
      if (store && store.chatSession && store.chatSession.isRunning) {
        try { store.chatSession.stop(); } catch (err) { log(`/chat/end stop failed: ${err.message}`); }
      }

      let entry = null;
      try {
        entry = sessionIndex.markEnded(SESSIONS_DIR, endSessionId, {
          gateOpenAtEnd: snap.gateOpenAtEnd,
          reason: 'user_ended',
        });
        if (typeof snap.phase === 'number') {
          sessionIndex.updatePhase(SESSIONS_DIR, endSessionId, snap.phase);
        }
      } catch (err) {
        log(`session-index markEnded failed: ${err.message}`);
      }

      broadcast({ type: 'chat-ended', sessionId: endSessionId, code: 0, ended: true });
      jsonResponse(res, cors, 200, { ok: true, entry });
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/chat/stop') {
      const body = await readBody(req);
      let params = {};
      try { params = JSON.parse(body); } catch {}

      const targetSessionId = params.sessionId;
      const store = targetSessionId ? getSession(targetSessionId) : null;

      if (store && store.chatSession && store.chatSession.isRunning) {
        store.chatSession.stop();
        jsonResponse(res, cors, 200, { ok: true });
      } else {
        // Stop the most recently active session
        let active = null;
        for (const s of sessions.values()) {
          if (s.chatSession && s.chatSession.isRunning) {
            if (!active || s.lastActivityAt > active.lastActivityAt) active = s;
          }
        }
        if (active) {
          active.chatSession.stop();
          jsonResponse(res, cors, 200, { ok: true });
        } else {
          jsonResponse(res, cors, 200, { ok: true, note: 'No active session' });
        }
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  };
}

function startServer(portIndex, resolve, reject) {
  if (portIndex >= PORTS.length) {
    const msg = 'Shards UI: all ports in use (7842-7845)';
    if (reject) { reject(new Error(msg)); return; }
    console.error(msg);
    process.exit(1);
  }

  const port = PORTS[portIndex];
  const handler = createHandler();

  // P5: Create HTTPS server if TLS cert/key are provided
  let server;
  let protocol = 'http';
  if (TLS_CERT && TLS_KEY) {
    try {
      const tlsOptions = {
        cert: fs.readFileSync(TLS_CERT),
        key: fs.readFileSync(TLS_KEY),
      };
      server = https.createServer(tlsOptions, handler);
      protocol = 'https';
    } catch (err) {
      const msg = `Shards UI: Failed to load TLS cert/key: ${err.message}`;
      if (reject) { reject(new Error(msg)); return; }
      console.error(msg);
      process.exit(1);
    }
  } else {
    server = http.createServer(handler);
  }

  // P5: Warn if binding to 0.0.0.0 without TLS
  if (BIND_ADDR === '0.0.0.0' && protocol === 'http') {
    console.warn('WARNING: Binding to 0.0.0.0 without TLS. All traffic is unencrypted. Use SHARDS_TLS_CERT and SHARDS_TLS_KEY for secure transport, or use a reverse proxy.');
  }

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      startServer(portIndex + 1, resolve, reject);
    } else {
      const msg = 'Shards UI server error: ' + e.message;
      if (reject) { reject(new Error(msg)); return; }
      console.error(msg);
      process.exit(1);
    }
  });

  server.listen(port, BIND_ADDR, () => {
    fs.mkdirSync(SHARDS_DIR, { recursive: true });
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });

    // P1: Write port file as JSON with auth token
    try {
      fs.writeFileSync(PORT_FILE, JSON.stringify({ port, token: AUTH_TOKEN }));
      fs.writeFileSync(PID_FILE, String(process.pid));
    } catch {}

    console.log(`Shards UI server running on ${protocol}://${BIND_ADDR === '0.0.0.0' ? 'localhost' : BIND_ADDR}:${port}`);

    // P4: Reconnect to orphaned sessions or clean up
    reconnectOrCleanup(SESSIONS_DIR, sessions, SessionStore, handleChatEvent, handleChatExit, PROJECT_DIR);

    // Sweep stale active sessions in INDEX.json. Anything reconnected above
    // is back in the in-memory map; anything that wasn't and is past the
    // abandonment window gets reclassified so the picker can show it as
    // such instead of a phantom "active" row.
    try {
      const swept = sessionIndex.sweepAbandoned(SESSIONS_DIR);
      if (swept > 0) log(`session-index: reclassified ${swept} stale active sessions as abandoned`);
    } catch (err) {
      log(`session-index sweep failed: ${err.message}`);
    }

    // Initial file scan then poll
    pollFiles();

    // Start gate / auto / violations watchers (replaces browser-side 2s poll)
    startGateWatchers();

    // Build symbol index asynchronously (reference cache is built lazily on hover)
    setTimeout(() => {
      try {
        symbolIndex.buildIndex(PROJECT_DIR, log);
        symbolIndex.startWatcher(PROJECT_DIR, log);
        log(`Symbol index ready: ${symbolIndex.getStatus().symbolCount} symbols from ${symbolIndex.getStatus().fileCount} files`);
      } catch (err) {
        log(`Symbol index build failed: ${err.message}`);
      }
    }, 100);

    // Resolve the promise for createServer callers
    if (resolve) {
      resolve({
        port,
        authToken: AUTH_TOKEN,
        httpServer: server,
        shutdown: () => {
          server.close();
          cleanup();
        }
      });
    }
  });
}

// Clean up on exit — don't kill detached chat processes, they survive restarts
function cleanup() {
  symbolIndex.stopWatcher();
  stopGateWatchers();
  try { fs.unlinkSync(PORT_FILE); } catch {}
  try { fs.unlinkSync(PID_FILE); } catch {}
}
process.on('exit', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

// ─── Factory for Electron / programmatic use ────────────────────────────────

function createServer(projectDir, options = {}) {
  initPaths(projectDir, options);
  return new Promise((resolve, reject) => {
    startServer(0, resolve, reject);
  });
}

// Standalone mode — preserves existing CLI behavior
if (require.main === module) {
  startServer(0);
}

module.exports = { createServer };
