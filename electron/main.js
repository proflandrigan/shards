'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { WorkspaceRegistry } = require('./workspace-registry');
const { buildMenuBar } = require('./menus');
const { setupTray } = require('./tray');
const { ClaudeDetector } = require('./claude-detector');
const { setupHooksForProject } = require('./hook-setup');
const fs = require('fs');

const store = new Store({ name: 'shards-ide' });
const registry = new WorkspaceRegistry();

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

  const win = new BrowserWindow({
    width: store.get('windowWidth', 1400),
    height: store.get('windowHeight', 900),
    x: store.get('windowX', undefined),
    y: store.get('windowY', undefined),
    title: `${path.basename(projectDir)} — Shards IDE`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  registry.add(win.id, { projectDir, port, authToken, server: null, shutdown, window: win });

  // Save window bounds on move/resize
  const saveBounds = () => {
    const bounds = win.getBounds();
    store.set('windowWidth', bounds.width);
    store.set('windowHeight', bounds.height);
    store.set('windowX', bounds.x);
    store.set('windowY', bounds.y);
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.on('closed', () => {
    const entry = registry.get(win.id);
    if (entry && entry.shutdown) entry.shutdown();
    registry.remove(win.id);
  });

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
  const claude = new ClaudeDetector(store);
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

  // Open project from CLI arg or show folder picker
  const projectArg = process.argv.find((a, i) => i > 1 && !a.startsWith('-'));
  let projectDir = projectArg || null;

  if (!projectDir) {
    // Try last opened project
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
    app.quit();
  }
});

// macOS: re-create window when dock icon clicked and no windows open
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    const projectDir = await showFolderPicker();
    if (projectDir) await openProject(projectDir);
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
