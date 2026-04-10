'use strict';

const { app, BrowserWindow, dialog, ipcMain, Notification } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { WorkspaceRegistry } = require('./workspace-registry');
const { buildMenuBar } = require('./menus');
const { setupTray } = require('./tray');
const { ClaudeDetector } = require('./claude-detector');
const { setupHooksForProject } = require('./hook-setup');
const { saveWindowState, restoreWindowState } = require('./window-manager');
const { TerminalManager } = require('./terminal-manager');
const fs = require('fs');

const store = new Store({ name: 'shards-ide' });
const registry = new WorkspaceRegistry();
const terminalManager = new TerminalManager();
let claude; // ClaudeDetector instance, set in app.whenReady

// Single instance lock — prevent duplicate app launches
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', (_event, argv) => {
  // If user launches again with a path arg, open that project
  const projectDir = argv.find((a, i) => i > 0 && !a.startsWith('-'));
  if (projectDir) {
    openProject(projectDir);
  } else {
    // Focus the most recent window
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      const win = wins[0];
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  }
});

async function openProject(projectDir) {
  // Check if already open
  const existing = registry.findByProject(projectDir);
  if (existing) {
    existing.window.focus();
    return;
  }

  // Check if shards is installed in this project
  const agentsDir = path.join(projectDir, '.claude', 'agents');
  if (!fs.existsSync(agentsDir)) {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      title: 'Install Shards',
      message: `This project doesn't have Shards installed.\n\nWould you like to install Shards agents into:\n${projectDir}`,
      buttons: ['Install', 'Open Anyway', 'Cancel'],
      defaultId: 0
    });
    if (response === 2) return; // Cancel
    if (response === 0) {
      try {
        const { execSync } = require('child_process');
        execSync(`node "${path.join(__dirname, '..', 'tools', 'install.js')}"`, {
          cwd: projectDir,
          stdio: 'pipe'
        });
      } catch (err) {
        dialog.showErrorBox('Install Failed', `Could not install Shards: ${err.message}`);
      }
    }
  }

  // Auto-setup relay hooks
  setupHooksForProject(projectDir);

  // Import server factory (lazy — avoids loading at startup if not needed)
  const { createServer } = require('../src/ui/server');
  const serverPath = path.join(__dirname, '..', 'src', 'ui');

  const { port, authToken, shutdown } = await createServer(projectDir, {
    uiDir: serverPath,
    electronMode: true,
    vendorDir: path.join(__dirname, 'vendor')
  });

  const saved = restoreWindowState(store);
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    title: `${path.basename(projectDir)} — Shards IDE`,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (saved.maximized) win.maximize();

  registry.add(win.id, { projectDir, port, authToken, server: null, shutdown, window: win });

  // Save window bounds on move/resize
  const debouncedSave = debounce(() => saveWindowState(store, win), 500);
  win.on('resize', debouncedSave);
  win.on('move', debouncedSave);

  win.on('closed', () => {
    const entry = registry.get(win.id);
    if (entry && entry.shutdown) entry.shutdown();
    registry.remove(win.id);
  });

  // Handle folder drag-and-drop onto the window
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Load the UI
  win.loadURL(`http://127.0.0.1:${port}/`);

  // Track recent projects
  const recents = store.get('recentProjects', []);
  const updated = [projectDir, ...recents.filter(p => p !== projectDir)].slice(0, 10);
  store.set('recentProjects', updated);
}

async function showFolderPicker() {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Open Project Folder'
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
}

app.whenReady().then(async () => {
  // Check for Claude CLI
  claude = new ClaudeDetector(store);
  const claudePath = claude.detect();
  if (!claudePath) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Claude CLI not found',
      message: 'Claude Code CLI was not found in your PATH.\n\nShards IDE requires Claude Code to function. Install it with:\n\n  npm install -g @anthropic-ai/claude-code\n\nThe app will continue but chat features will not work.',
      buttons: ['OK']
    });
  }

  // Set up native menu bar
  buildMenuBar({ openProject: showFolderPicker, registry, store });

  // Set up system tray
  setupTray({ registry, store });

  // Open project from CLI arg or show welcome/picker
  const projectArg = process.argv.find((a, i) => i > 1 && !a.startsWith('-'));
  let projectDir = projectArg || null;

  if (!projectDir) {
    const recents = store.get('recentProjects', []);
    if (recents.length > 0) {
      projectDir = recents[0];
    } else {
      projectDir = await showFolderPicker();
    }
  }

  if (projectDir) {
    await openProject(projectDir);
  } else {
    // Show welcome window instead of quitting
    await showWelcomeWindow();
  }
});

