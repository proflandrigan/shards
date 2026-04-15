// ═══════════════════════════════════════════════════════════════
// Git status & diff integration
// ═══════════════════════════════════════════════════════════════

var gitCurrentBranch = null;
var gitChanges = [];       // [{ path, status, staged }]
var gitChangesMap = {};    // path -> { status, staged }
var gitDiffInstance = null; // Monaco diff editor instance
var gitRefreshTimer = null;
var activeGitRepo = null;  // null = PROJECT_DIR root; string = subrepo relPath (e.g. "repo-a")
var discoveredRepos = [];  // [{ name, relPath, branch }]

// Append ?repo=<activeGitRepo> to a URL (or &repo= if query string already present)
function gitUrl(base) {
  if (!activeGitRepo || activeGitRepo === '.') return base;
  var sep = base.indexOf('?') === -1 ? '?' : '&';
  return base + sep + 'repo=' + encodeURIComponent(activeGitRepo);
}

async function fetchGitStatus() {
  try {
    var res = await authFetch(gitUrl('/git/status'));
    var data = await res.json();
    if (data.error && !data.branch) {
      gitCurrentBranch = null;
      gitChanges = [];
      gitChangesMap = {};
    } else {
      var prevBranch = gitCurrentBranch;
      gitCurrentBranch = data.branch;
      gitChanges = data.changes || [];
      gitChangesMap = {};
      // If branch changed, re-detect PR
      if (prevBranch !== gitCurrentBranch && typeof fetchPRInfo === 'function') {
        gitPRInfo = null;
        gitPRCommentCount = 0;
        if (gitPRCountInterval) { clearInterval(gitPRCountInterval); gitPRCountInterval = null; }
        fetchPRInfo();
      }
      for (var i = 0; i < gitChanges.length; i++) {
        gitChangesMap[gitChanges[i].path] = gitChanges[i];
      }
    }
    renderGitChanges();
    if (typeof renderHud === 'function') renderHud();
    // Invalidate diff cache for files no longer changed
    for (var p in openFiles) {
      if (openFiles[p].cachedDiffData && !gitChangesMap[p]) {
        openFiles[p].cachedDiffData = false;
        if (openFiles[p].diffMode) {
          openFiles[p].diffMode = false;
        }
      }
    }
    // Update diff button for current file
    var curKey = typeof getCurrentFileKey === 'function' ? getCurrentFileKey() : null;
    if (curKey && typeof updateDiffButtonState === 'function') updateDiffButtonState(curKey);
    // Refresh tab badges
    if (typeof renderWsTabs === 'function') renderWsTabs();
  } catch (e) {
    // Git not available or network error
  }
}

function renderGitChanges() {
  var list = document.getElementById('git-changes-list');
  var branchLabel = document.getElementById('git-branch-label');
  var emptyState = document.getElementById('git-view-empty');
  var badge = document.getElementById('activity-git-badge');
  if (!list) return;

  // Update branch label in git view header
  if (branchLabel) {
    branchLabel.textContent = gitCurrentBranch || '';
    branchLabel.title = gitCurrentBranch || '';
  }

  var count = gitChanges ? gitChanges.length : 0;

  // Update activity bar badge
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // Toggle empty state
  if (emptyState) emptyState.style.display = count === 0 ? '' : 'none';

  list.innerHTML = '';
  if (count === 0) return;

  for (var i = 0; i < gitChanges.length; i++) {
    var change = gitChanges[i];
    var entry = document.createElement('div');
    entry.className = 'git-change-entry';
    entry.title = change.path + ' (' + change.status + (change.staged ? ', staged' : '') + ')';

    var badgeLetter = change.status === 'modified' ? 'M' :
                      change.status === 'added' ? 'A' :
                      change.status === 'deleted' ? 'D' :
                      change.status === 'untracked' ? 'U' :
                      change.status === 'renamed' ? 'R' : '?';

    var parts = change.path.split('/');
    var name = parts.pop();
    var dir = parts.length > 0 ? parts.join('/') : '';

    entry.innerHTML =
      '<span class="git-status-badge ' + change.status + '">' + badgeLetter + '</span>' +
      '<span class="dir-name">' + esc(name) + '</span>' +
      (dir ? '<span class="git-dir">' + esc(dir) + '</span>' : '');

    entry.addEventListener('click', (function(fp, st) {
      return function() { openGitDiff(fp, st); };
    })(change.path, change.status));
    if (typeof makeExplorerEntryDraggable === 'function') makeExplorerEntryDraggable(entry, change.path);

    list.appendChild(entry);
  }
}

