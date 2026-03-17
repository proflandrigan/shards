#!/usr/bin/env node

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { ChatSession, cleanupStaleChat } = require('./chat-session');

const PROJECT_DIR = process.cwd();
const SHARDS_DIR = path.join(PROJECT_DIR, '.shards');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');
const PID_FILE = path.join(SHARDS_DIR, 'ui.pid');
const LOG_FILE = path.join(SHARDS_DIR, 'ui.log');
const AGENTS_DIR = path.join(PROJECT_DIR, '.claude', 'agents');
const COMMANDS_DIR = path.join(PROJECT_DIR, '.claude', 'commands');
const INDEX_HTML = path.join(__dirname, 'index.html');

// ─── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

const PORTS = [7842, 7843, 7844, 7845];
const OUTPUT_DIRS = ['analysis', 'studies', 'models', 'services', 'research', 'dashboards', 'brainstorm', 'data_models'];

// ─── State ───────────────────────────────────────────────────────────────────

let clients = [];       // SSE response objects
let transcript = [];    // { role, content, agent, source }
let files = {};         // relPath -> content
let sessionFiles = new Set();
let chatSession = null;

// ─── Broadcast ───────────────────────────────────────────────────────────────

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  clients = clients.filter((res) => {
    try {
      res.write(data);
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

  for (const [relPath, content] of Object.entries(current)) {
    if (files[relPath] !== content) {
      files[relPath] = content;
      broadcast({ type: 'artifact-updated', path: relPath, content, sessionFile: sessionFiles.has(relPath) });
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
    return;
  }

  const { eventType, ...data } = payload;

  switch (eventType) {
    case 'user-message':
      transcript.push({ role: 'user', content: data.content, agent: data.agent, source: 'observer' });
      broadcast({ type: 'user-message', content: data.content, agent: data.agent });
      break;
    case 'agent-message':
      transcript.push({ role: 'assistant', content: data.content, agent: data.agent, source: 'observer' });
      broadcast({ type: 'agent-message', content: data.content, agent: data.agent });
      break;
    case 'agent-activated':
      broadcast({ type: 'agent-activated', agent: data.agent });
      break;
    case 'agent-changed':
      broadcast({ type: 'agent-changed', from: data.from, to: data.to });
      break;
    case 'agent-consulting':
      broadcast({ type: 'agent-consulting', agent: data.agent });
      break;
    case 'event-log':
      broadcast({ type: 'event-log', text: data.text });
      break;
    case 'file-touched': {
      const relPath = path.relative(PROJECT_DIR, data.filePath);
      sessionFiles.add(relPath);
      broadcast({ type: 'file-touched', path: relPath });
      break;
    }
    case 'session-end':
      broadcast({ type: 'session-end' });
      sessionFiles = new Set();
      break;
  }
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
      // Extract text from content blocks
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
      const agent = chatSession ? chatSession.agent : 'unknown';
      transcript.push({ role: 'assistant', content: textContent, agent, source: 'chat' });
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
      // Broadcast stderr so auth errors and other issues are visible in the UI
      broadcast({ type: 'chat-stderr', text: event.text, sessionId });
      break;
  }
}

function handleChatExit({ code, sessionId }) {
  chatSession = null;
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
  const { resumeSessionId, permissionMode } = options;

  // Kill existing session if running
  if (chatSession && chatSession.isRunning) {
    chatSession.stop();
  }

  const sessionId = randomUUID();

  chatSession = new ChatSession({
    agent,
    sessionId,
    resumeSessionId,
    cwd: PROJECT_DIR,
    permissionMode: permissionMode || 'acceptEdits',
    onEvent: handleChatEvent,
    onExit: handleChatExit,
  });

  chatSession.start();

  // Read the command file for this agent — it contains the exact
  // activation prompt that slash commands use (persona, rules, greeting
  // instructions). Falls back to a generic prompt if no command file exists.
  const cmdFile = path.join(COMMANDS_DIR, `${agent}.md`);
  let activationPrompt;
  try {
    const raw = fs.readFileSync(cmdFile, 'utf8');
    // Strip YAML frontmatter — the model only needs the body
    activationPrompt = raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim();
  } catch {
    activationPrompt = `You are now activated as the ${agent} agent. Greet the user and display your activation menu.`;
  }

  try {
    chatSession.send(activationPrompt);
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

function createHandler() {
  return async (req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(200, cors);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/') {
      try {
        const html = fs.readFileSync(INDEX_HTML, 'utf8');
        res.writeHead(200, { ...cors, 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(500);
        res.end('index.html not found');
      }
      return;
    }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: {"type":"connected"}\n\n');
      clients.push(res);
      req.on('close', () => {
        clients = clients.filter((c) => c !== res);
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/transcript') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(transcript));
      return;
    }

    if (req.method === 'GET' && req.url === '/files') {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ files, sessionFiles: [...sessionFiles] }));
      return;
    }

    // ─── Directory browser endpoints ───────────────────────────────────

    if (req.method === 'GET' && req.url.startsWith('/browse')) {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === '/browse') {
        // List directory contents
        let dir = url.searchParams.get('dir') || PROJECT_DIR;
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
          // Sort: dirs first, then alphabetical
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

      if (url.pathname === '/browse/file') {
        // Read a single file
        const filePath = url.searchParams.get('path');
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
    if (req.method === 'POST' && req.url === '/browse/file/save') {
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
    if (req.method === 'POST' && req.url === '/browse/file/parse-csv') {
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

    if (req.method === 'POST' && req.url === '/event') {
      const body = await readBody(req);
      handleEvent(body);
      res.writeHead(200, cors);
      res.end('ok');
      return;
    }

    // ─── Chat endpoints ─────────────────────────────────────────────

    if (req.method === 'GET' && req.url === '/agents') {
      jsonResponse(res, cors, 200, listAgents());
      return;
    }

    if (req.method === 'GET' && req.url === '/chat/status') {
      if (chatSession && chatSession.isRunning) {
        jsonResponse(res, cors, 200, { active: true, ...chatSession.info });
      } else {
        jsonResponse(res, cors, 200, { active: false });
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/chat/start') {
      const body = await readBody(req);
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { agent, permissionMode } = params;
      if (!agent) {
        jsonResponse(res, cors, 400, { error: 'Missing agent parameter' });
        return;
      }

      // Validate agent exists
      const agentFile = path.join(AGENTS_DIR, `${agent}.md`);
      if (!fs.existsSync(agentFile)) {
        jsonResponse(res, cors, 404, { error: `Agent "${agent}" not found` });
        return;
      }

      log(`/chat/start requested for agent="${agent}"`);
      const result = startNewChatSession(agent, { permissionMode });
      jsonResponse(res, cors, 200, result);
      return;
    }

    if (req.method === 'POST' && req.url === '/chat/send') {
      const body = await readBody(req);
      let params;
      try {
        params = JSON.parse(body);
      } catch {
        jsonResponse(res, cors, 400, { error: 'Invalid JSON' });
        return;
      }

      const { message } = params;
      if (!message) {
        jsonResponse(res, cors, 400, { error: 'Missing message parameter' });
        return;
      }

      // ─── Slash command interception ─────────────────────────
      const slashCmd = parseSlashCommand(message);

      if (slashCmd) {
        if (slashCmd.type === 'agent') {
          // Switch to a different agent
          const fromAgent = chatSession ? chatSession.agent : null;
          const toAgent = slashCmd.agent;

          // Validate agent file exists
          const agentFile = path.join(AGENTS_DIR, `${toAgent}.md`);
          if (!fs.existsSync(agentFile)) {
            jsonResponse(res, cors, 404, { error: `Agent "${toAgent}" not found` });
            return;
          }

          broadcast({ type: 'chat-agent-switching', from: fromAgent, to: toAgent });
          const result = startNewChatSession(toAgent);
          jsonResponse(res, cors, 200, { ok: true, switched: true, agent: result.agent, sessionId: result.sessionId });
          return;
        }

        if (slashCmd.command === 'compact') {
          if (!chatSession || !chatSession.isRunning) {
            jsonResponse(res, cors, 400, { error: 'No active chat session to compact' });
            return;
          }
          const oldSessionId = chatSession.sessionId;
          const agent = chatSession.agent;
          broadcast({ type: 'chat-compacting', agent });
          const result = startNewChatSession(agent, { resumeSessionId: oldSessionId });
          jsonResponse(res, cors, 200, { ok: true, compacted: true, agent: result.agent, sessionId: result.sessionId });
          return;
        }

        if (slashCmd.command === 'stop') {
          if (chatSession && chatSession.isRunning) {
            chatSession.stop();
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
      if (!chatSession || !chatSession.isRunning) {
        jsonResponse(res, cors, 400, { error: 'No active chat session' });
        return;
      }

      try {
        chatSession.send(message);
        const agent = chatSession.agent;
        transcript.push({ role: 'user', content: message, agent, source: 'chat' });
        broadcast({ type: 'chat-user-message', content: message, agent, sessionId: chatSession.sessionId });
        jsonResponse(res, cors, 200, { ok: true });
      } catch (err) {
        jsonResponse(res, cors, 500, { error: err.message });
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/chat/stop') {
      if (chatSession && chatSession.isRunning) {
        chatSession.stop();
        jsonResponse(res, cors, 200, { ok: true });
      } else {
        jsonResponse(res, cors, 200, { ok: true, note: 'No active session' });
      }
      return;
    }

    // ─── Static file serving (JS/CSS) ─────────────────────────
    if (req.method === 'GET') {
      const MIME = { '.js': 'application/javascript', '.css': 'text/css' };
      const ext = path.extname(req.url);
      if (MIME[ext]) {
        const filePath = path.join(__dirname, decodeURIComponent(req.url));
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
  const server = http.createServer(createHandler());

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      startServer(portIndex + 1);
    } else {
      console.error('Shards UI server error:', e.message);
      process.exit(1);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    fs.mkdirSync(SHARDS_DIR, { recursive: true });
    try {
      fs.writeFileSync(PORT_FILE, String(port));
      fs.writeFileSync(PID_FILE, String(process.pid));
    } catch {}

    console.log(`Shards UI server running on http://localhost:${port}`);

    // Clean up stale chat processes
    cleanupStaleChat();

    // Initial file scan then poll
    pollFiles();
  });
}

// Clean up on exit
function cleanup() {
  if (chatSession && chatSession.isRunning) {
    chatSession.stop();
  }
  try { fs.unlinkSync(PORT_FILE); } catch {}
  try { fs.unlinkSync(PID_FILE); } catch {}
}
process.on('exit', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

startServer(0);
