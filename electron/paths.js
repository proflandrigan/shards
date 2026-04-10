'use strict';

/**
 * Resolves file paths for both development and packaged Electron builds.
 *
 * In development:
 *   electron/main.js runs from the repo root.
 *   src/, tools/, templates/ are sibling directories.
 *
 * When packaged:
 *   electron-builder bundles electron/*.js into app.asar.
 *   extraResources (src/, tools/, templates/) land in
 *   <app>/Contents/Resources/ (macOS) or <app>/resources/ (win/linux).
 *
 *   app.getAppPath()   -> .../app.asar
 *   process.resourcesPath -> .../Resources (macOS) or .../resources (win/linux)
 */

const { app } = require('electron');
const path = require('path');

function isPackaged() {
  return app.isPackaged;
}

function getSrcDir() {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'src');
  }
  return path.join(__dirname, '..', 'src');
}

function getUiDir() {
  return path.join(getSrcDir(), 'ui');
}

function getToolsDir() {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'tools');
  }
  return path.join(__dirname, '..', 'tools');
}

function getTemplatesDir() {
  if (isPackaged()) {
    return path.join(process.resourcesPath, 'templates');
  }
  return path.join(__dirname, '..', 'templates');
}

function getVendorDir() {
  if (isPackaged()) {
    // vendor/ is included in the app.asar via "files" config
    return path.join(app.getAppPath(), 'vendor');
  }
  return path.join(__dirname, 'vendor');
}

function getServerWorkerPath() {
  if (isPackaged()) {
    return path.join(app.getAppPath(), 'server-worker.js');
  }
  return path.join(__dirname, 'server-worker.js');
}

function getInstallScript() {
  return path.join(getToolsDir(), 'install.js');
}

function getIconPath() {
  // For tray icon — use the UI icon
  return path.join(getUiDir(), 'shards_icon.png');
}

module.exports = {
  isPackaged,
  getSrcDir,
  getUiDir,
  getToolsDir,
  getTemplatesDir,
  getVendorDir,
  getServerWorkerPath,
  getInstallScript,
  getIconPath
};
