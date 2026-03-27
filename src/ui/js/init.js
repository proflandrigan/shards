// ═══════════════════════════════════════════════════════════════
// Theme toggle
// ═══════════════════════════════════════════════════════════════

(function initTheme() {
  var saved = localStorage.getItem('shards-theme') || 'dark';
  if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
  updateThemeIcon();
})();

function toggleTheme() {
  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('shards-theme', 'dark');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('shards-theme', 'light');
  }
  updateThemeIcon();
  // Update Monaco editors if loaded
  if (typeof monaco !== 'undefined') {
    monaco.editor.setTheme(currentMonacoTheme());
  }
}

function updateThemeIcon() {
  var btn = document.getElementById('theme-toggle');
  if (!btn) return;
  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  btn.innerHTML = isLight ? '&#9728;' : '&#9790;';
  btn.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
}

// ═══════════════════════════════════════════════════════════════
// DOM event listeners
// ═══════════════════════════════════════════════════════════════

// Track edits in textarea
document.getElementById('code-edit').addEventListener('input', function(e) {
  var key = getCurrentFileKey();
  if (!key || !openFiles[key]) return;
  var f = openFiles[key];
  f.content = e.target.value;
  f.modified = f.content !== f.originalContent;
  updateLineGutter(f.content);
  renderWsTabs();
});

// Ctrl+S to save, Escape, Ctrl+Enter, and additional keyboard shortcuts
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    var key = getCurrentFileKey();
    if (key && key !== 'chat' && openFiles[key] && (openFiles[key].editMode || openFiles[key].modified)) {
      e.preventDefault();
      saveCurrentFile();
    }
  }
  // Cmd+B — toggle explorer sidebar
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    toggleExplorer();
  }
  // Cmd+W — close current file tab
  if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
    e.preventDefault();
    var closeKey = getCurrentFileKey();
    if (closeKey && closeKey !== 'chat') closeFileTab(closeKey);
  }
  // Cmd+\ — toggle split view
  if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
    e.preventDefault();
    toggleSplit();
  }
  // Cmd+1/2/3 — switch tabs
  if ((e.ctrlKey || e.metaKey) && e.key === '1') {
    e.preventDefault();
    switchTab('chat');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '2') {
    e.preventDefault();
    if (fileTabOrder.length > 0) switchTab(fileTabOrder[0]);
  }
  if ((e.ctrlKey || e.metaKey) && e.key === '3') {
    e.preventDefault();
    if (fileTabOrder.length > 1) switchTab(fileTabOrder[1]);
  }
  // Cmd+P — quick file picker
  if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
    e.preventDefault();
    toggleQuickOpen();
  }
  // Cmd+K — command palette
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    toggleCommandPalette();
  }
  // Cmd+G — go to line (Monaco)
  if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
    if (activeMonacoInstance) {
      e.preventDefault();
      activeMonacoInstance.getAction('editor.action.gotoLine').run();
    }
  }
  // Cmd+F — chat search when chat is focused
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    var chatPane = document.getElementById('chat-pane');
    var isInChat = chatPane && (chatPane.contains(document.activeElement) || (!splitMode && activeTabId === 'chat'));
    if (isInChat && !activeMonacoInstance) {
      e.preventDefault();
      toggleChatSearch();
    }
  }
  // Cmd+, — settings
  if ((e.ctrlKey || e.metaKey) && e.key === ',') {
    e.preventDefault();
    toggleSettings();
  }
  // Ctrl+Shift+[ / ] — cycle session tabs
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '[') {
    e.preventDefault();
    cycleSessionTab(-1);
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === ']') {
    e.preventDefault();
    cycleSessionTab(1);
  }
  // Escape — exit notebook cell edit, close overlays
  if (e.key === 'Escape') {
    // Close overlays first
    if (document.getElementById('quick-open-overlay').classList.contains('visible')) {
      document.getElementById('quick-open-overlay').classList.remove('visible');
      return;
    }
    if (document.getElementById('command-palette-overlay').classList.contains('visible')) {
      document.getElementById('command-palette-overlay').classList.remove('visible');
      return;
    }
    if (document.getElementById('settings-overlay').classList.contains('visible')) {
      document.getElementById('settings-overlay').classList.remove('visible');
      return;
    }
    var chatSearchBar = document.getElementById('chat-search-bar');
    if (chatSearchBar && chatSearchBar.classList.contains('visible')) {
      chatSearchBar.classList.remove('visible');
      return;
    }
    var key2 = getCurrentFileKey();
    if (key2 && openFiles[key2] && openFiles[key2].notebookData) {
      if (activeNotebookCellMonaco) {
        disposeNotebookCellMonaco();
        activeCellIdx = null;
        renderNotebookView(key2);
      }
    }
  }
  // Ctrl+Enter — finish editing, move to next cell
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    var key3 = getCurrentFileKey();
    if (key3 && openFiles[key3] && openFiles[key3].notebookData && activeNotebookCellIdx !== null) {
      e.preventDefault();
      var nextIdx = activeNotebookCellIdx + 1;
      disposeNotebookCellMonaco();
      if (nextIdx < openFiles[key3].notebookData.cells.length) {
        renderNotebookView(key3);
        setTimeout(function() { nbCellClick(key3, nextIdx); }, 50);
      } else {
        activeCellIdx = null;
        renderNotebookView(key3);
      }
    }
  }
});

