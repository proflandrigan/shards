'use strict';

// Window state save/restore utilities.
// Used by main.js to persist and restore window position and size.

function saveWindowState(store, win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  store.set('windowWidth', bounds.width);
  store.set('windowHeight', bounds.height);
  store.set('windowX', bounds.x);
  store.set('windowY', bounds.y);
  store.set('windowMaximized', win.isMaximized());
}

function restoreWindowState(store) {
  return {
    width: store.get('windowWidth', 1400),
    height: store.get('windowHeight', 900),
    x: store.get('windowX', undefined),
    y: store.get('windowY', undefined),
    maximized: store.get('windowMaximized', false)
  };
}

module.exports = { saveWindowState, restoreWindowState };
