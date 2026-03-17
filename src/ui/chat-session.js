'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const SHARDS_DIR = path.join(process.cwd(), '.shards');
const CHAT_PID_FILE = path.join(SHARDS_DIR, 'chat.pid');
const LOG_FILE = path.join(SHARDS_DIR, 'ui.log');

function log(msg) {
  const ts = new Date().toISOString();
  try { fs.appendFileSync(LOG_FILE, `[${ts}] [chat-session] ${msg}\n`); } catch {}
}

class ChatSession {
  constructor({ agent, sessionId, resumeSessionId, cwd, permissionMode, onEvent, onExit }) {
    this.agent = agent;
    this.sessionId = sessionId || randomUUID();
    this.resumeSessionId = resumeSessionId || null;
    this.cwd = cwd || process.cwd();
    this.permissionMode = permissionMode || 'acceptEdits';
    this.onEvent = onEvent || (() => {});
    this.onExit = onExit || (() => {});
    this.child = null;
    this.startedAt = null;
    this._buffer = '';
    this._responding = false;
  }

  start() {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--agent', this.agent,
      '--session-id', this.sessionId,
      '--permission-mode', this.permissionMode,
    ];

    if (this.resumeSessionId) {
      args.push('--resume', this.resumeSessionId);
    }

    log(`Spawning claude CLI for agent="${this.agent}" session="${this.sessionId}" permissionMode="${this.permissionMode}"${this.resumeSessionId ? ` resume="${this.resumeSessionId}"` : ''}`);

    this.child = spawn('claude', args, {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.startedAt = new Date().toISOString();
    log(`claude process spawned, PID=${this.child.pid}`);

    // Save PID for stale process cleanup
    try {
      fs.writeFileSync(CHAT_PID_FILE, String(this.child.pid));
    } catch {}

    // Parse stdout line by line (JSONL)
    this.child.stdout.on('data', (chunk) => {
      this._buffer += chunk.toString();
      const lines = this._buffer.split('\n');
      this._buffer = lines.pop(); // keep incomplete line in buffer
      for (const line of lines) {
        if (line.trim()) this._parseLine(line.trim());
      }
    });

    this.child.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        log(`stderr: ${text}`);
        this.onEvent({ type: 'chat-stderr', text, sessionId: this.sessionId });
      }
    });

    this.child.on('close', (code) => {
      log(`claude process exited, code=${code}, agent="${this.agent}", session="${this.sessionId}"`);
      this.child = null;
      this._responding = false;
      try { fs.unlinkSync(CHAT_PID_FILE); } catch {}
      this.onExit({ code, sessionId: this.sessionId });
    });

    this.child.on('error', (err) => {
      log(`claude process error: ${err.message}`);
      this.onEvent({ type: 'chat-error', error: err.message, sessionId: this.sessionId });
    });
  }

  _parseLine(line) {
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      return; // skip non-JSON lines
    }

    const { type } = data;

    if (type === 'system' && data.subtype === 'init') {
      this.onEvent({ type: 'chat-init', sessionId: this.sessionId, data });
      return;
    }

    if (type === 'stream_event') {
      const evt = data.event;
      if (!evt) return;

      if (evt.type === 'content_block_delta' && evt.delta) {
        if (evt.delta.type === 'text_delta') {
          this._responding = true;
          this.onEvent({
            type: 'chat-token',
            text: evt.delta.text,
            index: evt.index,
            sessionId: this.sessionId,
          });
        } else if (evt.delta.type === 'input_json_delta') {
          this.onEvent({
            type: 'chat-tool-input-delta',
            partial_json: evt.delta.partial_json,
            index: evt.index,
            sessionId: this.sessionId,
          });
        }
        return;
      }

      if (evt.type === 'content_block_start' && evt.content_block) {
        if (evt.content_block.type === 'tool_use') {
          this.onEvent({
            type: 'chat-tool-use',
            tool: evt.content_block.name,
            id: evt.content_block.id,
            index: evt.index,
            sessionId: this.sessionId,
          });
        }
        return;
      }

      if (evt.type === 'content_block_stop') {
        this.onEvent({
          type: 'chat-block-stop',
          index: evt.index,
          sessionId: this.sessionId,
        });
        return;
      }

      if (evt.type === 'message_start' || evt.type === 'message_delta' || evt.type === 'message_stop') {
        // message-level events, mostly ignore
        return;
      }

      return;
    }

    if (type === 'assistant') {
      const content = data.message && data.message.content;
      // With --include-partial-messages, intermediate assistant messages are
      // emitted after each content block (e.g. thinking-only). Skip ones
      // that have no text blocks to avoid empty bubbles in the UI.
      const hasText = Array.isArray(content) && content.some(b => b.type === 'text');
      if (!hasText) return;
      this._responding = false;
      this.onEvent({
        type: 'chat-message',
        content,
        sessionId: this.sessionId,
      });
      return;
    }

    if (type === 'result') {
      this._responding = false;
      this.onEvent({
        type: 'chat-turn-end',
        sessionId: this.sessionId,
        cost: data.cost_usd,
        duration: data.duration_ms,
      });
      return;
    }

    // Unknown type — log but don't crash
    this.onEvent({ type: 'chat-unknown', raw: data, sessionId: this.sessionId });
  }

  send(message) {
    if (!this.child || !this.child.stdin.writable) {
      throw new Error('Chat session is not running');
    }
    const payload = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: message }],
      },
    };
    this.child.stdin.write(JSON.stringify(payload) + '\n');
    this._responding = true;
  }

  stop() {
    if (this.child) {
      this.child.kill('SIGTERM');
    }
  }

  get isRunning() {
    return this.child !== null;
  }

  get isResponding() {
    return this._responding;
  }

  get info() {
    return {
      agent: this.agent,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      running: this.isRunning,
      responding: this._responding,
    };
  }
}

// Kill stale chat process on startup
function cleanupStaleChat() {
  if (!fs.existsSync(CHAT_PID_FILE)) return;
  try {
    const pid = parseInt(fs.readFileSync(CHAT_PID_FILE, 'utf8').trim(), 10);
    if (pid && pid > 0) {
      process.kill(pid, 'SIGTERM');
    }
  } catch {}
  try { fs.unlinkSync(CHAT_PID_FILE); } catch {}
}

module.exports = { ChatSession, cleanupStaleChat };