// macOS: re-create window when dock icon clicked and no windows open
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await showWelcomeWindow();
  }
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('get-project-dir', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const entry = registry.get(win?.id);
  return entry?.projectDir || null;
});

ipcMain.handle('get-recent-projects', () => {
  return store.get('recentProjects', []);
});

ipcMain.handle('open-folder', async () => {
  const dir = await showFolderPicker();
  if (dir) await openProject(dir);
  return dir;
});

// Claude CLI status
ipcMain.handle('get-claude-status', () => {
  if (!claude) return { installed: false, path: null, version: null };
  const claudePath = store.get('claudePath');
  return {
    installed: !!claudePath,
    path: claudePath || null,
    version: claude.getVersion()
  };
});

// Native notifications
ipcMain.on('notification:show', (_event, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

// Drag-and-drop: renderer sends dropped folder paths
ipcMain.on('drop:folder', (_event, folderPath) => {
  if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
    openProject(folderPath);
  }
});

// ─── Terminal IPC ────────────────────────────────────────────────────────────

ipcMain.handle('terminal:create', (event, opts = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const entry = registry.get(win?.id);
  const cwd = opts.cwd || entry?.projectDir || process.cwd();

  const id = terminalManager.create({
    cwd,
    cols: opts.cols,
    rows: opts.rows,
    onData: (termId, data) => {
      if (!win.isDestroyed()) {
        win.webContents.send('terminal:data', termId, data);
      }
    },
    onExit: (termId, code) => {
      if (!win.isDestroyed()) {
        win.webContents.send('terminal:exit', termId, code);
      }
    }
  });

  return id;
});

ipcMain.on('terminal:write', (_event, id, data) => {
  terminalManager.write(id, data);
});

ipcMain.on('terminal:resize', (_event, id, cols, rows) => {
  terminalManager.resize(id, cols, rows);
});

ipcMain.on('terminal:destroy', (_event, id) => {
  terminalManager.destroy(id);
});

// Clean up all terminals on app quit
app.on('before-quit', () => {
  terminalManager.destroyAll();
});

// ─── Welcome window ──────────────────────────────────────────────────────────

async function showWelcomeWindow() {
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 600,
    height: 450,
    resizable: false,
    title: 'Shards IDE',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const recents = store.get('recentProjects', []);
  const recentItems = recents.map(p =>
    `<li class="recent" data-path="${p.replace(/"/g, '&quot;')}">${path.basename(p)}<span class="path">${p}</span></li>`
  ).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
    background: #1a1a2e; color: #e0e0e0; padding: ${isMac ? '40px' : '20px'} 32px 20px;
    -webkit-app-region: drag; height: 100vh; display: flex; flex-direction: column; }
  h1 { font-size: 24px; font-weight: 600; margin-bottom: 4px; color: #fff; }
  .subtitle { color: #888; font-size: 13px; margin-bottom: 24px; }
  .actions { display: flex; gap: 12px; margin-bottom: 24px; -webkit-app-region: no-drag; }
  button { background: #6c5ce7; color: #fff; border: none; padding: 10px 20px;
    border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; }
  button:hover { background: #7d6ff0; }
  .recents-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;
    color: #666; margin-bottom: 8px; }
  ul { list-style: none; flex: 1; overflow-y: auto; -webkit-app-region: no-drag; }
  li.recent { padding: 8px 12px; border-radius: 6px; cursor: pointer; display: flex;
    align-items: center; justify-content: space-between; }
  li.recent:hover { background: #2a2a4a; }
  li.recent .path { font-size: 11px; color: #666; margin-left: 12px; }
  .empty { color: #555; font-size: 13px; padding: 12px; }
</style></head><body>
  <h1>Shards IDE</h1>
  <p class="subtitle">Shards of JFL's brain — data-focused agents for Claude Code</p>
  <div class="actions">
    <button onclick="window.shardsElectron.project.openFolder()">Open Folder</button>
  </div>
  ${recents.length > 0 ? `<div class="recents-label">Recent Projects</div><ul>${recentItems}</ul>` : '<p class="empty">No recent projects. Open a folder to get started.</p>'}
  <script>
    document.querySelectorAll('.recent').forEach(el => {
      el.addEventListener('click', () => {
        const p = el.dataset.path;
        if (p) window.shardsElectron.project.openFolder();
      });
    });
  </script>
</body></html>`;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
