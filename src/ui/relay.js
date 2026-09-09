#!/usr/bin/env node

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Read-only allowlist shared with the gate hook. Used to short-circuit the
// HTTP round-trip to the shards-ui server for obvious read-only Bash ops.
// Graceful degradation: if the module isn't available (standalone deploy,
// install partially rolled back, etc.) we fall through to the normal POST.
let isAutoApprovable;
try {
  ({ isAutoApprovable } = require('../hooks/gate-hook/auto-allowlist.js'));
} catch (_) {
  isAutoApprovable = () => false;
}

// Claude Code's built-in read-only classifier (ls, cat, grep, read-only git
// forms, read-only tools). Mirrors what the CLI auto-approves in every mode
// so the UI doesn't surface permission cards for them. Same graceful
// degradation as above.
let isCcReadOnly;
try {
  ({ isCcReadOnlyAutoApprovable: isCcReadOnly } = require('./cc-readonly.js'));
} catch (_) {
  isCcReadOnly = () => false;
}

const SHARDS_DIR = path.join(process.cwd(), '.shards');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');
const STATE_FILE = path.join(SHARDS_DIR, 'ui-state.json');
const QUEUE_FILE = path.join(SHARDS_DIR, 'event-queue.jsonl');

// P2: Queue constraints
const MAX_QUEUE_AGE_MS = 5 * 60 * 1000; // 5 minutes
const MAX_QUEUE_SIZE = 500;

const eventType = process.argv[2]; // user-prompt | stop | post-tool-use | session-end

// P2: Per-event UUID for server-side dedup. Previously a process-local
// integer counter — but every Claude Code hook invocation spawns a fresh
// relay process, so two concurrent hooks both started at seq=1 and the
// server's dedup set saw collisions. UUIDs are opaque on the server side
// (used only as Set keys in the dedup check) so this is a drop-in swap.
function nextSeq() { return randomUUID(); }

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
    return { currentAgent: 'syn', sessionId: null, messageCount: 0 };
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
  const entry = { seq: nextSeq(), timestamp: Date.now(), payload };
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

// Emit the structured PreToolUse hook output Claude Code expects to override
// its internal permission gate. Exit 0 for both allow and deny — exit 2 is
// reserved for hook *failures*, not user denials. Without this shape, a bare
// exit(0) doesn't actually override acceptEdits mode's internal deny of
// non-allowlisted Bash commands.
//
// updatedInput is an optional object the hook can use to rewrite the tool's
// parameters before execution (Claude Code PreToolUse contract). We use it to
// attach dangerouslyDisableSandbox=true on allowed Bash commands — see
// buildBashAllowInput below for why.
function emitDecision(decision, reason, updatedInput) {
  const hookSpecificOutput = {
    hookEventName: 'PreToolUse',
    permissionDecision: decision,
    permissionDecisionReason: reason || '',
  };
  if (updatedInput) hookSpecificOutput.updatedInput = updatedInput;
  process.stdout.write(JSON.stringify({ hookSpecificOutput }));
  process.exit(0);
}

// When the user (or their persisted allowlist) approves a Bash command, attach
// dangerouslyDisableSandbox=true so the command isn't then silently blocked by
// the OS-level sandbox (Seatbelt/bubblewrap) — which would force a second
// permission round-trip that the shards-ui flow doesn't surface cleanly. Scope
// is per-call: the flag rides along with this single tool invocation only.
function buildBashAllowInput(toolName, toolInput) {
  if (toolName !== 'Bash') return null;
  if (!toolInput || typeof toolInput !== 'object') return null;
  if (toolInput.dangerouslyDisableSandbox === true) return null; // already set
  return { ...toolInput, dangerouslyDisableSandbox: true };
}

