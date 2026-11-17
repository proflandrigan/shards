'use strict';
// Runtime state store.
//
// Layout (all under the project root):
//   <root>/.shards/state/global.json                         {version, schema:1}
//   <root>/.shards/state/.lock                               lock target (proper-lockfile -> .lock.lock dir)
//   <root>/.shards/state/sessions/<sessionKey>/frames.json   {frames: []}   stack of {agent, mode, phase, ...}
//   <root>/.shards/state/sessions/<sessionKey>/gates.json    {gates: {}}
//   <root>/.shards/state/sessions/<sessionKey>/session.json  {sessionKey, createdAt, version}
//
// One lock covers every write in the state tree, so the monotonic `version`
// counter in session.json is bumped atomically with each write.
//
// PROVISIONAL SESSION KEY: `provisionalSessionKey()` = mcp-<pid>-<6 hex> is generated
// per MCP process at start. E2.11 (Stage 3) replaces it with the hook-reported
// session_id handshake / process-ancestry correlation.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const lockfile = require('proper-lockfile');
const { LOCK_OPTS } = require('./append');

const KEY_RE = /^[A-Za-z0-9._-]+$/;

function sanitizeSessionKey(key) {
  if (typeof key !== 'string' || !key || key.length > 128 || !KEY_RE.test(key) || key === '.' || key === '..' || key.includes('..')) {
    throw new Error(`Invalid sessionKey ${JSON.stringify(key)}: must match [A-Za-z0-9._-]+ without ".."`);
  }
  return key;
}

function provisionalSessionKey() {
  return `mcp-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
}

const DEFAULTS = {
  global: () => ({ version: 0, schema: 1 }),
  frames: () => ({ frames: [] }),
  gates: () => ({ gates: {} }),
};

function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  let lastErr;
  for (let i = 0; i < 8; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) {
      lastErr = e;
      // Windows: a concurrent reader/replacer can surface as EPERM/EACCES/EBUSY, or as a transient ENOENT while the
      // destination is delete-pending even though our tmp file still exists. Retry those.
      const transient = ['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || (e.code === 'ENOENT' && fs.existsSync(tmp));
      if (!transient) break;
      sleepSync(10 * (i + 1));
    }
  }
  try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
  throw lastErr;
}

class StateStore {
  constructor(root, sessionKey) {
    if (!root) throw new Error('StateStore requires a root');
    this.root = root;
    this.sessionKey = sanitizeSessionKey(sessionKey);
    this.stateDir = path.join(root, '.shards', 'state');
    this.sessionDir = path.join(this.stateDir, 'sessions', this.sessionKey);
    this.lockTarget = path.join(this.stateDir, '.lock');
  }

  file(name, sessionScoped = true) {
    if (!/^[a-z]+(-[a-z]+)*$/.test(name)) throw new Error(`Invalid state name ${name}`);
    return path.join(sessionScoped ? this.sessionDir : this.stateDir, `${name}.json`);
  }

  _defaultFor(name) {
    if (name === 'session') return { sessionKey: this.sessionKey, createdAt: new Date().toISOString(), version: 0 };
    return DEFAULTS[name] ? DEFAULTS[name]() : {};
  }

  _readRaw(file, name) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
      if (e.code === 'ENOENT') return this._defaultFor(name);
      throw e;
    }
    try { return JSON.parse(text); } catch (e) {
      throw new Error(`Corrupt state file ${file}: ${e.message}. Refusing to overwrite; fix or delete it.`);
    }
  }

  read(name, sessionScoped = true) {
    return this._readRaw(this.file(name, sessionScoped), name);
  }

  getVersion() {
    const s = this._readRaw(this.file('session'), 'session');
    return Number.isInteger(s.version) ? s.version : 0;
  }

  // withLock(fn) -> fn()'s result. Runs fn under the state lock WITHOUT bumping the session
  // version (for hook-owned state such as prompts.jsonl / hooks.json, which must not
  // trigger version-change re-grounding). Added for E11.0; backward-compatible.
  async withLock(fn) {
    fs.mkdirSync(this.sessionDir, { recursive: true });
    fs.closeSync(fs.openSync(this.lockTarget, 'a'));
    const release = await lockfile.lock(this.lockTarget, LOCK_OPTS);
    try { return await fn(); } finally { await release(); }
  }

  // update(name, fn[, sessionScoped=true]) -> next. fn(current) may be async; may mutate or return.
  async update(name, fn, sessionScoped = true) {
    fs.mkdirSync(this.sessionDir, { recursive: true });
    fs.closeSync(fs.openSync(this.lockTarget, 'a'));
    const release = await lockfile.lock(this.lockTarget, LOCK_OPTS);
    try {
      const file = this.file(name, sessionScoped);
      const sessFile = this.file('session');
      const cur = this._readRaw(file, name);
      const sess = this._readRaw(sessFile, 'session');
      let next = await fn(cur);
      if (next === undefined) next = cur;
      const version = (Number.isInteger(sess.version) ? sess.version : 0) + 1;
      if (name === 'session' && sessionScoped) {
        next = { ...next, version };
        atomicWrite(sessFile, JSON.stringify(next, null, 2));
      } else {
        atomicWrite(file, JSON.stringify(next, null, 2));
        atomicWrite(sessFile, JSON.stringify({ ...sess, version }, null, 2));
      }
      return next;
    } finally {
      await release();
    }
  }
}

module.exports = { StateStore, sanitizeSessionKey, provisionalSessionKey, atomicWrite };
