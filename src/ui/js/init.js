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

// Ctrl+S to save, Escape, Ctrl+Enter
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    var key = getCurrentFileKey();
    if (key && key !== 'chat' && openFiles[key] && (openFiles[key].editMode || openFiles[key].modified)) {
      e.preventDefault();
      saveCurrentFile();
    }
  }
  // Escape — exit notebook cell edit
  if (e.key === 'Escape') {
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

    var filesMap = result.files || result;
    var serverSessionFiles = result.sessionFiles || [];
    for (var i = 0; i < serverSessionFiles.length; i++) sessionTouchedFiles.add(serverSessionFiles[i]);
    for (var p in filesMap) {
      if (filesMap.hasOwnProperty(p)) {
        handleArtifactUpdate(p, filesMap[p], sessionTouchedFiles.has(p));
      }
    }

    // Restore active chat session if one is running
    if (chatStatus.active) {
      chatSessionId = chatStatus.sessionId;
      chatAgent = chatStatus.agent;
      chatMessages = chatStatus.transcript || [];
      activateAgent(chatAgent);
      showChatView();
      rebuildMessages(chatMessages);
    } else {
      showAgentPicker();
    }
  } catch(e) {
    showAgentPicker();
  }

  // Ensure chat tab is active initially
  activeTabId = 'chat';
  renderWsTabs();
  showActiveContent();
}

// ═══════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════

loadInitial();
connect();
browseDir();
initExplorerResize();
initSplitResize();
initFileAutoRefresh();
