'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const LOG_FILE = path.join(process.cwd(), '.shards', 'ui.log');

function log(msg) {
  const ts = new Date().toISOString();
  try { fs.appendFileSync(LOG_FILE, `[${ts}] [chat-session] ${msg}\n`); } catch {}
}

class ChatSession {
  constructor({ agent, sessionId, resumeSessionId, cwd, sessionsDir, permissionMode, model, onEvent, onExit }) {
    this.agent = agent;
    this.sessionId = sessionId || randomUUID();
    this.resumeSessionId = resumeSessionId || null;
    this.cwd = cwd || process.cwd();
    this.sessionsDir = sessionsDir || path.join(this.cwd, '.shards', 'sessions');
    this.permissionMode = permissionMode || 'acceptEdits';
    this.model = model || null;
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

    if (this.model) {
      args.push('--model', this.model);
    }

    log(`Spawning claude CLI for agent="${this.agent}" session="${this.sessionId}" permissionMode="${this.permissionMode}"${this.resumeSessionId ? ` resume="${this.resumeSessionId}"` : ''}`);

    // P4: Spawn detached so process survives server restarts
    this.child = spawn('claude', args, {
      cwd: this.cwd,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // Don't let the child keep the parent alive
    this.child.unref();

    this.startedAt = new Date().toISOString();
    log(`claude process spawned, PID=${this.child.pid}`);

    // P4: Write session metadata for reconnection
    this._writeMetadata();

    this._attachStreams();
  }

  // P4: Reconnect to an existing detached process
  reconnect(pid) {
    log(`Attempting reconnect to PID=${pid} for session="${this.sessionId}"`);

    // We can't reattach to stdio of a detached process without IPC.
    // Instead, we verify the process is alive and mark it as connected.
    // The process will eventually exit and we'll detect that via polling.
    try {
      process.kill(pid, 0); // throws if not alive
    } catch {
      log(`PID=${pid} is not alive, cannot reconnect`);
      return false;
    }

    this.startedAt = this.startedAt || new Date().toISOString();
    this._responding = false;

    // Start a heartbeat poller to detect when the process dies
    this._heartbeatInterval = setInterval(() => {
      try {
        process.kill(pid, 0);
        this._updateMetadata();
      } catch {
        // Process died while server was down or between heartbeats
        clearInterval(this._heartbeatInterval);
        this._heartbeatInterval = null;
        log(`Heartbeat: PID=${pid} is dead for session="${this.sessionId}"`);
        this._removeMetadata();
        this.onExit({ code: null, sessionId: this.sessionId });
      }
    }, 5000);

    this._reconnectedPid = pid;
    return true;
  }

  _attachStreams() {
    // Parse stdout line by line (JSONL)
    this.child.stdout.on('data', (chunk) => {
      this._buffer += chunk.toString();
      const lines = this._buffer.split('\n');
      this._buffer = lines.pop();
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
      this._removeMetadata();
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
      return;
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
        return;
      }

      return;
    }

    if (type === 'assistant') {
      const content = data.message && data.message.content;
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
    this._updateMetadata();
  }

  stop() {
    if (this._heartbeatInterval) {
      clearInterval(this._heartbeatInterval);
      this._heartbeatInterval = null;
    }
    if (this._reconnectedPid) {
      try { process.kill(this._reconnectedPid, 'SIGTERM'); } catch {}
      this._reconnectedPid = null;
    }
    if (this.child) {
      this.child.kill('SIGTERM');
    }
  }

  get isRunning() {
    return this.child !== null || this._reconnectedPid !== null;
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

  // P4: Session metadata persistence

  _metadataPath() {
    return path.join(this.sessionsDir, `${this.sessionId}.json`);
  }

  _writeMetadata() {
    try {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
      fs.writeFileSync(this._metadataPath(), JSON.stringify({
        sessionId: this.sessionId,
        agent: this.agent,
        pid: this.child ? this.child.pid : (this._reconnectedPid || null),
        startedAt: this.startedAt,
        lastActivityAt: new Date().toISOString(),
      }));
    } catch {}
  }

  _updateMetadata() {
    try {
      const meta = JSON.parse(fs.readFileSync(this._metadataPath(), 'utf8'));
      meta.lastActivityAt = new Date().toISOString();
      fs.writeFileSync(this._metadataPath(), JSON.stringify(meta));
    } catch {}
  }

  _removeMetadata() {
    try { fs.unlinkSync(this._metadataPath()); } catch {}
  }
}

// P4: Reconnect to orphaned sessions or clean up dead ones
function reconnectOrCleanup(sessionsDir, sessionsMap, SessionStoreClass, onEvent, onExit, cwd) {
  if (!fs.existsSync(sessionsDir)) return;

  try {
    const files = fs.readdirSync(sessionsDir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const metaPath = path.join(sessionsDir, file);
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        try { fs.unlinkSync(metaPath); } catch {}
        continue;
      }

      const { sessionId, agent, pid } = meta;
      if (!pid || !sessionId) {
        try { fs.unlinkSync(metaPath); } catch {}
        continue;
      }

      // Check if the process is still alive
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {}

      if (!alive) {
        // Process died while server was down — clean up
        log(`reconnectOrCleanup: session ${sessionId} (PID=${pid}) is dead, cleaning up`);
        try { fs.unlinkSync(metaPath); } catch {}
        continue;
      }

      // Process is alive — attempt reconnect
      log(`reconnectOrCleanup: reconnecting to session ${sessionId} (PID=${pid}, agent=${agent})`);

      const chatSess = new ChatSession({
        agent,
        sessionId,
        cwd,
        sessionsDir,
        onEvent,
        onExit,
      });
      chatSess.startedAt = meta.startedAt;

      if (chatSess.reconnect(pid)) {
        const store = new SessionStoreClass({ sessionId, agent });
        store.chatSession = chatSess;
        store.createdAt = new Date(meta.startedAt);
        store.lastActivityAt = new Date(meta.lastActivityAt || meta.startedAt);
        sessionsMap.set(sessionId, store);
        log(`reconnectOrCleanup: successfully reconnected session ${sessionId}`);
      } else {
        try { fs.unlinkSync(metaPath); } catch {}
      }
    }
  } catch (err) {
    log(`reconnectOrCleanup error: ${err.message}`);
  }
}

module.exports = { ChatSession, reconnectOrCleanup };
