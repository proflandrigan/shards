'use strict';
// Shared plumbing for the hook shims. Contract: never block the host, never throw,
// always exit 0. Internal errors go to <root>/.shards/state/hook-errors.log.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function resolveRoot(norm, env = process.env) {
  // Same precedence as runtime/server.js, plus the host-provided project dir.
  const r = env.SHARDS_PROJECT_ROOT || env.CLAUDE_PROJECT_DIR || norm.cwd || process.cwd();
  return path.resolve(r);
}

function logError(root, hook, err) {
  try {
    const dir = path.join(root || process.cwd(), '.shards', 'state');
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), hook, error: String((err && err.stack) || err).slice(0, 2000) });
    fs.appendFileSync(path.join(dir, 'hook-errors.log'), line + '\n');
  } catch (_) { /* nothing more we can do */ }
}

function readStdin(timeoutMs = 4000) {
  return new Promise((resolve) => {
    let buf = '';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(buf); } };
    const t = setTimeout(finish, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { buf += c; });
    process.stdin.on('end', () => { clearTimeout(t); finish(); });
    process.stdin.on('error', () => { clearTimeout(t); finish(); });
  });
}

// Normalised prompt text: Unicode NFC, whitespace runs collapsed to one space, trimmed.
function normalizeText(s) {
  return String(s).normalize('NFC').replace(/\s+/g, ' ').trim();
}
function sha256(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

// Ancestor pids starting at our parent. Linux: /proc; macOS: ps; else [process.ppid].
// Windows is best-effort: only [process.ppid] (no portable ancestry without wmic/PowerShell).
function ppidChain(startPid = process.ppid, max = 32) {
  const chain = [];
  let pid = startPid;
  try {
    while (pid && pid > 1 && chain.length < max && !chain.includes(pid)) {
      chain.push(pid);
      let next = 0;
      if (process.platform === 'linux') {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        next = parseInt(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1], 10); // field 4 = ppid
      } else if (process.platform === 'darwin') {
        next = parseInt(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8', timeout: 1500 }).trim(), 10);
      } else break;
      if (!Number.isInteger(next)) break;
      pid = next;
    }
  } catch (_) { /* partial chain is fine */ }
  return chain.length ? chain : [startPid];
}

// run(name, handler): handler(norm, root, rawPayload) may return a string to print on stdout.
async function run(name, handler, { normalize }) {
  let root = process.cwd();
  try {
    const raw = await readStdin();
    let payload = {};
    try { payload = raw.trim() ? JSON.parse(raw) : {}; } catch (e) { logError(root, name, `malformed JSON on stdin: ${e.message}`); return; }
    const norm = normalize(payload);
    root = resolveRoot(norm);
    const out = await handler(norm, root, payload);
    if (out) process.stdout.write(out);
  } catch (e) {
    logError(root, name, e);
  }
}

module.exports = { resolveRoot, logError, readStdin, normalizeText, sha256, ppidChain, run };
