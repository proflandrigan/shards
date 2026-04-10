'use strict';

/**
 * Auto-updater using electron-updater with GitHub Releases.
 *
 * Checks for updates silently on startup. If an update is found,
 * notifies the user and downloads it. Install happens on next quit.
 */

const { dialog, Notification } = require('electron');

let autoUpdater;

function initUpdater(log) {
  // electron-updater is a devDependency that only works in packaged builds.
  // In development, skip silently.
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch {
    if (log) log('Auto-updater not available (development mode)');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    if (log) log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    if (log) log(`Update available: v${info.version}`);

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: 'Shards IDE Update Available',
        body: `Version ${info.version} is available. Click to download.`
      });
      notif.on('click', () => {
        autoUpdater.downloadUpdate();
      });
      notif.show();
    } else {
      // Fallback to dialog
      dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `Shards IDE v${info.version} is available.`,
        detail: 'Would you like to download and install it?',
        buttons: ['Download', 'Later'],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    if (log) log('No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    if (log) log(`Download progress: ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (log) log(`Update downloaded: v${info.version}`);

    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Shards IDE v${info.version} has been downloaded.`,
      detail: 'The update will be installed when you quit the app. Restart now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', (err) => {
    if (log) log(`Auto-update error: ${err.message}`);
  });
}

function checkForUpdates() {
  if (autoUpdater) {
    autoUpdater.checkForUpdates().catch(() => {
      // Silent failure — network may be unavailable
    });
  }
}

module.exports = { initUpdater, checkForUpdates };
