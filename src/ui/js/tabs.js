// ═══════════════════════════════════════════════════════════════
// Workspace tabs & file state
// ═══════════════════════════════════════════════════════════════

function openFileTab(relPath, content, absPath, opts) {
  opts = opts || {};
  if (relPath in openFiles) {
    // Update content if not modified by user
    var f = openFiles[relPath];
    if (!f.modified && !f.editMode) {
      f.content = content;
      f.originalContent = content;
    }
    if (opts.media) f.media = true;
  } else {
    openFiles[relPath] = {
      content: content,
      absPath: absPath || relPath,
      originalContent: content,
      modified: false,
      editMode: false,
      tabularData: null,
      tabulatorInstance: null,
      media: opts.media || false,
    };
    fileTabOrder.push(relPath);
    sortFileTabs();
  }

  if (splitMode) {
    // In split mode, file tabs show in file pane — switch to this file
    renderWsTabs();
    showFileInPane(relPath);
  } else {
    // In single mode, switch to this tab
    activeTabId = relPath;
    renderWsTabs();
    showActiveContent();
  }
  if (typeof saveLayout === 'function') saveLayout();
}

function closeFileTab(relPath) {
  // Save check
  var f = openFiles[relPath];
  if (f && f.modified) {
    if (!confirm('"' + relPath.split('/').pop() + '" has unsaved changes. Close anyway?')) return;
  }

  // Destroy Tabulator if this file had one
  if (f && f.tabulatorInstance) {
    var currentKey = getCurrentFileKey();
    if (relPath === currentKey) destroyTabulator();
  }

  // Dispose git diff editor if this is a diff tab
  if (f && f.gitDiff && typeof disposeGitDiffEditor === 'function') {
    var currentKey0 = getCurrentFileKey();
    if (relPath === currentKey0) hideGitDiffContainer();
  }

  // Dispose Monaco instances
  var currentKey2 = getCurrentFileKey();
  if (relPath === currentKey2) {
    disposeMonacoInstance();
    disposeNotebookCellMonaco();
  }
  if (f && f.notebookData) {
    f.notebookData.cells.forEach(function(cell) {
      if (cell.monacoInstance) {
        cell.monacoInstance.dispose();
        cell.monacoInstance = null;
      }
    });
  }

  delete openFiles[relPath];
  var ftIdx = fileTabOrder.indexOf(relPath);
  if (ftIdx !== -1) fileTabOrder.splice(ftIdx, 1);

  if (activeTabId === relPath) {
    activeTabId = fileTabOrder.length > 0 ? fileTabOrder[0] : 'chat';
  }
  renderWsTabs();
  showActiveContent();
  if (typeof saveLayout === 'function') saveLayout();
}

function closeAllTabs() {
  // Close all file tabs
  var filesToClose = fileTabOrder.slice();
  for (var i = 0; i < filesToClose.length; i++) {
    closeFileTab(filesToClose[i]);
  }
  // Close all panel tabs
  var panelsToClose = panelTabOrder.slice();
  for (var j = 0; j < panelsToClose.length; j++) {
    closePanelTab(panelsToClose[j]);
  }
}

function sortFileTabs() {
  fileTabOrder.sort(function(a, b) {
    var aS = a.endsWith('project-specs.md') ? 0 : 1;
    var bS = b.endsWith('project-specs.md') ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return a.localeCompare(b);
  });
}

function switchTab(id) {
  if (splitMode && id !== 'chat') {
    // Both file tabs and panel tabs show in the file pane in split mode
    if (openPanels[id]) {
      currentFileInPane = id;
      renderWsTabs();
      renderPanelPane(id);
    } else {
      showFileInPane(id);
      renderWsTabs();
    }
    if (typeof saveLayout === 'function') saveLayout();
    return;
  }
  activeTabId = id;
  renderWsTabs();
  showActiveContent();
  if (typeof saveLayout === 'function') saveLayout();
}

