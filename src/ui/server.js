#!/usr/bin/env node

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { randomUUID } = require('crypto');
const { ChatSession, reconnectOrCleanup } = require('./chat-session');
const symbolIndex = require('./symbol-index');
const { permissionPattern } = require('./permission-pattern');

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

// ─── P3: Session Store ──────────────────────────────────────────────────────

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

    // Attempt to load existing session data from disk
    try {
      const filePath = path.join(SESSIONS_DIR, `${sessionId}-transcript.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.transcript) this.transcript = data.transcript;
        if (data.title) this.title = data.title;
        if (data.createdAt) this.createdAt = new Date(data.createdAt);
        if (data.lastActivityAt) this.lastActivityAt = new Date(data.lastActivityAt);
      }
    } catch (e) {
      // Ignore errors loading session data — starts fresh
    }
  }

  touch() {
    this.lastActivityAt = new Date();
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

setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, req] of permissionRequests) {
    // Only clean up decided requests — never delete pending ones the user hasn't responded to
    if (req.decision !== null && req.createdAt < cutoff) permissionRequests.delete(id);
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

// ─── Broadcast ───────────────────────────────────────────────────────────────

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
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

function scanDir(dir, result) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath, result);
      } else {
        const relPath = path.relative(PROJECT_DIR, fullPath);
        const content = readFileSafe(fullPath);
        if (content !== null) result[relPath] = content;
      }
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

  const { eventType, seq, ...data } = payload;

  // Find the active session for relay events (use the most recently active session)
  let activeStore = null;
  let activeSessionId = null;
  for (const [id, store] of sessions) {
    if (store.chatSession && store.chatSession.isRunning) {
      if (!activeStore || store.lastActivityAt > activeStore.lastActivityAt) {
        activeStore = store;
        activeSessionId = id;
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
      if (activeStore) activeStore.sessionFiles.add(relPath);
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
  return agents;
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

    case 'chat-init':
      broadcast({ type: 'chat-init', sessionId });
      break;

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
  const agentNames = agents.map(a => a.name);
  if (agentNames.includes(cmd)) {
    return { type: 'agent', agent: cmd };
  }

  // Unknown slash command — pass through
  return null;
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

  // Read the command file for this agent
  const cmdFile = path.join(COMMANDS_DIR, `${agent}.md`);
  let activationPrompt;
  try {
    const raw = fs.readFileSync(cmdFile, 'utf8');
    activationPrompt = raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
  } catch {
    activationPrompt = `You are now activated as the ${agent} agent. Greet the user and display your activation menu.`;
  }

  // When a prompt is pre-supplied, skip the greeting and go straight to triage
  if (initialMessage) {
    activationPrompt = activationPrompt +
      '\n\nThe user has already provided their request upfront. **Skip the greeting and activation menu entirely.** Go directly to Phase 0 triage.' +
      '\n\nUser request:\n\n' + initialMessage;
  }

  try {
    chatSess.send(activationPrompt);
  } catch (err) {
    chatSess.stop();
    sessions.delete(sessionId);
    broadcast({ type: 'chat-error', error: `Activation failed: ${err.message}`, sessionId });
  }

  broadcast({ type: 'chat-started', agent, sessionId, autoActivated: true });
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
        });
      }
      jsonResponse(res, cors, 200, list);
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
          diff = execSync(`git diff -- ${JSON.stringify(gitPath)}`, { cwd: repoDir, encoding: 'utf8', timeout: 10000 });
        } catch {}
        if (!diff) {
          try {
            diff = execSync(`git diff --cached -- ${JSON.stringify(gitPath)}`, { cwd: repoDir, encoding: 'utf8', timeout: 10000 });
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
          original = execSync(`git show HEAD:${JSON.stringify(gitPath)}`, { cwd: repoDir, encoding: 'utf8', timeout: 5000 });
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

      // Fast path: check settings cache
      if (matchesPermission(command, settingsCache.allow)) {
        jsonResponse(res, cors, 200, { id: randomUUID(), status: 'allowed' });
        return;
      }
      if (matchesPermission(command, settingsCache.deny)) {
        jsonResponse(res, cors, 200, { id: randomUUID(), status: 'denied' });
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
        jsonResponse(res, cors, 200, JSON.parse(raw));
      } catch {
        jsonResponse(res, cors, 200, { open: false, history: [] });
      }
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

      const { agent, permissionMode, sessionId: callerSessionId, initialMessage } = params;
      if (!agent) {
        jsonResponse(res, cors, 400, { error: 'Missing agent parameter' });
        return;
      }

      const agentFile = path.join(AGENTS_DIR, `${agent}.md`);
      if (!fs.existsSync(agentFile)) {
        jsonResponse(res, cors, 404, { error: `Agent "${agent}" not found` });
        return;
      }

      log(`/chat/start requested for agent="${agent}"`);
      const result = startNewChatSession(agent, { permissionMode, callerSessionId, initialMessage });
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
        const result = startNewChatSession(agent, { callerSessionId: targetSessionId, permissionMode: mode });
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

      const { message, sessionId: targetSessionId } = params;
      if (!message) {
        jsonResponse(res, cors, 400, { error: 'Missing message parameter' });
        return;
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
        if (slashCmd.command === 'context') {
          broadcast({ type: 'chat-system-notice', text: '`/context` is not available in the Shards UI. Use the terminal for token usage.', sessionId: targetSessionId });
          jsonResponse(res, cors, 200, { ok: true });
          return;
        }

        if (slashCmd.command === 'rewind') {
          broadcast({ type: 'chat-system-notice', text: '`/rewind` is not available in the Shards UI. Use the terminal for rewind support.', sessionId: targetSessionId });
          jsonResponse(res, cors, 200, { ok: true });
          return;
        }

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
            const result = startNewChatSession(agent, { callerSessionId: targetSessionId, model: slashCmd.args });
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
        store.chatSession.send(message);
        const agent = store.agent;
        store.transcript.push({ role: 'user', content: message, agent, source: 'chat' });
        store.save();
        broadcast({ type: 'chat-user-message', content: message, agent, sessionId: store.sessionId });
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

    // Initial file scan then poll
    pollFiles();

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