async function openGitDiff(filePath, status) {
  try {
    var res = await authFetch(gitUrl('/git/diff?path=' + encodeURIComponent(filePath)));
    var data = await res.json();
    if (data.error) return;

    // Open as a special diff tab
    var tabId = 'diff:' + filePath;
    openFiles[tabId] = {
      content: data.modified || '',
      absPath: filePath,
      originalContent: data.original || '',
      modified: false,
      editMode: false,
      tabularData: null,
      tabulatorInstance: null,
      media: false,
      gitDiff: true,
      gitOriginal: data.original || '',
      gitModified: data.modified || '',
      gitStatus: status,
      gitPath: filePath,
    };

    if (fileTabOrder.indexOf(tabId) === -1) {
      fileTabOrder.push(tabId);
    }

    if (splitMode) {
      renderWsTabs();
      showFileInPane(tabId);
    } else {
      activeTabId = tabId;
      renderWsTabs();
      showActiveContent();
    }
  } catch (e) {}
}

function renderGitDiffPane(tabId) {
  var f = openFiles[tabId];
  if (!f || !f.gitDiff) return;

  var pathDisplay = document.getElementById('file-path-display');
  pathDisplay.textContent = f.gitPath + ' (diff)';
  document.getElementById('copy-path-btn').style.display = '';
  document.getElementById('edit-btn').style.display = 'none';
  document.getElementById('save-btn').style.display = 'none';

  // Hide other views
  document.getElementById('file-rendered-view').classList.remove('visible');
  document.getElementById('file-rendered-view').innerHTML = '';
  document.getElementById('file-editor').style.display = 'none';
  document.getElementById('table-view').classList.remove('visible');
  if (typeof destroyTabulator === 'function') destroyTabulator();
  disposeMonacoInstance();
  var monacoFileContainer = document.getElementById('monaco-file-container');
  monacoFileContainer.style.display = 'none';
  monacoFileContainer.innerHTML = '';

  // Show diff container
  var diffContainer = document.getElementById('git-diff-container');
  diffContainer.classList.add('visible');
  diffContainer.innerHTML = '';

  // Dispose previous diff editor
  disposeGitDiffEditor();

  loadMonaco().then(function() {
    var originalModel = monaco.editor.createModel(f.gitOriginal, getMonacoLang(f.gitPath));
    var modifiedModel = monaco.editor.createModel(f.gitModified, getMonacoLang(f.gitPath));

    gitDiffInstance = monaco.editor.createDiffEditor(diffContainer, {
      theme: currentMonacoTheme(),
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      lineHeight: 20,
      scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
      overviewRulerLanes: 0,
      padding: { top: 8, bottom: 8 },
    });

    gitDiffInstance.setModel({
      original: originalModel,
      modified: modifiedModel,
    });
  }).catch(function() {
    // Fallback: show unified diff as plain text
    diffContainer.innerHTML = '<pre style="padding:12px;color:#b0b0c4;font-size:12px;white-space:pre-wrap;overflow:auto;height:100%">' +
      esc(f.content || 'No diff available') + '</pre>';
  });
}

function disposeGitDiffEditor() {
  if (gitDiffInstance) {
    gitDiffInstance.dispose();
    gitDiffInstance = null;
  }
}

function hideGitDiffContainer() {
  var diffContainer = document.getElementById('git-diff-container');
  if (diffContainer) {
    diffContainer.classList.remove('visible');
    diffContainer.innerHTML = '';
  }
  disposeGitDiffEditor();
}

function getGitStatusForFile(relPath) {
  return gitChangesMap[relPath] || null;
}

// ═══════════════════════════════════════════════════════════════
// Inline diff toggle (in-place diff for normal file tabs)
// ═══════════════════════════════════════════════════════════════

async function toggleDiffMode() {
  var key = typeof getCurrentFileKey === 'function' ? getCurrentFileKey() : null;
  if (!key || !openFiles[key]) return;
  var f = openFiles[key];

  if (f.diffMode) {
    // Toggle OFF — return to normal file view
    f.diffMode = false;
    hideGitDiffContainer();
    renderFilePane(key);
    return;
  }

  // Toggle ON
  f.diffMode = true;
  updateDiffButtonState(key);

  // Use cached diff data if available
  if (f.cachedDiffData) {
    renderInlineDiff(key);
    return;
  }

  // Fetch diff data from server
  try {
    var res = await authFetch(gitUrl('/git/diff?path=' + encodeURIComponent(key)));
    var data = await res.json();
    if (data.error) { f.diffMode = false; updateDiffButtonState(key); return; }

    // Cache on the file object
    f.gitOriginal = data.original || '';
    f.gitModified = data.modified || '';
    f.cachedDiffData = true;

    // Guard against rapid toggle — user may have toggled off during fetch
    if (f.diffMode) {
      renderInlineDiff(key);
    }
  } catch (e) {
    f.diffMode = false;
    updateDiffButtonState(key);
  }
}

