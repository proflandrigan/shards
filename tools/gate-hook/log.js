// Append entries to violations.jsonl / gate-history.jsonl
'use strict';

const fs = require('fs');
const path = require('path');

const GATE_DIR = path.join(process.cwd(), '.shards', 'gates');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Atomic-append: open with O_APPEND and write the full JSON line in a single
// syscall. POSIX guarantees that writes <= PIPE_BUF (typically 4096 bytes) to
// a file opened with O_APPEND are atomic with respect to other O_APPEND
// writers — concurrent gate-hook invocations cannot interleave bytes within a
// single line. JSONL entries here are well under PIPE_BUF.
//
// We deliberately do NOT use fs.appendFileSync here because Node's
// implementation can fall back to non-atomic open/write/close patterns under
// some conditions. Doing the open + writeSync + close explicitly is a
// belt-and-braces guarantee.
function atomicAppendLine(file, line) {
  let fd;
  try {
    fd = fs.openSync(file, 'a');
    fs.writeSync(fd, line);
  } finally {
    if (typeof fd === 'number') {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function appendViolation(entry) {
  ensureDir(GATE_DIR);
  const file = path.join(GATE_DIR, 'violations.jsonl');
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
  atomicAppendLine(file, line);
}

function appendHistory(entry) {
  ensureDir(GATE_DIR);
  const file = path.join(GATE_DIR, 'gates.jsonl');
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
  atomicAppendLine(file, line);
}

function appendAutoHistory(entry) {
  const dir = path.join(process.cwd(), '.shards', 'auto');
  ensureDir(dir);
  const file = path.join(dir, 'history.jsonl');
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
  atomicAppendLine(file, line);
}

module.exports = { appendViolation, appendHistory, appendAutoHistory };
