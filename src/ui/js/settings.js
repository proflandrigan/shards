// ═══════════════════════════════════════════════════════════════
// Settings panel (Cmd+,)
// ═══════════════════════════════════════════════════════════════

function toggleSettings() {
  var overlay = document.getElementById('settings-overlay');
  var isVisible = overlay.classList.contains('visible');
  if (isVisible) {
    overlay.classList.remove('visible');
    return;
  }
  // Sync current values
  var prefs = loadPreferences();
  document.getElementById('settings-theme').value = prefs.theme;
  document.getElementById('settings-font-size').value = prefs.fontSize;
  document.getElementById('settings-editor-font-size').value = prefs.editorFontSize;
  overlay.classList.add('visible');
}

function loadPreferences() {
  try {
    var saved = JSON.parse(localStorage.getItem('shards-preferences') || '{}');
    return {
      theme: saved.theme || (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'),
      fontSize: saved.fontSize || 13,
      editorFontSize: saved.editorFontSize || 13,
    };
  } catch(e) {
    return { theme: 'dark', fontSize: 13, editorFontSize: 13 };
  }
}

function savePreferences(prefs) {
  localStorage.setItem('shards-preferences', JSON.stringify(prefs));
}

function applySettingsTheme(value) {
  if (value === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('shards-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('shards-theme', 'dark');
  }
  updateThemeIcon();
  if (typeof monaco !== 'undefined') {
    monaco.editor.setTheme(currentMonacoTheme());
  }
  var prefs = loadPreferences();
  prefs.theme = value;
  savePreferences(prefs);
}

function applySettingsFontSize(value) {
  var size = Math.max(10, Math.min(20, parseInt(value) || 13));
  document.documentElement.style.setProperty('--ui-font-size', size + 'px');
  document.body.style.fontSize = size + 'px';
  var prefs = loadPreferences();
  prefs.fontSize = size;
  savePreferences(prefs);
}

function applySettingsEditorFontSize(value) {
  var size = Math.max(10, Math.min(24, parseInt(value) || 13));
  document.documentElement.style.setProperty('--editor-font-size', size + 'px');
  var prefs = loadPreferences();
  prefs.editorFontSize = size;
  savePreferences(prefs);
}

function resetLayout() {
  localStorage.removeItem('shards-layout');
  localStorage.removeItem('shards-preferences');
  document.documentElement.style.removeProperty('--ui-font-size');
  document.documentElement.style.removeProperty('--editor-font-size');
  document.body.style.fontSize = '';
  document.getElementById('settings-overlay').classList.remove('visible');
}

// ═══════════════════════════════════════════════════════════════
// Chat search (Cmd+F in chat)
// ═══════════════════════════════════════════════════════════════

var chatSearchMatches = [];
var chatSearchIdx = -1;

function toggleChatSearch() {
  var bar = document.getElementById('chat-search-bar');
  var isVisible = bar.classList.contains('visible');
  if (isVisible) {
    bar.classList.remove('visible');
    clearChatSearchHighlights();
    return;
  }
  bar.classList.add('visible');
  var input = document.getElementById('chat-search-input');
  input.value = '';
  input.focus();
  chatSearchMatches = [];
  chatSearchIdx = -1;
  document.getElementById('chat-search-count').textContent = '';
}

function clearChatSearchHighlights() {
  var msgs = document.querySelectorAll('.message.search-highlight');
  for (var i = 0; i < msgs.length; i++) {
    msgs[i].classList.remove('search-highlight');
  }
  chatSearchMatches = [];
  chatSearchIdx = -1;
}

function executeChatSearch(query) {
  clearChatSearchHighlights();
  if (!query) {
    document.getElementById('chat-search-count').textContent = '';
    return;
  }
  var q = query.toLowerCase();
  var messages = document.querySelectorAll('#messages .message');
  chatSearchMatches = [];
  for (var i = 0; i < messages.length; i++) {
    var bubble = messages[i].querySelector('.message-bubble');
    if (bubble && bubble.textContent.toLowerCase().indexOf(q) !== -1) {
      chatSearchMatches.push(messages[i]);
    }
  }
  if (chatSearchMatches.length > 0) {
    chatSearchIdx = 0;
    chatSearchMatches[0].classList.add('search-highlight');
    chatSearchMatches[0].scrollIntoView({ block: 'center' });
  }
  document.getElementById('chat-search-count').textContent =
    chatSearchMatches.length > 0 ? (chatSearchIdx + 1) + ' of ' + chatSearchMatches.length : 'No results';
}

function chatSearchNav(dir) {
  if (chatSearchMatches.length === 0) return;
  chatSearchMatches[chatSearchIdx].classList.remove('search-highlight');
  chatSearchIdx = (chatSearchIdx + dir + chatSearchMatches.length) % chatSearchMatches.length;
  chatSearchMatches[chatSearchIdx].classList.add('search-highlight');
  chatSearchMatches[chatSearchIdx].scrollIntoView({ block: 'center' });
  document.getElementById('chat-search-count').textContent = (chatSearchIdx + 1) + ' of ' + chatSearchMatches.length;
}

document.getElementById('chat-search-input').addEventListener('input', function() {
  executeChatSearch(this.value);
});

document.getElementById('chat-search-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    chatSearchNav(e.shiftKey ? -1 : 1);
  } else if (e.key === 'Escape') {
    toggleChatSearch();
  }
});