function renderInlineDiff(relPath) {
  var f = openFiles[relPath];
  if (!f || !f.diffMode) return;

  // Update toolbar
  document.getElementById('file-path-display').textContent = relPath + ' (diff)';
  document.getElementById('edit-btn').style.display = 'none';
  document.getElementById('save-btn').style.display = 'none';

  // Hide normal file views
  document.getElementById('file-rendered-view').classList.remove('visible');
  document.getElementById('file-rendered-view').innerHTML = '';
  document.getElementById('file-editor').style.display = 'none';
  document.getElementById('table-view').classList.remove('visible');
  if (typeof destroyTabulator === 'function') destroyTabulator();
  disposeMonacoInstance();
  var monacoFileContainer = document.getElementById('monaco-file-container');
  monacoFileContainer.style.display = 'none';
  monacoFileContainer.innerHTML = '';

  // Show diff container
  var diffContainer = document.getElementById('git-diff-container');
  diffContainer.classList.add('visible');
  diffContainer.innerHTML = '';
  disposeGitDiffEditor();

  loadMonaco().then(function() {
    var originalModel = monaco.editor.createModel(f.gitOriginal, getMonacoLang(relPath));
    var modifiedModel = monaco.editor.createModel(f.gitModified, getMonacoLang(relPath));

    gitDiffInstance = monaco.editor.createDiffEditor(diffContainer, {
      theme: currentMonacoTheme(),
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
      lineHeight: 20,
      scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
      overviewRulerLanes: 0,
      padding: { top: 8, bottom: 8 },
    });

    gitDiffInstance.setModel({ original: originalModel, modified: modifiedModel });
  }).catch(function() {
    diffContainer.innerHTML = '<pre style="padding:12px;color:#b0b0c4;font-size:12px;white-space:pre-wrap;overflow:auto;height:100%">' +
      esc('Diff view unavailable') + '</pre>';
  });

  updateDiffButtonState(relPath);
}

function updateDiffButtonState(relPath) {
  var diffBtn = document.getElementById('diff-btn');
  if (!diffBtn) return;

  var f = openFiles[relPath];
  if (!f) { diffBtn.style.display = 'none'; return; }

  // Determine if file is diffable
  var ext = relPath.split('.').pop().toLowerCase();
  var isMedia = f.media || isImageFile(relPath) || isPdfFile(relPath);
  var isNotebook = ext === 'ipynb';
  var isDiffTab = f.gitDiff;
  var hasGitChanges = !!gitChangesMap[relPath];

  // Hide for: edit mode, media, notebooks, diff: tabs, no git changes
  if (f.editMode || isMedia || isNotebook || isDiffTab || !hasGitChanges) {
    diffBtn.style.display = 'none';
    return;
  }

  diffBtn.style.display = '';
  diffBtn.className = f.diffMode ? 'toolbar-btn active' : 'toolbar-btn';
}

function scheduleGitRefresh() {
  if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
  gitRefreshTimer = setTimeout(fetchGitStatus, 2000);
}

// Auto-refresh git status periodically (every 15s)
setInterval(fetchGitStatus, 15000);

// ═══════════════════════════════════════════════════════════════
// GitHub PR integration
// ═══════════════════════════════════════════════════════════════

var gitPRInfo = null;          // { number, title, state, url, branch, base, author, reviewDecision }
var gitPRCommentCount = 0;
var gitPRCountInterval = null;
var gitPRLastBranch = null;

async function fetchPRInfo() {
  try {
    var res = await authFetch(gitUrl('/git/pr-info'));
    var data = await res.json();
    gitPRInfo = (data && data.pr) ? data.pr : null;
    updatePRHud();
    if (gitPRInfo) {
      // Start polling comment count if not already running
      if (!gitPRCountInterval) {
        fetchPRCommentCount();
        gitPRCountInterval = setInterval(fetchPRCommentCount, 60000);
      }
    } else {
      // No PR — stop polling, clear HUD
      if (gitPRCountInterval) { clearInterval(gitPRCountInterval); gitPRCountInterval = null; }
      gitPRCommentCount = 0;
      updatePRHud();
    }
  } catch (e) {
    // gh not available or network error — silent fail
  }
}

