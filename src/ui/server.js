#!/usr/bin/env node

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { ChatSession, reconnectOrCleanup } = require('./chat-session');

const PROJECT_DIR = process.cwd();
const SHARDS_DIR = path.join(PROJECT_DIR, '.shards');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');
const PID_FILE = path.join(SHARDS_DIR, 'ui.pid');
const LOG_FILE = path.join(SHARDS_DIR, 'ui.log');
const AGENTS_DIR = path.join(PROJECT_DIR, '.claude', 'agents');
const COMMANDS_DIR = path.join(PROJECT_DIR, '.claude', 'commands');
const SESSIONS_DIR = path.join(SHARDS_DIR, 'sessions');
const INDEX_HTML = path.join(__dirname, 'index.html');

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

const PORTS = [7842, 7843, 7844, 7845];
const OUTPUT_DIRS = ['analysis', 'studies', 'models', 'services', 'research', 'dashboards', 'brainstorm', 'data_models'];

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
    this.transcript = [];
    this.sessionFiles = new Set();
    this.chatSession = null;
    this.createdAt = new Date();
    this.lastActivityAt = new Date();
  }

  touch() {
    this.lastActivityAt = new Date();
  }
}

const sessions = new Map(); // sessionId -> SessionStore
const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s) s.touch();
  return s || null;
}

function expireSessions() {
  const now = Date.now();
  for (const [id, store] of sessions) {
    if (now - store.lastActivityAt.getTime() > SESSION_EXPIRY_MS) {
      log(`Expiring session ${id} (agent=${store.agent})`);
      if (store.chatSession && store.chatSession.isRunning) {
        store.chatSession.stop();
      }
      sessions.delete(id);
    }
  }
}

setInterval(expireSessions, 60_000);

// ─── State ───────────────────────────────────────────────────────────────────

let clients = [];       // SSE response objects: { res, sessionId (optional filter) }
let files = {};         // relPath -> content

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
      if (store) store.transcript.push({ role: 'assistant', content: textContent, agent, source: 'chat' });
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
  const utilities = ['compact', 'stop', 'clear', 'help'];
  if (utilities.includes(cmd)) {
    return { type: 'utility', command: cmd };
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
  const { resumeSessionId, permissionMode, callerSessionId } = options;

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

  try {
    chatSess.send(activationPrompt);
  } catch (err) {
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
        res.writeHead(200, { ...cors, 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(500);
        res.end('index.html not found');
      }
      return;
    }

    // Static file serving (JS/CSS) — no auth (public assets)
    if (req.method === 'GET') {
      const MIME = { '.js': 'application/javascript', '.css': 'text/css' };
      const ext = path.extname(parsedUrl.pathname);
      if (MIME[ext]) {
        const filePath = path.join(__dirname, decodeURIComponent(parsedUrl.pathname));
        const resolved = path.resolve(filePath);
        if (!resolved.startsWith(__dirname)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        try {
          const content = fs.readFileSync(resolved, 'utf8');
          res.writeHead(200, { ...cors, 'Content-Type': MIME[ext] });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not found');
        }
        return;
      }
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

      if (parsedUrl.pathname === '/browse') {
        let dir = parsedUrl.searchParams.get('dir') || PROJECT_DIR;
        dir = path.resolve(dir);

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
        const resolved = path.resolve(filePath);
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

      const resolved = path.resolve(filePath);
      try {
        fs.writeFileSync(resolved, content, 'utf8');
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

      const resolved = path.resolve(filePath);
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
      // Find the most recently active session
      let activeStore = null;
      for (const store of sessions.values()) {
        if (store.chatSession && store.chatSession.isRunning) {
          if (!activeStore || store.lastActivityAt > activeStore.lastActivityAt) {
            activeStore = store;
          }
        }
      }
      if (activeStore) {
        jsonResponse(res, cors, 200, { active: true, ...activeStore.chatSession.info });
      } else {
        jsonResponse(res, cors, 200, { active: false });
      }
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

      const { agent, permissionMode, sessionId: callerSessionId } = params;
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
      const result = startNewChatSession(agent, { permissionMode, callerSessionId });
      jsonResponse(res, cors, 200, result);
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

          broadcast({ type: 'chat-agent-switching', from: fromAgent, to: toAgent });
          const result = startNewChatSession(toAgent, { callerSessionId: targetSessionId });
          jsonResponse(res, cors, 200, { ok: true, switched: true, agent: result.agent, sessionId: result.sessionId });
          return;
        }

        if (slashCmd.command === 'compact') {
          // Find the active session to compact
          const store = targetSessionId ? getSession(targetSessionId) : null;
          if (!store || !store.chatSession || !store.chatSession.isRunning) {
            jsonResponse(res, cors, 400, { error: 'No active chat session to compact' });
            return;
          }
          const oldSessionId = store.chatSession.sessionId;
          const agent = store.agent;
          broadcast({ type: 'chat-compacting', agent });
          const result = startNewChatSession(agent, { resumeSessionId: oldSessionId, callerSessionId: targetSessionId });
          jsonResponse(res, cors, 200, { ok: true, compacted: true, agent: result.agent, sessionId: result.sessionId });
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
          helpText += '  `/compact` — Restart session with fresh context\n';
          helpText += '  `/stop` — Stop the current session\n';
          helpText += '  `/clear` — Clear the messages panel\n';
          helpText += '  `/help` — Show this help message\n';
          broadcast({ type: 'chat-system-notice', text: helpText });
          jsonResponse(res, cors, 200, { ok: true, help: true });
          return;
        }

        if (slashCmd.command === 'clear') {
          broadcast({ type: 'chat-clear-messages' });
          jsonResponse(res, cors, 200, { ok: true, cleared: true });
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
        broadcast({ type: 'chat-user-message', content: message, agent, sessionId: store.sessionId });
        jsonResponse(res, cors, 200, { ok: true });
      } catch (err) {
        jsonResponse(res, cors, 500, { error: err.message });
      }
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

function startServer(portIndex) {
  if (portIndex >= PORTS.length) {
    console.error('Shards UI: all ports in use (7842-7845)');
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
      console.error(`Shards UI: Failed to load TLS cert/key: ${err.message}`);
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
      startServer(portIndex + 1);
    } else {
      console.error('Shards UI server error:', e.message);
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
  });
}

// Clean up on exit — don't kill detached chat processes, they survive restarts
function cleanup() {
  try { fs.unlinkSync(PORT_FILE); } catch {}
  try { fs.unlinkSync(PID_FILE); } catch {}
}
process.on('exit', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

startServer(0);