function renderWsTabs() {
  var bar = document.getElementById('ws-tab-bar');
  // Remove existing tabs (keep actions)
  var actions = document.getElementById('ws-tab-actions');
  bar.innerHTML = '';

  // Chat tab (pinned)
  var chatTab = document.createElement('div');
  chatTab.className = 'ws-tab pinned' + (activeTabId === 'chat' && !splitMode ? ' active' : '') + (splitMode ? ' in-split' : '');
  chatTab.textContent = 'Chat';
  chatTab.addEventListener('click', function() { switchTab('chat'); });
  bar.appendChild(chatTab);

  // File tabs
  for (var i = 0; i < fileTabOrder.length; i++) {
    var p = fileTabOrder[i];
    var f = openFiles[p];
    if (!f) continue;
    var tab = document.createElement('div');
    var isActive = splitMode ? (p === currentFileInPane) : (p === activeTabId);
    tab.className = 'ws-tab' + (isActive ? ' active' : '') + (f.modified ? ' modified' : '');
    tab.dataset.path = p;

    var name = p.split('/').pop();
    // Check if this is a git diff tab
    var isDiffTab = p.indexOf('diff:') === 0;
    var displayName = isDiffTab ? p.substring(5).split('/').pop() : name;
    // Git diff badge
    var gitBadge = '';
    if (typeof getGitStatusForFile === 'function') {
      var gitPath = isDiffTab ? p.substring(5) : p;
      var gs = getGitStatusForFile(gitPath);
      if (gs) {
        var gl = gs.status === 'modified' ? 'M' : gs.status === 'added' ? 'A' : gs.status === 'deleted' ? 'D' : gs.status === 'untracked' ? 'U' : gs.status === 'renamed' ? 'R' : '';
        if (gl) gitBadge = '<span class="git-diff-badge ' + gs.status + '">' + gl + '</span>';
      }
    }
    tab.innerHTML =
      '<span class="tab-dot"></span>' +
      '<span class="modified-dot"></span>' +
      esc(displayName) + gitBadge +
      ' <span class="close-btn" title="Close">x</span>';

    tab.addEventListener('click', (function(path) {
      return function(e) {
        if (e.target.classList.contains('close-btn')) { closeFileTab(path); return; }
        switchTab(path);
      };
    })(p));
    tab.addEventListener('contextmenu', (function(path) {
      return function(e) { showCtxMenu(e, path); };
    })(p));
    bar.appendChild(tab);
  }

  // Panel tabs
  var PANEL_ICONS = { 'data-viewer': '⊞', 'dag': '⬡', 'diagram': '◈', 'chart': '▦', 'diff': '⊟', 'model-card': '▣', 'eval-dashboard': '◉' };
  for (var pi = 0; pi < panelTabOrder.length; pi++) {
    var pid = panelTabOrder[pi];
    var panel = openPanels[pid];
    if (!panel) continue;
    var ptab = document.createElement('div');
    var isPanelActive = splitMode ? (pid === currentFileInPane) : (pid === activeTabId);
    ptab.className = 'ws-tab panel-tab' + (isPanelActive ? ' active' : '');
    ptab.dataset.panelId = pid;

    var icon = PANEL_ICONS[panel.panel] || '▪';
    ptab.innerHTML =
      '<span class="panel-tab-icon">' + icon + '</span>' +
      esc(panel.title) +
      ' <span class="close-btn" title="Close panel">x</span>';

    ptab.addEventListener('click', (function(panelId) {
      return function(e) {
        if (e.target.classList.contains('close-btn')) { closePanelTab(panelId); return; }
        switchTab(panelId);
      };
    })(pid));
    bar.appendChild(ptab);
  }

  bar.appendChild(actions);

  // Split button state
  document.getElementById('split-btn').className = splitMode ? 'active' : '';
}

function showActiveContent() {
  var chatPane = document.getElementById('chat-pane');
  var filePane = document.getElementById('file-pane');
  var splitResize = document.getElementById('split-resize');

  if (splitMode) {
    chatPane.style.display = 'flex';
    splitResize.style.display = 'block';
    filePane.classList.add('visible');
    if (currentFileInPane && openPanels[currentFileInPane]) {
      renderPanelPane(currentFileInPane);
    } else if (currentFileInPane && openFiles[currentFileInPane]) {
      renderFilePane(currentFileInPane);
    } else if (fileTabOrder.length > 0) {
      showFileInPane(fileTabOrder[0]);
    } else if (panelTabOrder.length > 0) {
      currentFileInPane = panelTabOrder[0];
      renderPanelPane(panelTabOrder[0]);
    } else {
      renderEmptyFilePane();
    }
    return;
  }

  // Single mode
  splitResize.style.display = 'none';

  if (activeTabId === 'chat') {
    chatPane.style.display = 'flex';
    filePane.classList.remove('visible');
  } else if (openPanels[activeTabId]) {
    chatPane.style.display = 'none';
    filePane.classList.add('visible');
    renderPanelPane(activeTabId);
  } else {
    chatPane.style.display = 'none';
    filePane.classList.add('visible');
    renderFilePane(activeTabId);
  }
}

function showFileInPane(relPath) {
  currentFileInPane = relPath;
  renderFilePane(relPath);
  renderWsTabs();
}

function renderEmptyFilePane() {
  document.getElementById('file-path-display').textContent = '';
  document.getElementById('copy-path-btn').style.display = 'none';
  document.getElementById('edit-btn').style.display = 'none';
  document.getElementById('save-btn').style.display = 'none';
  document.getElementById('file-rendered-view').classList.remove('visible');
  document.getElementById('file-rendered-view').innerHTML = '';
  document.getElementById('file-editor').style.display = 'none';
  document.getElementById('table-view').classList.remove('visible');
  if (typeof hideGitDiffContainer === 'function') hideGitDiffContainer();
  destroyTabulator();
  disposeMonacoInstance();
  disposeNotebookCellMonaco();

  var rendered = document.getElementById('file-rendered-view');
  rendered.classList.add('visible');
  rendered.innerHTML = '<div class="no-file-msg">Open a file from the explorer</div>';
}
