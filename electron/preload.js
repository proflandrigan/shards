'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shardsElectron', {
  isElectron: true,

  // Project info
  project: {
    getDir: () => ipcRenderer.invoke('get-project-dir'),
    getRecents: () => ipcRenderer.invoke('get-recent-projects'),
    openFolder: () => ipcRenderer.invoke('open-folder')
  },

  // Terminal (Phase 3 — stubs for now)
  terminal: {
    create: (opts) => ipcRenderer.invoke('terminal:create', opts),
    write: (id, data) => ipcRenderer.send('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
    destroy: (id) => ipcRenderer.send('terminal:destroy', id),
    onData: (callback) => ipcRenderer.on('terminal:data', (_e, id, data) => callback(id, data)),
    onExit: (callback) => ipcRenderer.on('terminal:exit', (_e, id, code) => callback(id, code))
  },

  // Menu event listeners
  onMenuAction: (action, callback) => {
    ipcRenderer.on(`menu:${action}`, () => callback());
  }
});
