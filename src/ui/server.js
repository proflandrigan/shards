#!/usr/bin/env node

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = process.cwd();
const SHARDS_DIR = path.join(PROJECT_DIR, '.shards');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');
const PID_FILE = path.join(SHARDS_DIR, 'ui.pid');
const INDEX_HTML = path.join(__dirname, 'index.html');

const PORTS = [7842, 7843, 7844, 7845];
const OUTPUT_DIRS = ['analysis', 'studies', 'models', 'services', 'research', 'dashboards', 'brainstorm'];

// ─── State ───────────────────────────────────────────────────────────────────

let clients = [];       // SSE response objects
let transcript = [];    // { role, content, agent }
let files = {};         // relPath -> content

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
      broadcast({ type: 'artifact-updated', path: relPath, content });
    }
  }

  setTimeout(pollFiles, 3000);
}

// ─── Event handler ───────────────────────────────────────────────────────────

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
      transcript.push({ role: 'user', content: data.content, agent: data.agent });
      broadcast({ type: 'user-message', content: data.content, agent: data.agent });
      break;
    case 'agent-message':
      transcript.push({ role: 'assistant', content: data.content, agent: data.agent });
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
    case 'session-end':
      broadcast({ type: 'session-end' });
      break;
  }
}

// ─── Server ──────────────────────────────────────────────────────────────────

function createHandler() {
  return (req, res) => {
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
      res.end(JSON.stringify(files));
      return;
    }

    if (req.method === 'POST' && req.url === '/event') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        handleEvent(body);
        res.writeHead(200, cors);
        res.end('ok');
      });
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
    try {
      fs.writeFileSync(PORT_FILE, String(port));
      fs.writeFileSync(PID_FILE, String(process.pid));
    } catch {}

    console.log(`Shards UI server running on http://localhost:${port}`);

    // Initial file scan then poll
    pollFiles();
  });
}

// Clean up on exit
function cleanup() {
  try { fs.unlinkSync(PORT_FILE); } catch {}
  try { fs.unlinkSync(PID_FILE); } catch {}
}
process.on('exit', cleanup);
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

startServer(0);