// Tab key in textarea inserts 4 spaces
document.getElementById('code-edit').addEventListener('keydown', function(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    var ta = e.target;
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + '    ' + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 4;
    ta.dispatchEvent(new Event('input'));
  }
});

// Sync scroll between gutter and content
document.getElementById('file-view-area').addEventListener('scroll', function() {
  document.getElementById('line-gutter').scrollTop = this.scrollTop;
});

// Enter key to send chat; Shift+Enter inserts newline; arrow keys navigate suggestions
document.getElementById('chat-input').addEventListener('keydown', function(e) {
  if (slashSuggestionKeydown(e)) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// Auto-resize textarea as user types; update slash suggestions
document.getElementById('chat-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  updateSlashSuggestions();
});

// Hide suggestions when input loses focus (delay allows mousedown on item to fire first)
document.getElementById('chat-input').addEventListener('blur', function() {
  setTimeout(hideSlashSuggestions, 150);
});

// Capture selection context when user finishes selecting in file pane
document.getElementById('file-pane').addEventListener('mouseup', function() {
  setTimeout(function() {
    var ctx = captureSelectionContext();
    if (ctx) {
      setSelectionContext(ctx);
    }
  }, 10);
});

// ═══════════════════════════════════════════════════════════════
// Initial load
// ═══════════════════════════════════════════════════════════════

async function loadInitial() {
  try {
    var results = await Promise.all([
      authFetch('/files'),
      authFetch('/chat/status'),
    ]);
    var fRes = results[0], cRes = results[1];
    var result = await fRes.json();
    var chatStatus = await cRes.json();

    // Restore sessions FIRST so artifacts open in the active session's workspace
    var activeSessions = chatStatus.sessions || [];
    if (activeSessions.length > 0) {
      for (var si = 0; si < activeSessions.length; si++) {
        var s = activeSessions[si];
        var sess = createSessionState(s.sessionId, s.agent);
        sess.title = s.title || null;
        sess.messages = s.transcript || [];
        sess.hasMessages = sess.messages.length > 0;
      }
      // Activate the last (most recent) session and load its workspace
      var lastSession = activeSessions[activeSessions.length - 1];
      activeSessionId = lastSession.sessionId;
      loadSessionWorkspace(chatSessions[activeSessionId]);
      activateAgent(lastSession.agent);
      showChatView();
      rebuildMessages(chatSessions[activeSessionId].messages);
      renderSessionTabs();
    } else {
      showAgentPicker();
      renderSessionTabs();
    }

    // Now process artifacts (they open in the active session's workspace)
    var filesMap = result.files || result;
    var serverSessionFiles = result.sessionFiles || [];
    for (var i = 0; i < serverSessionFiles.length; i++) sessionTouchedFiles.add(serverSessionFiles[i]);
    for (var p in filesMap) {
      if (filesMap.hasOwnProperty(p)) {
        handleArtifactUpdate(p, filesMap[p], sessionTouchedFiles.has(p));
      }
    }
  } catch(e) {
    showAgentPicker();
    renderSessionTabs();
  }

  renderWsTabs();
  showActiveContent();
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════

loadInitial().then(function() {
  if (typeof restoreLayout === 'function') restoreLayout();
  if (typeof renderSessionFiles === 'function') renderSessionFiles();
  if (typeof initBookmarks === 'function') initBookmarks();
  if (typeof fetchGitStatus === 'function') fetchGitStatus();
  if (typeof switchSidebarView === 'function') switchSidebarView(activeSidebarView);
});
connect();
browseDir();
initExplorerResize();
initSplitResize();
initFileAutoRefresh();
initCtxMenu();
if (typeof initPinboardDropZone === 'function') initPinboardDropZone();

// Request notification permission on first interaction or load
if (window.Notification && Notification.permission === 'default') {
  document.addEventListener('click', function() {
    Notification.requestPermission();
  }, { once: true });
}
