#!/usr/bin/env node

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const SHARDS_DIR = path.join(process.cwd(), '.shards');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');
const STATE_FILE = path.join(SHARDS_DIR, 'ui-state.json');
const QUEUE_FILE = path.join(SHARDS_DIR, 'event-queue.jsonl');

// P2: Queue constraints
const MAX_QUEUE_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_QUEUE_SIZE = 500;

const eventType = process.argv[2]; // user-prompt | stop | post-tool-use | session-end

// P2: Monotonic sequence counter persisted alongside the queue
let nextSeq = 1;

// P1: Read port and auth token from JSON port file
function getServerInfo() {
  try {
    const raw = fs.readFileSync(PORT_FILE, 'utf8').trim();
    // Support both old (plain number) and new (JSON) formats
    try {
      const info = JSON.parse(raw);
      return { port: info.port, token: info.token || null };
    } catch {
      return { port: parseInt(raw, 10), token: null };
    }
  } catch {
    return null;
  }
}

function getState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { currentAgent: 'jfl', sessionId: null, messageCount: 0 };
  }
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

// ─── P2: Event queue ─────────────────────────────────────────────────────────

function readQueue() {
  try {
    const raw = fs.readFileSync(QUEUE_FILE, 'utf8').trim();
    if (!raw) return [];
    const now = Date.now();
    return raw.split('\n')
      .map(line => { try { return JSON.parse(line); } catch { return null; } })
      .filter(e => e !== null)
      // Discard events older than MAX_QUEUE_AGE_MS
      .filter(e => (now - e.timestamp) < MAX_QUEUE_AGE_MS);
  } catch {
    return [];
  }
}

function writeQueue(events) {
  try {
    // Enforce max queue size — keep the newest events
    const trimmed = events.slice(-MAX_QUEUE_SIZE);
    const lines = trimmed.map(e => JSON.stringify(e)).join('\n');
    fs.writeFileSync(QUEUE_FILE, lines ? lines + '\n' : '');
  } catch {}
}

function appendToQueue(payload) {
  const entry = { seq: nextSeq++, timestamp: Date.now(), payload };
  try {
    fs.appendFileSync(QUEUE_FILE, JSON.stringify(entry) + '\n');
  } catch {}
  return entry;
}

// P1 + P2: POST event with auth header, expect ack response
function postEvent(port, token, payload) {
  return new Promise((resolve) => {
    if (!port) { resolve(false); return; }
    const body = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/event',
      method: 'POST',
      headers,
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve(result.ack === true);
            return;
          } catch {}
        }
        resolve(false);
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(body);
    req.end();
  });
}

