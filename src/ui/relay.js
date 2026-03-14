#!/usr/bin/env node

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const SHARDS_DIR = path.join(process.cwd(), '.shards');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');
const STATE_FILE = path.join(SHARDS_DIR, 'ui-state.json');

const eventType = process.argv[2]; // user-prompt | stop | post-tool-use | session-end

function getPort() {
  try {
    return parseInt(fs.readFileSync(PORT_FILE, 'utf8').trim(), 10);
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

function postEvent(port, payload) {
  if (!port) return;
  const body = JSON.stringify(payload);
  const req = http.request({
    hostname: '127.0.0.1',
    port,
    path: '/event',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  });
  req.on('error', () => {});
  req.write(body);
  req.end();
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
  const port = getPort();
  if (!port) return;

  let rawData = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    rawData += chunk;
  }

  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch {
    return;
  }

  const state = getState();

  if (eventType === 'user-prompt') {
    const transcript = payload.transcript || [];
    const lastMsg = transcript[transcript.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      const content = extractTextContent(lastMsg.content);
      postEvent(port, {
        eventType: 'user-message',
        content,
        agent: state.currentAgent,
      });
    }

  } else if (eventType === 'stop') {
    const transcript = payload.transcript || [];
    const lastMsg = transcript[transcript.length - 1];
    if (lastMsg && lastMsg.role === 'assistant') {
      const content = extractTextContent(lastMsg.content);
      if (content) {
        postEvent(port, {
          eventType: 'agent-message',
          content,
          agent: state.currentAgent,
        });
      }
    }

  } else if (eventType === 'post-tool-use') {
    const toolName = payload.tool_name || '';
    const toolInput = payload.tool_input || {};

    if (toolName === 'Task') {
      const consultAgent = toolInput.subagent_type;
      if (consultAgent) {
        postEvent(port, { eventType: 'agent-consulting', agent: consultAgent });
        postEvent(port, { eventType: 'event-log', text: `Consulting ${consultAgent}...` });
      }

    } else if (toolName === 'Read') {
      const filePath = toolInput.file_path || '';
      const agentMatch = filePath.match(/\.claude\/agents\/([^/]+)\.md$/);
      if (agentMatch && state.currentAgent === 'jfl') {
        const newAgent = agentMatch[1];
        const prevAgent = state.currentAgent;
        state.currentAgent = newAgent;
        saveState(state);
        postEvent(port, { eventType: 'agent-activated', agent: newAgent });
        postEvent(port, { eventType: 'agent-changed', from: prevAgent, to: newAgent });
        postEvent(port, { eventType: 'event-log', text: `Persona transfer: ${prevAgent} -> ${newAgent}` });
      }

    } else if (toolName === 'Write' || toolName === 'Edit') {
      const fp = toolInput.file_path || toolInput.path || 'file';
      postEvent(port, { eventType: 'event-log', text: `${toolName}: ${fp}` });

    } else if (toolName === 'Bash') {
      postEvent(port, { eventType: 'event-log', text: `Bash: ${(toolInput.command || '').slice(0, 60)}` });
    }

  } else if (eventType === 'session-end') {
    postEvent(port, { eventType: 'session-end' });
    saveState({ currentAgent: 'jfl', sessionId: null, messageCount: 0 });
  }
}

main().catch(() => {});
