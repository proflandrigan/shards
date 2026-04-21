// Append entries to violations.jsonl / gate-history.jsonl
'use strict';

const fs = require('fs');
const path = require('path');

const GATE_DIR = path.join(process.cwd(), '.shards', 'gates');

function ensureDir() {
  fs.mkdirSync(GATE_DIR, { recursive: true });
}

function appendViolation(entry) {
  ensureDir();
  const file = path.join(GATE_DIR, 'violations.jsonl');
  fs.appendFileSync(file, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
}

function appendHistory(entry) {
  ensureDir();
  const file = path.join(GATE_DIR, 'gates.jsonl');
  fs.appendFileSync(file, JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n');
}

module.exports = { appendViolation, appendHistory };
