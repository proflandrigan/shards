#!/usr/bin/env node
'use strict';

/**
 * shards-studio — launcher for the Studio web viewer.
 *
 *   shards-studio [start] [--project <dir>] [--port <n>] [--no-open]
 *   shards-studio stop|status [--project <dir>]
 *
 * Runs in place from the package. It does NOT write Claude Code hooks or copy
 * any sources into the project; artifacts are read from .shards/events.jsonl.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(name);
  return i !== -1 ? (argv[i + 1] || true) : undefined;
}
const positional = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').match(/^--(project|port)$/));
const subcommand = positional[0] || 'start';

const PROJECT_DIR = path.resolve(typeof flag('--project') === 'string' ? flag('--project') : process.cwd());
const SHARDS_DIR = path.join(PROJECT_DIR, '.shards');
const PID_FILE = path.join(SHARDS_DIR, 'studio.pid');
const PORT_FILE = path.join(SHARDS_DIR, 'studio.port');
const LOG_FILE = path.join(SHARDS_DIR, 'studio.log');
const SERVER = path.join(__dirname, '..', 'server.js');

function rm(f) { try { fs.unlinkSync(f); } catch {} }

function runningPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid > 0) { process.kill(pid, 0); return pid; }
  } catch {
    if (fs.existsSync(PID_FILE)) { rm(PID_FILE); rm(PORT_FILE); } // stale
  }
  return null;
}

function getPort() {
  try {
    const raw = fs.readFileSync(PORT_FILE, 'utf8').trim();
    try { return JSON.parse(raw).port; } catch { return parseInt(raw, 10); }
  } catch { return null; }
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`;
  try { execSync(cmd, { stdio: 'ignore' }); } catch { console.log(`  Could not auto-open browser. Visit: ${url}`); }
}

function waitForServer(attempts, cb) {
  const port = getPort();
  if (port) {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'HEAD' }, () => cb(port));
    req.on('error', () => (attempts > 0 ? setTimeout(() => waitForServer(attempts - 1, cb), 300) : cb(port)));
    req.end();
  } else if (attempts > 0) {
    setTimeout(() => waitForServer(attempts - 1, cb), 300);
  } else {
    console.error('  Server did not start in time. See ' + LOG_FILE);
    process.exit(1);
  }
}

function cmdStop() {
  const pid = runningPid();
  if (!pid) { console.log('  Shards Studio is not running.'); return; }
  try { process.kill(pid, 'SIGTERM'); console.log(`  Stopped Shards Studio (PID ${pid}).`); }
  catch { console.log('  Server process not found (already stopped).'); }
  rm(PID_FILE); rm(PORT_FILE);
}

function cmdStatus() {
  const pid = runningPid();
  if (pid) console.log(`  Shards Studio is running (PID ${pid}, port ${getPort()}).`);
  else console.log('  Shards Studio is not running.');
}

function cmdStart() {
  const noOpen = argv.includes('--no-open');
  if (runningPid()) {
    const url = `http://localhost:${getPort()}`;
    console.log(`  Studio already running at ${url}`);
    if (!noOpen) openBrowser(url);
    return;
  }
  fs.mkdirSync(SHARDS_DIR, { recursive: true });
  console.log('  Starting Shards Studio for ' + PROJECT_DIR);
  const out = fs.openSync(LOG_FILE, 'a');
  const args = [SERVER, '--project', PROJECT_DIR];
  if (typeof flag('--port') === 'string') args.push('--port', flag('--port'));
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', out, out], cwd: PROJECT_DIR });
  child.unref();
  waitForServer(30, (port) => {
    const url = `http://localhost:${port}`;
    console.log(`  Studio running at ${url}`);
    if (!noOpen) openBrowser(url);
  });
}

switch (subcommand) {
  case 'start': cmdStart(); break;
  case 'stop': cmdStop(); break;
  case 'status': cmdStatus(); break;
  case 'help': case '--help': case '-h':
    console.log(`
  Shards Studio - local viewer for Shards artifacts

  Usage:
    shards-studio [start] [--project <dir>] [--port <n>] [--no-open]
    shards-studio stop
    shards-studio status
`);
    break;
  default:
    console.log(`  Unknown command: ${subcommand}\n  Run "shards-studio help" for usage.`);
    process.exit(1);
}