async function handlePreToolUse(port, token, payload) {
  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};
  const command = toolInput.command || '';
  const sessionId = payload.session_id || '';

  // Fast path: read-only inspection ops auto-approve without an HTTP round-trip.
  // The shards-ui server's settings allowlist would also approve these — this
  // just shaves the ~5-50ms POST per call across long specialist sessions.
  // Same authority as a server "allowed" response: deny rules still beat us
  // (CC evaluates deny before any hook decision).
  if (isAutoApprovable(toolName, toolInput) || isCcReadOnly(toolName, toolInput)) {
    emitDecision('allow', 'Auto-approved by shards read-only allowlist',
                 buildBashAllowInput(toolName, toolInput));
  }

  // POST to server
  const response = await postPermissionRequest(port, token, {
    tool: toolName,
    command: command,
    sessionId: sessionId,
  });

  // Server unreachable — fall through to Claude Code's own permission rules
  // (exit 0 without structured output). Matches previous fail-open posture.
  if (!response) {
    process.stderr.write('shards-ui: server unreachable, deferring to Claude Code permission rules\n');
    process.exit(0);
  }

  // Fast paths
  if (response.status === 'allowed') {
    emitDecision('allow', 'Allowed by shards-ui permission rules', buildBashAllowInput(toolName, toolInput));
  }
  if (response.status === 'denied') {
    emitDecision('deny', 'Denied by shards-ui permission rules');
  }

  // Pending — poll the UI until the user decides, OR until the poll deadline
  // expires. The deadline is generous (default 10 minutes) so a user who steps
  // away mid-call doesn't have their tool silently rejected. On expiry we exit
  // 0 with no structured output — same posture as "server unreachable" above —
  // which hands control back to Claude Code's built-in permission rules.
  //
  // Tunable via SHARDS_UI_PERMISSION_TIMEOUT_MS; the hard ceiling is the
  // .claude/settings.json hook `timeout` (1800s today). Setting the env var to
  // 0 restores the old wait-forever behavior.
  const POLL_MS = 200;
  const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
  const envTimeout = parseInt(process.env.SHARDS_UI_PERMISSION_TIMEOUT_MS, 10);
  const timeoutMs = Number.isFinite(envTimeout) && envTimeout >= 0
    ? envTimeout
    : DEFAULT_TIMEOUT_MS;
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : null;

  for (;;) {
    await sleep(POLL_MS);
    const decision = await pollDecision(port, token, response.id);
    if (decision === 'allow') {
      emitDecision('allow', 'Approved by user in Shards UI', buildBashAllowInput(toolName, toolInput));
    }
    if (decision === 'deny') {
      emitDecision('deny', 'Denied by user in Shards UI');
    }
    if (deadline && Date.now() >= deadline) {
      process.stderr.write(
        `shards-ui: no user decision after ${Math.round(timeoutMs / 1000)}s — ` +
        `deferring to Claude Code permission rules\n`
      );
      process.exit(0);
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

  // Claude Code injects session_id into every hook stdin payload (verified by
  // the pre-tool-use branch above which already reads it). Forward it on every
  // event we post so the server can target SSE delivery per browser session
  // instead of misattributing to "most recently active session." Sessions
  // started via the shards-ui server use --session-id <uuid>, so this value
  // matches the SessionStore key 1:1 for UI-spawned sessions; sessions started
  // outside the UI simply won't match any store (server falls through to the
  // legacy broadcast path).
  const ccSessionId = payload.session_id || null;

  // ─── P2: Drain pending events from queue before processing current ───
  // Note: queued events were captured with their *original* sessionId. Don't
  // overwrite it with the current process's session_id — that would re-target
  // an old session's event to the wrong browser. Fall through to the entry's
  // stored sessionId, or null for legacy entries written before this change.
  const pending = readQueue();
  const stillPending = [];
  for (const entry of pending) {
    const acked = await postEvent(port, token, {
      ...entry.payload,
      seq: entry.seq,
      sessionId: entry.payload && entry.payload.sessionId !== undefined
        ? entry.payload.sessionId
        : (entry.sessionId || null),
    });
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
        const evt1 = { eventType: 'agent-consulting', agent: consultAgent, sessionId: ccSessionId };
        const entry1 = { seq: nextSeq(), timestamp: Date.now(), payload: evt1 };
        const acked1 = await postEvent(port, token, { ...evt1, seq: entry1.seq });
        if (!acked1) stillPending.push(entry1);

        currentPayload = { eventType: 'event-log', text: `Consulting ${consultAgent}...`, sessionId: ccSessionId };
      }

    } else if (toolName === 'Read') {
      const filePath = toolInput.file_path || '';
      const agentMatch = filePath.match(/\.claude\/agents\/([^/]+)\.md$/);
      if (agentMatch && state.currentAgent === 'syn') {
        const newAgent = agentMatch[1];
        const prevAgent = state.currentAgent;
        state.currentAgent = newAgent;
        saveState(state);

        // Send activation events
        const evt1 = { eventType: 'agent-activated', agent: newAgent, sessionId: ccSessionId };
        const entry1 = { seq: nextSeq(), timestamp: Date.now(), payload: evt1 };
        const acked1 = await postEvent(port, token, { ...evt1, seq: entry1.seq });
        if (!acked1) stillPending.push(entry1);

        const evt2 = { eventType: 'agent-changed', from: prevAgent, to: newAgent, sessionId: ccSessionId };
        const entry2 = { seq: nextSeq(), timestamp: Date.now(), payload: evt2 };
        const acked2 = await postEvent(port, token, { ...evt2, seq: entry2.seq });
        if (!acked2) stillPending.push(entry2);

        currentPayload = { eventType: 'event-log', text: `Persona transfer: ${prevAgent} -> ${newAgent}`, sessionId: ccSessionId };
      }

    } else if (toolName === 'Write' || toolName === 'Edit') {
      const fp = toolInput.file_path || toolInput.path || 'file';
      const evt1 = { eventType: 'event-log', text: `${toolName}: ${fp}`, sessionId: ccSessionId };
      const entry1 = { seq: nextSeq(), timestamp: Date.now(), payload: evt1 };
      const acked1 = await postEvent(port, token, { ...evt1, seq: entry1.seq });
      if (!acked1) stillPending.push(entry1);

      currentPayload = { eventType: 'file-touched', filePath: fp, sessionId: ccSessionId };

    } else if (toolName === 'Bash') {
      currentPayload = { eventType: 'event-log', text: `Bash: ${(toolInput.command || '').slice(0, 60)}`, sessionId: ccSessionId };
    }

  } else if (eventType === 'session-end') {
    currentPayload = { eventType: 'session-end', sessionId: ccSessionId };
    saveState({ currentAgent: 'syn', sessionId: null, messageCount: 0 });
  }

  // Tag user-prompt / stop payloads built earlier with the CC session_id too
  // so the server can target SSE delivery per browser session.
  if (currentPayload && currentPayload.sessionId === undefined) {
    currentPayload.sessionId = ccSessionId;
  }

  // ─── P2: Send current event, queue on failure ───
  if (currentPayload) {
    const entry = { seq: nextSeq(), timestamp: Date.now(), payload: currentPayload };
    const acked = await postEvent(port, token, { ...currentPayload, seq: entry.seq });
    if (!acked) {
      stillPending.push(entry);
    }
  }

  // Write remaining unacked events back to queue
  writeQueue(stillPending);
}

main().catch(function(err) { process.stderr.write('shards-ui relay: ' + (err && err.message || err) + '\n'); });
