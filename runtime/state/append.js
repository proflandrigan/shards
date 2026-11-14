'use strict';
// lockedAppend(file, line): append one line under a cross-process lock (for JSONL logs, E2.9).
const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');

const LOCK_OPTS = { realpath: false, stale: 10000, retries: { retries: 40, factor: 1.4, minTimeout: 5, maxTimeout: 100 } };

async function lockedAppend(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const target = file + '.lockTarget';
  fs.closeSync(fs.openSync(target, 'a'));
  const release = await lockfile.lock(target, LOCK_OPTS);
  try {
    fs.appendFileSync(file, String(line).replace(/\n+$/, '') + '\n', 'utf8');
  } finally {
    await release();
  }
}

module.exports = { lockedAppend, LOCK_OPTS };
