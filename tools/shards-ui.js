#!/usr/bin/env node

'use strict';

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ─── Constants ───────────────────────────────────────────────────────────────

const PROJECT_DIR = process.cwd();
const SHARDS_DIR = path.join(PROJECT_DIR, '.shards');
const PID_FILE = path.join(SHARDS_DIR, 'ui.pid');
const PORT_FILE = path.join(SHARDS_DIR, 'ui.port');

// UI source files live next to install.js in the package
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const UI_SRC = path.join(PACKAGE_ROOT, 'src', 'ui');

// Installed UI files in project
const UI_DEST = path.join(SHARDS_DIR, 'ui');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function isServerRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (pid && pid > 0) {
      process.kill(pid, 0); // throws if process doesn't exist
      return true;
    }
  } catch {
    // Process not running — clean up stale files
    try { fs.unlinkSync(PID_FILE); } catch {}
    try { fs.unlinkSync(PORT_FILE); } catch {}
  }
  return false;
}

function getPort() {
  try {
    const raw = fs.readFileSync(PORT_FILE, 'utf8').trim();
    // Support both JSON format (new) and plain number (old)
    try {
      const info = JSON.parse(raw);
      return info.port;
    } catch {
      return parseInt(raw, 10);
    }
  } catch {
    return null;
  }
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  try {
    execSync(command, { stdio: 'ignore' });
  } catch {
    console.log(`  Could not auto-open browser. Visit: ${url}`);
  }
}

function waitForServer(maxAttempts, cb) {
  let attempts = 0;
  function check() {
    const port = getPort();
    if (port) {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'HEAD' }, (res) => {
        cb(port);
      });
      req.on('error', () => {
        attempts++;
        if (attempts < maxAttempts) setTimeout(check, 300);
        else cb(port); // try anyway
      });
      req.end();
    } else {
      attempts++;
      if (attempts < maxAttempts) setTimeout(check, 300);
      else { console.error('  Server did not start in time.'); process.exit(1); }
    }
  }
  check();
}

// ─── Subcommands ─────────────────────────────────────────────────────────────

function cmdStop() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('  Shards UI is not running.');
    return;
  }
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 'SIGTERM');
    console.log(`  Stopped Shards UI server (PID ${pid}).`);
  } catch {
    console.log('  Server process not found (already stopped).');
  }
  try { fs.unlinkSync(PID_FILE); } catch {}
  try { fs.unlinkSync(PORT_FILE); } catch {}
}

function cmdStatus() {
  if (isServerRunning()) {
    const port = getPort();
    const pid = fs.readFileSync(PID_FILE, 'utf8').trim();
    console.log(`  Shards UI is running (PID ${pid}, port ${port}).`);
  } else {
    console.log('  Shards UI is not running.');
  }
}

function cmdStart() {
  console.log(`
  SHARDS UI
  ─────────────────────────────`);

  // 1. Ensure .shards/ exists
  fs.mkdirSync(SHARDS_DIR, { recursive: true });

  // 2. Copy UI source files to .shards/ui/
  console.log('  Installing UI files...');
  copyDir(UI_SRC, UI_DEST);

  // 3. Set up Claude Code hooks for relay
  setupHooks();

  // 4. Check if server is already running
  if (isServerRunning()) {
    const port = getPort();
    const url = `http://localhost:${port}`;
    console.log(`  Server already running at ${url}`);
    openBrowser(url);
    return;
  }

  // 5. Spawn server in background (redirect output to log file for diagnostics)
  console.log('  Starting server...');
  const serverScript = path.join(UI_DEST, 'server.js');
  const serverLogPath = path.join(SHARDS_DIR, 'server.log');
  const serverLogFd = fs.openSync(serverLogPath, 'a');
  const child = spawn(process.execPath, [serverScript], {
    detached: true,
    stdio: ['ignore', serverLogFd, serverLogFd],
    cwd: PROJECT_DIR,
  });
  child.unref();
  fs.closeSync(serverLogFd);

  // 6. Wait for server to be ready then open browser
  waitForServer(20, (port) => {
    const url = `http://localhost:${port}`;
    console.log(`  Server running at ${url}`);
    openBrowser(url);
    console.log(`
  Usage:
    shards-ui          Start UI and open browser
    shards-ui stop     Stop the UI server
    shards-ui status   Check if server is running
`);
  });
}

// ─── Claude Code hooks setup ─────────────────────────────────────────────────

function setupHooks() {
  const claudeDir = path.join(PROJECT_DIR, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const settingsPath = path.join(claudeDir, 'settings.json');
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {}
  }

  const relayScript = path.join(UI_DEST, 'relay.js');

  // Claude Code hooks format: {"matcher": "<tool_name_or_empty>", "hooks": [{"type": "command", "command": "..."}]}
  const requiredHooks = {
    UserPromptSubmit: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} user-prompt` }] },
    Stop: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} stop` }] },
    PostToolUse: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} post-tool-use` }] },
  };

  if (!settings.hooks) settings.hooks = {};

  let updated = false;

  for (const [hookName, hookDef] of Object.entries(requiredHooks)) {
    if (!settings.hooks[hookName]) {
      settings.hooks[hookName] = [];
    }

    const exists = settings.hooks[hookName].some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('relay.js'))
    );
    if (!exists) {
      settings.hooks[hookName].push(hookDef);
      updated = true;
    }
  }

  if (updated) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('  Configured Claude Code hooks for UI relay.');
  }
}

// ─── CLI Entry ───────────────────────────────────────────────────────────────

const subcommand = process.argv[2] || 'start';

switch (subcommand) {
  case 'start':
    cmdStart();
    break;
  case 'stop':
    cmdStop();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'help':
  case '--help':
  case '-h':
    console.log(`
  Shards UI — Real-time web dashboard for Shards agent sessions

  Usage:
    shards-ui          Start the UI server and open browser
    shards-ui stop     Stop the running UI server
    shards-ui status   Check if the UI server is running
    shards-ui help     Show this help message
`);
    break;
  default:
    console.log(`  Unknown command: ${subcommand}`);
    console.log('  Run "shards-ui help" for usage.');
    process.exit(1);
}