// ═══════════════════════════════════════════════════════════════
// Layout persistence
// ═══════════════════════════════════════════════════════════════

var layoutSaveTimeout = null;

function saveLayout() {
  if (layoutSaveTimeout) clearTimeout(layoutSaveTimeout);
  layoutSaveTimeout = setTimeout(function() {
    var sidebar = document.getElementById('explorer-sidebar');
    var layout = {
      openTabs: fileTabOrder.slice(),
      activeTab: activeTabId,
      splitMode: splitMode,
      currentFileInPane: currentFileInPane,
      explorerCollapsed: sidebar.classList.contains('collapsed'),
      explorerWidth: sidebar.style.width || null,
      activeSidebarView: activeSidebarView,
    };
    localStorage.setItem('shards-layout', JSON.stringify(layout));
  }, 100);
}

function restoreLayout() {
  try {
    var raw = localStorage.getItem('shards-layout');
    if (!raw) return;
    var layout = JSON.parse(raw);

    // Restore explorer state
    var sidebar = document.getElementById('explorer-sidebar');
    if (layout.explorerCollapsed) sidebar.classList.add('collapsed');
    if (layout.explorerWidth) sidebar.style.width = layout.explorerWidth;

    // Restore active sidebar view
    if (layout.activeSidebarView && typeof switchSidebarView === 'function') {
      switchSidebarView(layout.activeSidebarView);
    }

    // Restore split mode
    if (layout.splitMode && !splitMode) toggleSplit();

    // Re-open tabs (fetch content from server)
    if (layout.openTabs && layout.openTabs.length > 0) {
      for (var i = 0; i < layout.openTabs.length; i++) {
        openFileFromExplorer(layout.openTabs[i]);
      }
      // After files load, restore active tab
      setTimeout(function() {
        if (layout.activeTab && layout.activeTab !== 'chat') {
          if (openFiles[layout.activeTab]) switchTab(layout.activeTab);
        }
        if (layout.splitMode && layout.currentFileInPane && openFiles[layout.currentFileInPane]) {
          currentFileInPane = layout.currentFileInPane;
          renderWsTabs();
          showActiveContent();
        }
      }, 300);
    }
  } catch(e) {
    // Ignore errors restoring layout
  }
}

// ═══════════════════════════════════════════════════════════════
// Session files view (activity bar panel)
// ═══════════════════════════════════════════════════════════════

