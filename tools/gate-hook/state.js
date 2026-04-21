// Gate state read/write for .shards/gates/state.json
'use strict';

const fs = require('fs');
const path = require('path');

const GATE_DIR = path.join(process.cwd(), '.shards', 'gates');
const STATE = path.join(GATE_DIR, 'state.json');

function ensureDir() {
  fs.mkdirSync(GATE_DIR, { recursive: true });
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return { open: false, history: [] };
  }
}

function write(s) {
  ensureDir();
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

module.exports = { read, write, STATE, GATE_DIR };