async function fetchPRCommentCount() {
  if (!gitPRInfo) return;
  try {
    var res = await authFetch(gitUrl('/git/pr-comments?pr=' + gitPRInfo.number));
    var data = await res.json();
    if (data && data.threads) {
      gitPRCommentCount = data.threads.length;
      updatePRHud();
    }
  } catch (e) {}
}

async function fetchPRComments(prNumber) {
  var res = await authFetch(gitUrl('/git/pr-comments?pr=' + prNumber));
  return await res.json();
}

async function openPRReviewPanel() {
  // Ensure we have PR info
  if (!gitPRInfo) {
    await fetchPRInfo();
  }
  if (!gitPRInfo) {
    // Show a brief message in the chat or as a status bar tooltip
    var hudPR = document.getElementById('hud-pr-text');
    if (hudPR) { hudPR.textContent = 'No open PR for this branch'; setTimeout(updatePRHud, 3000); }
    return;
  }
  var panelId = 'pr-review-' + gitPRInfo.number;
  // If already open, just switch to it
  if (typeof openPanels !== 'undefined' && openPanels[panelId]) {
    if (typeof switchTab === 'function') switchTab(panelId);
    return;
  }
  // Open panel with placeholder while loading
  if (typeof openPanelTab === 'function') {
    openPanelTab(panelId, { panel: 'pr-review', title: 'PR #' + gitPRInfo.number, data: null });
    // Store PR info on the panel for the renderer
    if (typeof openPanels !== 'undefined' && openPanels[panelId]) {
      openPanels[panelId]._prInfo = gitPRInfo;
    }
  }
  // Fetch comments and update panel
  try {
    var data = await fetchPRComments(gitPRInfo.number);
    if (typeof openPanels !== 'undefined' && openPanels[panelId]) {
      openPanels[panelId].rawData = data;
      openPanels[panelId]._prInfo = gitPRInfo;
      if (typeof updatePanelData === 'function') updatePanelData(panelId, data);
    }
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════
// Multi-repo discovery & picker
// ═══════════════════════════════════════════════════════════════

async function fetchGitRepos() {
  try {
    var res = await authFetch('/git/repos');
    var data = await res.json();
    discoveredRepos = data.repos || [];
    renderRepoPicker();
  } catch (e) {
    // silent fail
  }
}

function renderRepoPicker() {
  var picker = document.getElementById('git-repo-picker');
  var select = document.getElementById('git-repo-select');
  if (!picker || !select) return;

  // Hide when there's only one repo (or none)
  if (discoveredRepos.length <= 1) {
    picker.style.display = 'none';
    return;
  }

  picker.style.display = '';
  select.innerHTML = '';

  for (var i = 0; i < discoveredRepos.length; i++) {
    var r = discoveredRepos[i];
    var opt = document.createElement('option');
    opt.value = r.relPath;
    opt.textContent = r.name + '  (' + r.branch + ')';
    if ((activeGitRepo === r.relPath) || (!activeGitRepo && r.relPath === '.')) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }
}

function setActiveGitRepo(relPath) {
  activeGitRepo = (relPath === '.' || relPath === '') ? null : relPath;
  // Reset PR state for the new repo
  gitPRInfo = null;
  gitPRCommentCount = 0;
  if (gitPRCountInterval) { clearInterval(gitPRCountInterval); gitPRCountInterval = null; }
  // Refresh git status and PR info for the newly selected repo
  fetchGitStatus();
  fetchPRInfo();
}

function updatePRHud() {
  var item = document.getElementById('hud-pr-item');
  var sep  = document.getElementById('hud-pr-sep');
  var text = document.getElementById('hud-pr-text');
  if (!item) return;
  if (gitPRInfo && gitPRCommentCount > 0) {
    item.style.display = '';
    if (sep) sep.style.display = '';
    if (text) text.textContent = gitPRCommentCount + ' PR comment' + (gitPRCommentCount !== 1 ? 's' : '');
    item.title = 'PR #' + gitPRInfo.number + ': ' + gitPRCommentCount + ' review comment' + (gitPRCommentCount !== 1 ? 's' : '') + ' — click to open';
  } else if (gitPRInfo) {
    // PR exists but no comments — show subtler indicator
    item.style.display = '';
    if (sep) sep.style.display = '';
    if (text) text.textContent = 'PR #' + gitPRInfo.number;
    item.title = 'PR #' + gitPRInfo.number + ': ' + (gitPRInfo.title || '') + ' — click to open';
  } else {
    item.style.display = 'none';
    if (sep) sep.style.display = 'none';
  }
  if (typeof renderHud === 'function') renderHud();
}