// ─── Pre-tool-use helpers ────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function postPermissionRequest(port, token, payload) {
  return new Promise((resolve) => {
    if (!port) { resolve(null); return; }
    const body = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/pre-tool-use',
      method: 'POST',
      headers,
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function pollDecision(port, token, id) {
  return new Promise((resolve) => {
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/chat/permission/${id}`,
      method: 'GET',
      headers,
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.status || 'pending');
        } catch {
          resolve('pending');
        }
      });
    });
    req.on('error', () => resolve('pending'));
    req.on('timeout', () => { req.destroy(); resolve('pending'); });
    req.end();
  });
}

async function handlePreToolUse(port, token, payload) {
  const toolName = payload.tool_name || '';
  const command = (payload.tool_input && payload.tool_input.command) || '';
  const sessionId = payload.session_id || '';

  // POST to server
  const response = await postPermissionRequest(port, token, {
    tool: toolName,
    command: command,
    sessionId: sessionId,
  });

  // Server unreachable — fail open
  if (!response) {
    process.stderr.write('shards-ui: server unreachable, allowing command\n');
    process.exit(0);
  }

  // Fast paths
  if (response.status === 'allowed') {
    process.exit(0);
  }
  if (response.status === 'denied') {
    process.stdout.write(JSON.stringify({
      decision: 'block',
      reason: 'Denied by permission rules',
    }));
    process.exit(2);
  }

  // Pending — poll loop (no timeout: wait indefinitely for user decision)
  const POLL_MS = 200;

  for (;;) {
    await sleep(POLL_MS);
    const decision = await pollDecision(port, token, response.id);
    if (decision === 'allow') {
      process.exit(0);
    }
    if (decision === 'deny') {
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: 'Denied by user in Shards UI',
      }));
      process.exit(2);
    }
    // 'pending' or 'not_found' — keep polling
  }
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text || '')
      .join('');
  }
  return '';
}

async function main() {
  const serverInfo = getServerInfo();
  if (!serverInfo || !serverInfo.port) {
    // For pre-tool-use, fail open if server info unavailable
    if (eventType === 'pre-tool-use') process.exit(0);
    return;
  }

  const { port, token } = serverInfo;

  let rawData = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    rawData += chunk;
  }

  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch {
    if (eventType === 'pre-tool-use') process.exit(0);
    return;
  }

  // Pre-tool-use: blocking mode — handle separately and exit
  if (eventType === 'pre-tool-use') {
    await handlePreToolUse(port, token, payload);
    return; // handlePreToolUse always calls process.exit
  }

  const state = getState();

  // ─── P2: Drain pending events from queue before processing current ───
  const pending = readQueue();
  const stillPending = [];
  for (const entry of pending) {
    const acked = await postEvent(port, token, { ...entry.payload, seq: entry.seq });
    if (!acked) {
      stillPending.push(entry);
    }
  }

  // ─── Build current event payload ───
  let currentPayload = null;

  if (eventType === 'user-prompt') {
    const transcript = payload.transcript || [];
    const lastMsg = transcript[transcript.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const content = extractTextContent(lastMsg.content);
      currentPayload = {
        eventType: 'user-message',
        content,
        agent: state.currentAgent,
      };
    }

  } else if (eventType === 'stop') {
    const transcript = payload.transcript || [];
    const lastMsg = transcript[transcript.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      const content = extractTextContent(lastMsg.content);
      if (content) {
        currentPayload = {
          eventType: 'agent-message',
          content,
          agent: state.currentAgent,
        };
      }
    }

  } else if (eventType === 'post-tool-use') {
    const toolName = payload.tool_name || '';
    const toolInput = payload.tool_input || {};

    if (toolName === 'Task') {
      const consultAgent = toolInput.subagent_type;
      if (consultAgent) {
        // Send both events — queue the first, send second as current
        const evt1 = { eventType: 'agent-consulting', agent: consultAgent };
        const entry1 = { seq: nextSeq++, timestamp: Date.now(), payload: evt1 };
        const acked1 = await postEvent(port, token, { ...evt1, seq: entry1.seq });
        if (!acked1) stillPending.push(entry1);

        currentPayload = { eventType: 'event-log', text: `Consulting ${consultAgent}...` };
      }

    } else if (toolName === 'Read') {
      const filePath = toolInput.file_path || '';
      const agentMatch = filePath.match(/\.claude\/agents\/([^/]+)\.md$/);
      if (agentMatch && state.currentAgent === 'jfl') {
        const newAgent = agentMatch[1];
        const prevAgent = state.currentAgent;
        state.currentAgent = newAgent;
        saveState(state);

        // Send activation events
        const evt1 = { eventType: 'agent-activated', agent: newAgent };
        const entry1 = { seq: nextSeq++, timestamp: Date.now(), payload: evt1 };
        const acked1 = await postEvent(port, token, { ...evt1, seq: entry1.seq });
        if (!acked1) stillPending.push(entry1);

        const evt2 = { eventType: 'agent-changed', from: prevAgent, to: newAgent };
        const entry2 = { seq: nextSeq++, timestamp: Date.now(), payload: evt2 };
        const acked2 = await postEvent(port, token, { ...evt2, seq: entry2.seq });
        if (!acked2) stillPending.push(entry2);

        currentPayload = { eventType: 'event-log', text: `Persona transfer: ${prevAgent} -> ${newAgent}` };
      }

    } else if (toolName === 'Write' || toolName === 'Edit') {
      const fp = toolInput.file_path || toolInput.path || 'file';
      const evt1 = { eventType: 'event-log', text: `${toolName}: ${fp}` };
      const entry1 = { seq: nextSeq++, timestamp: Date.now(), payload: evt1 };
      const acked1 = await postEvent(port, token, { ...evt1, seq: entry1.seq });
      if (!acked1) stillPending.push(entry1);

      currentPayload = { eventType: 'file-touched', filePath: fp };

    } else if (toolName === 'Bash') {
      currentPayload = { eventType: 'event-log', text: `Bash: ${(toolInput.command || '').slice(0, 60)}` };
    }

  } else if (eventType === 'session-end') {
    currentPayload = { eventType: 'session-end' };
    saveState({ currentAgent: 'jfl', sessionId: null, messageCount: 0 });
  }

  // ─── P2: Send current event, queue on failure ───
  if (currentPayload) {
    const entry = { seq: nextSeq++, timestamp: Date.now(), payload: currentPayload };
    const acked = await postEvent(port, token, { ...currentPayload, seq: entry.seq });
    if (!acked) {
      stillPending.push(entry);
    }
  }

  // Write remaining unacked events back to queue
  writeQueue(stillPending);
}

main().catch(function(err) { process.stderr.write('shards-ui relay: ' + (err && err.message || err) + '\n'); });
