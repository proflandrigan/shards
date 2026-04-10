'use strict';

const { Tray, Menu, app, nativeImage, BrowserWindow } = require('electron');
const path = require('path');

let tray = null;

function setupTray({ registry, store }) {
  // Create a small tray icon (16x16 template image)
  const iconPath = path.join(__dirname, '..', 'src', 'ui', 'shards_icon.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }
  } catch {
    // Fallback: empty icon if image not found
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Shards IDE');

  // Rebuild context menu periodically when clicked
  tray.on('click', () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
      wins[0].show();
      wins[0].focus();
    }
  });

  // Right-click context menu
  const updateMenu = () => {
    const workspaces = registry.all();
    const items = [
      { label: `Shards IDE — ${workspaces.length} project${workspaces.length !== 1 ? 's' : ''} open`, enabled: false },
      { type: 'separator' }
    ];

    if (workspaces.length > 0) {
      workspaces.forEach(ws => {
        const name = path.basename(ws.projectDir);
        const isFocused = ws.window.isFocused();
        items.push({
          label: `${isFocused ? '\u25CF ' : '  '}${name}`,
          sublabel: ws.projectDir,
          click: () => { ws.window.show(); ws.window.focus(); }
        });
      });
    } else {
      items.push({ label: 'No open projects', enabled: false });
    }

    items.push(
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    );

    tray.setContextMenu(Menu.buildFromTemplate(items));
  };

  updateMenu();
  // Update menu each time it's about to be shown
  tray.on('right-click', updateMenu);
}

module.exports = { setupTray };
