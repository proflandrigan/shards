// ═══════════════════════════════════════════════════════════════
// Git status & diff integration
// ═══════════════════════════════════════════════════════════════

var gitCurrentBranch = null;
var gitChanges = [];       // [{ path, status, staged }]
var gitChangesMap = {};    // path -> { status, staged }
var gitDiffInstance = null; // Monaco diff editor instance
var gitRefreshTimer = null;

async function fetchGitStatus() {
  try {
    var res = await authFetch('/git/status');
    var data = await res.json();
    if (data.error && !data.branch) {
      gitCurrentBranch = null;
      gitChanges = [];
      gitChangesMap = {};
    } else {
      gitCurrentBranch = data.branch;
      gitChanges = data.changes || [];
      gitChangesMap = {};
      for (var i = 0; i < gitChanges.length; i++) {
        gitChangesMap[gitChanges[i].path] = gitChanges[i];
      }
    }
    renderGitChanges();
    // Refresh tab badges
    if (typeof renderWsTabs === 'function') renderWsTabs();
  } catch (e) {
    // Git not available or network error
  }
}

function renderGitChanges() {
  var section = document.getElementById('git-changes');
  var list = document.getElementById('git-changes-list');
  var branchLabel = document.getElementById('git-branch-label');
  if (!section || !list) return;

  if (!gitCurrentBranch || gitChanges.length === 0) {
    section.classList.remove('visible');
    return;
  }

  section.classList.add('visible');
  branchLabel.textContent = gitCurrentBranch;
  branchLabel.title = gitCurrentBranch;
  list.innerHTML = '';

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

    list.appendChild(entry);
  }
}

async function openGitDiff(filePath, status) {
  try {
    var res = await authFetch('/git/diff?path=' + encodeURIComponent(filePath));
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

function scheduleGitRefresh() {
  if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
  gitRefreshTimer = setTimeout(fetchGitStatus, 2000);
}

// Auto-refresh git status periodically (every 15s)
setInterval(fetchGitStatus, 15000);
