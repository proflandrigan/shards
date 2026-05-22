// Gate state read/write for .shards/gates/state.json
'use strict';

const fs = require('fs');
const path = require('path');

const GATE_DIR = path.join(process.cwd(), '.shards', 'gates');
const STATE = path.join(GATE_DIR, 'state.json');

function ensureDir() {
  // `recursive: true` is idempotent — safe even if a concurrent writer just
  // created the directory between calls.
  fs.mkdirSync(GATE_DIR, { recursive: true });
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return { open: false, history: [] };
  }
}

// Atomic write via tmp + rename. Reference: src/ui/session-index.js.
// Three concurrent readers (UI 2s poll, /chat/end snapshot, gate-hook's own
// pre-tool-use/user-prompt-submit handlers) can hit during a bare writeFileSync
// and observe a partial file → JSON.parse throws → read() silently returns
// default closed state. tmp+rename ensures readers always see the full
// previous or the full next content.
//
// Unique per-PID tmp name avoids same-PID collisions (multiple hook
// invocations chained on the same process aren't expected, but the cost is
// negligible and it matches the session-index.js reference primitive).
function write(s) {
  ensureDir();
  const tmp = `${STATE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, STATE);
  } catch (err) {
    // Best-effort cleanup so a failed write doesn't leak per-writer tmps.
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

module.exports = { read, write, STATE, GATE_DIR };
