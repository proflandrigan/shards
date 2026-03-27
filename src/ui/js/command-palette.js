// ═══════════════════════════════════════════════════════════════
// Command palette (Cmd+K)
// ═══════════════════════════════════════════════════════════════

var commandRegistry = [
  { label: 'Toggle Explorer', shortcut: 'Cmd+B', action: function() { toggleExplorer(); }, category: 'View' },
  { label: 'Toggle Split View', shortcut: 'Cmd+\\', action: function() { toggleSplit(); }, category: 'View' },
  { label: 'Toggle Theme', shortcut: '', action: function() { toggleTheme(); }, category: 'View' },
  { label: 'Switch to Chat', shortcut: 'Cmd+1', action: function() { switchTab('chat'); }, category: 'Navigation' },
  { label: 'Close Current Tab', shortcut: 'Cmd+W', action: function() { var k = getCurrentFileKey(); if (k && k !== 'chat') closeFileTab(k); }, category: 'Tabs' },
  { label: 'Close All Tabs', shortcut: '', action: function() { closeAllTabs(); }, category: 'Tabs' },
  { label: 'Quick Open File', shortcut: 'Cmd+P', action: function() { toggleQuickOpen(); }, category: 'Navigation' },
  { label: 'Go to Line', shortcut: 'Cmd+G', action: function() { if (activeMonacoInstance) activeMonacoInstance.getAction('editor.action.gotoLine').run(); }, category: 'Editor' },
  { label: 'Search Chat', shortcut: 'Cmd+F', action: function() { toggleChatSearch(); }, category: 'Chat' },
  { label: 'Settings', shortcut: 'Cmd+,', action: function() { toggleSettings(); }, category: 'View' },
  { label: 'Save Current File', shortcut: 'Cmd+S', action: function() { saveCurrentFile(); }, category: 'Editor' },
  { label: 'Copy File Path', shortcut: '', action: function() { copyCurrentFilePath(); }, category: 'Editor' },
  { label: 'Pin Selection to Context', shortcut: '', action: function() { if (typeof pinCurrentSelection === 'function') pinCurrentSelection(); }, category: 'Chat' },
  { label: 'Pin Current File to Context', shortcut: '', action: function() { var k = getCurrentFileKey(); if (k && k !== 'chat' && typeof pinFileByPath === 'function') pinFileByPath(k); }, category: 'Chat' },
  { label: 'Clear All Pins', shortcut: '', action: function() { if (typeof clearAllPins === 'function') clearAllPins(); }, category: 'Chat' },
];

var cmdPaletteIdx = -1;

function toggleCommandPalette() {
  var overlay = document.getElementById('command-palette-overlay');
  var isVisible = overlay.classList.contains('visible');
  if (isVisible) {
    overlay.classList.remove('visible');
    return;
  }
  overlay.classList.add('visible');
  var input = document.getElementById('command-palette-input');
  input.value = '';
  input.focus();
  cmdPaletteIdx = -1;
  renderCommandPaletteResults('');
}

function renderCommandPaletteResults(query) {
  var container = document.getElementById('command-palette-results');
  var q = query.toLowerCase();
  var filtered = commandRegistry.filter(function(cmd) {
    return !q || cmd.label.toLowerCase().indexOf(q) !== -1 || cmd.category.toLowerCase().indexOf(q) !== -1;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="overlay-empty">No matching commands</div>';
    return;
  }

  container.innerHTML = '';
  for (var i = 0; i < filtered.length; i++) {
    var cmd = filtered[i];
    var item = document.createElement('div');
    item.className = 'overlay-item' + (i === cmdPaletteIdx ? ' active' : '');
    item.innerHTML =
      '<span>' + esc(cmd.label) + '<span class="overlay-item-category">' + esc(cmd.category) + '</span></span>' +
      (cmd.shortcut ? '<span class="overlay-item-shortcut">' + esc(cmd.shortcut) + '</span>' : '');
    item.addEventListener('click', (function(action) {
      return function() {
        document.getElementById('command-palette-overlay').classList.remove('visible');
        action();
      };
    })(cmd.action));
    container.appendChild(item);
  }
}

document.getElementById('command-palette-input').addEventListener('input', function() {
  cmdPaletteIdx = -1;
  renderCommandPaletteResults(this.value);
});

document.getElementById('command-palette-input').addEventListener('keydown', function(e) {
  var container = document.getElementById('command-palette-results');
  var items = container.querySelectorAll('.overlay-item');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdPaletteIdx = Math.min(cmdPaletteIdx + 1, items.length - 1);
    updateCmdPaletteActive(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdPaletteIdx = Math.max(cmdPaletteIdx - 1, 0);
    updateCmdPaletteActive(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (cmdPaletteIdx >= 0 && items[cmdPaletteIdx]) {
      items[cmdPaletteIdx].click();
    } else if (items.length > 0) {
      items[0].click();
    }
  } else if (e.key === 'Escape') {
    document.getElementById('command-palette-overlay').classList.remove('visible');
  }
});

function updateCmdPaletteActive(items) {
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', i === cmdPaletteIdx);
  }
  if (items[cmdPaletteIdx]) {
    items[cmdPaletteIdx].scrollIntoView({ block: 'nearest' });
  }
}
