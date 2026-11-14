#!/usr/bin/env node

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SHARDS_DIR = path.join(process.cwd(), '.shards');
const SERVER_SCRIPT = path.join(__dirname, 'server.js') // runs in place from the package;
const PID_FILE = path.join(SHARDS_DIR, 'ui.pid');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');

if (!fs.existsSync(SERVER_SCRIPT)) {
  console.error('Shards UI server not found. Reinstall @proflandrigan/shards-studio.');
  process.exit(1);
}

// Check if server is already running
if (fs.existsSync(PID_FILE)) {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid && pid > 0) {
      process.kill(pid, 0); // throws if process doesn't exist
      process.exit(0);      // already running
    }
  } catch {
    // Process not running — clean up stale files
    try { fs.unlinkSync(PID_FILE); } catch {}
    try { fs.unlinkSync(PORT_FILE); } catch {}
  }
}

const child = spawn(process.execPath, [SERVER_SCRIPT, '--project', process.cwd()], {
  detached: true,
  stdio: 'ignore',
  cwd: process.cwd(),
});

child.unref();
process.exit(0);
