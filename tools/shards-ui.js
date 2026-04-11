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

// ─── Permission presets ──────────────────────────────────────────────────────

const PERMISSION_PRESETS = {
  permissive: [
    'Bash(find:*)', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(ls:*)',
    'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)',
    'Bash(git log:*)', 'Bash(git status:*)', 'Bash(git diff:*)',
    'Bash(git branch:*)', 'Bash(git show:*)',
    'Bash(echo:*)', 'Bash(pwd:*)', 'Bash(which:*)', 'Bash(env:*)',
    'Bash(python:*)', 'Bash(python3:*)', 'Bash(node:*)',
    'Bash(npm:*)', 'Bash(pip:*)', 'Bash(pip3:*)',
  ],
  readonly: [
    'Bash(find:*)', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(ls:*)',
    'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)',
    'Bash(git log:*)', 'Bash(git status:*)', 'Bash(git diff:*)',
    'Bash(git branch:*)', 'Bash(git show:*)',
    'Bash(echo:*)', 'Bash(pwd:*)', 'Bash(which:*)',
  ],
};

function parseCliPermissions() {
  const args = process.argv.slice(3); // skip node, script, subcommand
  const allow = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--permissions' && args[i + 1]) {
      const preset = args[i + 1].toLowerCase();
      if (PERMISSION_PRESETS[preset]) {
        allow.push(...PERMISSION_PRESETS[preset]);
      } else {
        console.error(`  Unknown preset: ${args[i + 1]}. Available: ${Object.keys(PERMISSION_PRESETS).join(', ')}`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--allow' && args[i + 1]) {
      const patterns = args[i + 1].split(',').map(p => p.trim()).filter(Boolean);
      for (const p of patterns) {
        // If it looks like a raw command (no parens), wrap it in Bash(...)
        allow.push(p.includes('(') ? p : `Bash(${p}:*)`);
      }
      i++;
    }
  }

  return allow;
}

// ─── Claude Code hooks setup ─────────────────────────────────────────────────

function setupHooks() {
  const relayScript = path.join(UI_DEST, 'relay.js');

  // 1. Claude Code hooks
  const claudeDir = path.join(PROJECT_DIR, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  const claudeSettingsPath = path.join(claudeDir, 'settings.json');
  let claudeSettings = {};
  if (fs.existsSync(claudeSettingsPath)) {
    try {
      claudeSettings = JSON.parse(fs.readFileSync(claudeSettingsPath, 'utf8'));
    } catch {}
  }

  // Claude Code hooks format: {"matcher": "<tool_name_or_empty>", "hooks": [{"type": "command", "command": "..."}]}
  const requiredClaudeHooks = {
    UserPromptSubmit: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} user-prompt` }] },
    Stop: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} stop` }] },
    PostToolUse: { matcher: '', hooks: [{ type: 'command', command: `node ${relayScript} post-tool-use` }] },
    PreToolUse: { matcher: 'Bash', hooks: [{ type: 'command', command: `node ${relayScript} pre-tool-use` }] },
  };

  if (!claudeSettings.hooks) claudeSettings.hooks = {};

  let claudeUpdated = false;

  for (const [hookName, hookDef] of Object.entries(requiredClaudeHooks)) {
    if (!claudeSettings.hooks[hookName]) {
      claudeSettings.hooks[hookName] = [];
    }

    const exists = claudeSettings.hooks[hookName].some(entry =>
      entry.hooks && entry.hooks.some(h => h.command && h.command.includes('relay.js'))
    );
    if (!exists) {
      claudeSettings.hooks[hookName].push(hookDef);
      claudeUpdated = true;
    }
  }

  // Add Bash permission for ui-push.js so agents can push panels without approval prompts
  if (!claudeSettings.permissions) claudeSettings.permissions = {};
  if (!claudeSettings.permissions.allow) claudeSettings.permissions.allow = [];

  const uiPushPermission = 'Bash(node .shards/ui/ui-push.js:*)';
  if (!claudeSettings.permissions.allow.includes(uiPushPermission)) {
    claudeSettings.permissions.allow.push(uiPushPermission);
    claudeUpdated = true;
  }

  const relayPreToolPermission = 'Bash(node .shards/ui/relay.js pre-tool-use*)';
  if (!claudeSettings.permissions.allow.includes(relayPreToolPermission)) {
    claudeSettings.permissions.allow.push(relayPreToolPermission);
    claudeUpdated = true;
  }

  // Apply CLI --allow / --permissions flags
  const cliPermissions = parseCliPermissions();
  for (const perm of cliPermissions) {
    if (!claudeSettings.permissions.allow.includes(perm)) {
      claudeSettings.permissions.allow.push(perm);
      claudeUpdated = true;
    }
  }

  if (claudeUpdated) {
    fs.writeFileSync(claudeSettingsPath, JSON.stringify(claudeSettings, null, 2));
    console.log('  Configured Claude Code hooks for UI relay.');
  }

  // 2. Gemini CLI hooks
  const geminiDir = path.join(PROJECT_DIR, '.gemini');
  fs.mkdirSync(geminiDir, { recursive: true });

  const geminiSettingsPath = path.join(geminiDir, 'settings.json');
  let geminiSettings = {};
  if (fs.existsSync(geminiSettingsPath)) {
    try {
      geminiSettings = JSON.parse(fs.readFileSync(geminiSettingsPath, 'utf8'));
    } catch {}
  }

  if (!geminiSettings.hooks) geminiSettings.hooks = {};

  let geminiUpdated = false;

  // Gemini CLI hooks format: {"BeforeAgent": [{"type": "command", "command": "..."}]}
  const geminiHookMapping = {
    BeforeAgent: `node ${relayScript}`,
    AfterAgent: `node ${relayScript}`,
    BeforeTool: `node ${relayScript}`,
    AfterTool: `node ${relayScript}`,
    SessionEnd: `node ${relayScript}`,
  };

  for (const [hookName, command] of Object.entries(geminiHookMapping)) {
    if (!geminiSettings.hooks[hookName]) {
      geminiSettings.hooks[hookName] = [];
    }

    const exists = geminiSettings.hooks[hookName].some(h =>
      h.command && h.command.includes('relay.js')
    );
    if (!exists) {
      geminiSettings.hooks[hookName].push({
        type: 'command',
        command: command,
      });
      geminiUpdated = true;
    }
  }

  if (geminiUpdated) {
    fs.writeFileSync(geminiSettingsPath, JSON.stringify(geminiSettings, null, 2));
    console.log('  Configured Gemini CLI hooks for UI relay.');
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
    shards-ui                             Start the UI server and open browser
    shards-ui stop                        Stop the running UI server
    shards-ui status                      Check if the UI server is running
    shards-ui help                        Show this help message

  Permission flags (used with start):
    --permissions <preset>                Apply a permission preset
    --allow <pattern>[,<pattern>,...]     Allow specific tool patterns

  Presets:
    permissive    Read-only shell tools + git + python/node/npm/pip
    readonly      Read-only shell tools + git only

  Examples:
    shards-ui start --permissions permissive
    shards-ui start --allow "find,grep,ls"
    shards-ui start --allow "Bash(python3:*),Bash(pytest:*)"
`);
    break;
  default:
    console.log(`  Unknown command: ${subcommand}`);
    console.log('  Run "shards-ui help" for usage.');
    process.exit(1);
}
