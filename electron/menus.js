'use strict';

const { Menu, app, BrowserWindow } = require('electron');

function buildMenuBar({ openProject, showFolderPicker, registry, store, checkForUpdates }) {
  const isMac = process.platform === 'darwin';
  const folderPicker = showFolderPicker || openProject;

  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),

    // File
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendToFocused('new-chat')
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const dir = await folderPicker();
            if (dir) openProject(dir);
          }
        },
        { type: 'separator' },
        {
          label: 'Recent Projects',
          submenu: buildRecentsSubmenu(store, openProject)
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },

    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },

    // View
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => sendToFocused('toggle-sidebar')
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'Ctrl+`',
          click: () => sendToFocused('toggle-terminal')
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // Chat
    {
      label: 'Chat',
      submenu: [
        {
          label: 'New Session',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendToFocused('new-chat')
        },
        {
          label: 'Switch Agent...',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => sendToFocused('switch-agent')
        },
        { type: 'separator' },
        {
          label: 'Stop Session',
          accelerator: 'CmdOrCtrl+.',
          click: () => sendToFocused('stop-session')
        }
      ]
    },

    // Help
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            require('electron').shell.openExternal('https://github.com/proflandrigan/shards');
          }
        },
        {
          label: 'Check for Updates...',
          click: () => { if (checkForUpdates) checkForUpdates(); }
        },
        { type: 'separator' },
        {
          label: 'About Shards IDE',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox({
              type: 'info',
              title: 'About Shards IDE',
              message: `Shards IDE v${app.getVersion()}`,
              detail: 'A desktop application for the Shards agent suite.\n\nShards of JFL\'s brain — data-focused agents for Claude Code.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function buildRecentsSubmenu(store, openProject) {
  const recents = store.get('recentProjects', []);
  if (recents.length === 0) {
    return [{ label: 'No Recent Projects', enabled: false }];
  }
  const path = require('path');
  return recents.map(dir => ({
    label: `${path.basename(dir)}  —  ${dir}`,
    click: () => openProject(dir)
  }));
}

function sendToFocused(action) {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send(`menu:${action}`);
  }
}

module.exports = { buildMenuBar };