function renderSessionFiles() {
  var list = document.getElementById('session-files-list');
  var countEl = document.getElementById('session-file-count');
  if (!list) return;

  list.innerHTML = '';

  // Convert to array and show most recent first (reverse order of Set iteration)
  var files = [];
  sessionTouchedFiles.forEach(function(f) { files.push(f); });
  files.reverse();

  // Update count display
  if (countEl) {
    countEl.textContent = files.length > 0 ? files.length + ' file' + (files.length !== 1 ? 's' : '') : '';
  }

  // Update badge on activity bar button
  updateSessionBadge(files.length);

  for (var i = 0; i < files.length; i++) {
    var entry = document.createElement('div');
    entry.className = 'session-file-entry';
    var name = files[i].split('/').pop();
    entry.innerHTML = '<span class="dir-icon">&#128196;</span><span>' + esc(name) + '</span>';
    entry.title = files[i];
    entry.addEventListener('click', (function(fp) {
      return function() { openFileFromExplorer(fp); };
    })(files[i]));
    if (typeof makeExplorerEntryDraggable === 'function') makeExplorerEntryDraggable(entry, files[i]);
    list.appendChild(entry);
  }
}

function updateSessionBadge(count) {
  var btn = document.getElementById('activity-session');
  if (!btn) return;
  var existing = btn.querySelector('.badge');
  if (count > 0) {
    if (!existing) {
      existing = document.createElement('span');
      existing.className = 'badge';
      btn.appendChild(existing);
    }
    existing.textContent = count;
  } else if (existing) {
    existing.remove();
  }
}

// ═══════════════════════════════════════════════════════════════
// Explorer file search
// ═══════════════════════════════════════════════════════════════

var explorerSearchTimeout = null;

(function initExplorerSearch() {
  var input = document.getElementById('explorer-search-input');
  if (!input) return;
  // Show search input when explorer is not collapsed
  var wrap = document.getElementById('explorer-search-wrap');
  if (wrap) wrap.classList.add('visible');

  input.addEventListener('input', function() {
    var q = this.value.trim();
    if (explorerSearchTimeout) clearTimeout(explorerSearchTimeout);
    if (!q) {
      // Restore normal view
      if (explorerViewMode === 'tree') renderTree();
      else if (currentBrowseDir) browseDir(currentBrowseDir);
      return;
    }
    explorerSearchTimeout = setTimeout(function() {
      searchExplorerFiles(q);
    }, 300);
  });
})();

async function searchExplorerFiles(query) {
  try {
    var res = await authFetch('/browse/search?q=' + encodeURIComponent(query));
    var data = await res.json();
    if (data.error) return;
    renderExplorerSearchResults(data.results || []);
  } catch(e) {
    // Fallback: client-side filter of known files
    var results = [];
    var q = query.toLowerCase();
    sessionTouchedFiles.forEach(function(f) {
      if (f.toLowerCase().indexOf(q) !== -1) results.push(f);
    });
    fileTabOrder.forEach(function(f) {
      if (f.toLowerCase().indexOf(q) !== -1 && results.indexOf(f) === -1) results.push(f);
    });
    renderExplorerSearchResults(results);
  }
}

function renderExplorerSearchResults(results) {
  var el = document.getElementById('explorer-listing');
  el.innerHTML = '';
  if (results.length === 0) {
    el.innerHTML = '<div style="padding:8px 12px;color:#3a3a54;font-size:10px">No files found</div>';
    return;
  }
  for (var i = 0; i < Math.min(results.length, 50); i++) {
    var filePath = results[i];
    var row = document.createElement('div');
    row.className = 'tree-entry is-file';
    row.style.paddingLeft = '10px';
    var name = filePath.split('/').pop();
    var dir = filePath.split('/').slice(0, -1).join('/');
    row.innerHTML =
      '<span class="dir-icon file-icon">&#128196;</span>' +
      '<span class="dir-name">' + esc(name) + '</span>' +
      '<span class="dir-size" style="font-size:9px;opacity:0.6">' + esc(dir) + '</span>';
    row.addEventListener('click', (function(fp) {
      return function() { openFileFromExplorer(fp); };
    })(filePath));
    el.appendChild(row);
  }
}

// Apply saved preferences on load
(function initPreferences() {
  var prefs = loadPreferences();
  if (prefs.fontSize && prefs.fontSize !== 13) {
    applySettingsFontSize(prefs.fontSize);
  }
  if (prefs.editorFontSize && prefs.editorFontSize !== 13) {
    applySettingsEditorFontSize(prefs.editorFontSize);
  }
})();
