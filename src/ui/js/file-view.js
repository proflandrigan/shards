// ═══════════════════════════════════════════════════════════════
// File pane rendering
// ═══════════════════════════════════════════════════════════════

function renderFilePane(relPath) {
  var f = openFiles[relPath];
  if (!f) { renderEmptyFilePane(); return; }

  document.getElementById('file-path-display').textContent = relPath;
  document.getElementById('copy-path-btn').style.display = '';

  var ext = relPath.split('.').pop().toLowerCase();
  var isImage = isImageFile(relPath);
  var isPdf = isPdfFile(relPath);
  var isMarkdown = ext === 'md';
  var isNotebook = ext === 'ipynb';
  var isTabular = isTabularFile(relPath) && typeof Tabulator !== 'undefined';

  // Media files — no edit/save
  if (isImage || isPdf) {
    document.getElementById('edit-btn').style.display = 'none';
    document.getElementById('save-btn').style.display = 'none';
    var renderedView = document.getElementById('file-rendered-view');
    var editorEl = document.getElementById('file-editor');
    var tableView = document.getElementById('table-view');
    var monacoFileContainer = document.getElementById('monaco-file-container');
    renderedView.classList.remove('visible');
    renderedView.innerHTML = '';
    editorEl.style.display = 'none';
    tableView.classList.remove('visible');
    destroyTabulator();
    disposeMonacoInstance();
    monacoFileContainer.style.display = 'none';
    monacoFileContainer.innerHTML = '';

    renderedView.classList.add('visible');
    var rawUrl = getRawFileUrl(f.absPath);

    if (isImage) {
      renderedView.innerHTML =
        '<div class="media-preview image-preview">' +
          '<img src="' + esc(rawUrl) + '" alt="' + esc(relPath.split('/').pop()) + '" />' +
        '</div>';
    } else {
      renderedView.innerHTML =
        '<div class="media-preview pdf-preview">' +
          '<iframe src="' + esc(rawUrl) + '" title="' + esc(relPath.split('/').pop()) + '"></iframe>' +
        '</div>';
    }
    return;
  }

  // Hide edit/save buttons for notebooks (per-cell editing)
  if (isNotebook) {
    document.getElementById('edit-btn').style.display = 'none';
    document.getElementById('save-btn').style.display = f.modified ? '' : 'none';
  } else {
    document.getElementById('edit-btn').style.display = '';
    if (isTabular) {
      document.getElementById('edit-btn').textContent = f.editMode ? 'Table' : 'Raw';
      document.getElementById('save-btn').style.display = (f.modified || f.editMode) ? '' : 'none';
    } else {
      document.getElementById('edit-btn').textContent = f.editMode ? 'View' : 'Edit';
      document.getElementById('save-btn').style.display = f.editMode ? '' : 'none';
    }
  }

  var renderedView = document.getElementById('file-rendered-view');
  var editorEl = document.getElementById('file-editor');
  var codeView = document.getElementById('code-view');
  var codeEdit = document.getElementById('code-edit');
  var gutter = document.getElementById('line-gutter');
  var tableView = document.getElementById('table-view');

  var monacoFileContainer = document.getElementById('monaco-file-container');

  // Helper to hide all views and dispose Monaco
  function hideAll() {
    renderedView.classList.remove('visible');
    renderedView.innerHTML = '';
    editorEl.style.display = 'none';
    tableView.classList.remove('visible');
    destroyTabulator();
    disposeMonacoInstance();
    monacoFileContainer.style.display = 'none';
    monacoFileContainer.innerHTML = '';
  }

  if (isNotebook) {
    // Notebook view with per-cell editing
    hideAll();
    renderedView.classList.add('visible');
    if (!f.notebookData) {
      try {
        f.notebookData = parseNotebookData(f.content);
      } catch(e) {
        renderedView.innerHTML = '<div class="file-rendered"><pre>' + esc(f.content) + '</pre></div>';
        return;
      }
    }
    renderNotebookView(relPath);
    return;
  }

  if (f.editMode) {
    // Edit mode
    hideAll();
    if (!monacoFailed) {
      editorEl.style.display = 'flex';
      gutter.style.display = 'none';
      codeView.style.display = 'none';
      codeEdit.classList.remove('visible');
      monacoFileContainer.style.display = 'block';
      monacoFileContainer.innerHTML = '';
      loadMonaco().then(function() {
        var lang = getMonacoLang(relPath);
        activeMonacoInstance = createMonacoEditor(monacoFileContainer, {
          value: f.content,
          language: lang,
          readOnly: false,
        });
        activeMonacoInstance.onDidChangeModelContent(function() {
          f.content = activeMonacoInstance.getValue();
          f.modified = f.content !== f.originalContent;
          renderWsTabs();
        });
        activeMonacoInstance.focus();
      }).catch(function() {
        // Fallback to textarea
        monacoFileContainer.style.display = 'none';
        gutter.style.display = '';
        codeView.style.display = 'none';
        codeEdit.classList.add('visible');
        codeEdit.value = f.content;
        updateLineGutter(f.content);
        codeEdit.focus();
      });
    } else {
      // Monaco failed — textarea fallback
      editorEl.style.display = 'flex';
      gutter.style.display = '';
      codeView.style.display = 'none';
      codeEdit.classList.add('visible');
      codeEdit.value = f.content;
      updateLineGutter(f.content);
      codeEdit.focus();
    }
  } else if (isTabular) {
    // Table view
    hideAll();
    tableView.classList.add('visible');
    if (!f.tabularData) {
      loadTabularData(relPath, f).then(function(data) {
        f.tabularData = data;
        initTabulator(relPath, data);
      }).catch(function(err) {
        console.warn('Tabular parse failed, falling back to code view:', err);
        tableView.classList.remove('visible');
        renderCodeView(relPath, f);
      });
    } else {
      initTabulator(relPath, f.tabularData);
    }
  } else if (isMarkdown) {
    // Markdown rendered view
    hideAll();
    renderedView.classList.add('visible');
    renderedView.innerHTML = '<div class="file-rendered">' + renderMarkdown(f.content) + '</div>';
  } else {
    // Code view — use Monaco read-only
    hideAll();
    if (!monacoFailed) {
      editorEl.style.display = 'flex';
      gutter.style.display = 'none';
      codeView.style.display = 'none';
      codeEdit.classList.remove('visible');
      monacoFileContainer.style.display = 'block';
      monacoFileContainer.innerHTML = '';
      loadMonaco().then(function() {
        var lang = getMonacoLang(relPath);
        activeMonacoInstance = createMonacoEditor(monacoFileContainer, {
          value: f.content,
          language: lang,
          readOnly: true,
        });
      }).catch(function() {
        monacoFileContainer.style.display = 'none';
        renderCodeViewFallback(relPath, f);
      });
    } else {
      renderCodeViewFallback(relPath, f);
    }
  }
}

function renderCodeViewFallback(relPath, f) {
  var editorEl = document.getElementById('file-editor');
  var codeView = document.getElementById('code-view');
  var codeEdit = document.getElementById('code-edit');
  var gutter = document.getElementById('line-gutter');
  editorEl.style.display = 'flex';
  gutter.style.display = '';
  codeView.style.display = 'block';
  codeEdit.classList.remove('visible');
  var lang = getLang(relPath);
  document.getElementById('code-view-code').innerHTML = highlightCode(esc(f.content), lang);
  updateLineGutter(f.content);
}

function renderCodeView(relPath, f) {
  var editorEl = document.getElementById('file-editor');
  var monacoFileContainer = document.getElementById('monaco-file-container');
  editorEl.style.display = 'flex';
  if (!monacoFailed) {
    var gutter = document.getElementById('line-gutter');
    var codeView = document.getElementById('code-view');
    var codeEdit = document.getElementById('code-edit');
    gutter.style.display = 'none';
    codeView.style.display = 'none';
    codeEdit.classList.remove('visible');
    monacoFileContainer.style.display = 'block';
    monacoFileContainer.innerHTML = '';
    loadMonaco().then(function() {
      var lang = getMonacoLang(relPath);
      activeMonacoInstance = createMonacoEditor(monacoFileContainer, {
        value: f.content,
        language: lang,
        readOnly: true,
      });
    }).catch(function() {
      monacoFileContainer.style.display = 'none';
      renderCodeViewFallback(relPath, f);
    });
  } else {
    renderCodeViewFallback(relPath, f);
  }
}

// ═══════════════════════════════════════════════════════════════
// Edit mode toggle & save
// ═══════════════════════════════════════════════════════════════

function toggleEditMode() {
  var key = getCurrentFileKey();
  if (!key || key === 'chat' || !openFiles[key]) return;
  var f = openFiles[key];

  // Notebooks use per-cell editing, no file-level toggle
  var ext = key.split('.').pop().toLowerCase();
  if (ext === 'ipynb') return;

  if (isTabularFile(key) && isEditableTabular(key)) {
    if (!f.editMode) {
      // Table → Raw: serialize current Tabulator data to text
      var serialized = getTabulatorSerializedContent(key);
      if (serialized !== null) {
        f.content = serialized;
      }
      f.tabularData = null;
      destroyTabulator();
    } else {
      // Raw → Table: clear tabular data so it re-parses
      f.tabularData = null;
    }
  }

  // Dispose Monaco when toggling
  disposeMonacoInstance();

  f.editMode = !f.editMode;
  renderFilePane(key);
}

function getCurrentFileKey() {
  return splitMode ? currentFileInPane : activeTabId;
}

async function saveCurrentFile() {
  var key = getCurrentFileKey();
  if (!key || key === 'chat' || !openFiles[key]) return;
  var f = openFiles[key];

  var contentToSave = f.content;

  // Notebook: flush active Monaco editor, serialize
  if (f.notebookData) {
    if (activeNotebookCellMonaco && activeNotebookCellIdx !== null) {
      var cell = f.notebookData.cells[activeNotebookCellIdx];
      if (cell) cell.source = activeNotebookCellMonaco.getValue();
    }
    contentToSave = serializeNotebook(f.notebookData);
    f.content = contentToSave;
  }

  // If Tabulator is active (not in raw edit mode), serialize table data first
  if (isTabularFile(key) && isEditableTabular(key) && !f.editMode && activeTabulatorInstance) {
    var serializedTab = getTabulatorSerializedContent(key);
    if (serializedTab !== null) {
      contentToSave = serializedTab;
      f.content = serializedTab;
    }
  }

  // If Monaco is active for a code file, sync content
  if (activeMonacoInstance && !f.notebookData) {
    contentToSave = activeMonacoInstance.getValue();
    f.content = contentToSave;
  }

  try {
    var res = await authFetch('/browse/file/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: f.absPath, content: contentToSave }),
    });
    var data = await res.json();
    if (data.error) { alert('Save failed: ' + data.error); return; }
    f.originalContent = contentToSave;
    f.modified = false;
    renderWsTabs();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

function updateLineGutter(content) {
  var gutter = document.getElementById('line-gutter');
  var lineCount = (content.match(/\n/g) || []).length + 1;
  var lines = [];
  for (var i = 1; i <= lineCount; i++) lines.push(i);
  gutter.textContent = lines.join('\n');
}

function handleArtifactUpdate(relPath, content, isSessionFile) {
  if (relPath in openFiles) {
    var f = openFiles[relPath];
    if (!f.modified && !f.editMode) {
      f.content = content;
      f.originalContent = content;
      f.tabularData = null; // Force re-parse for tabular files
      f.notebookData = null; // Force re-parse for notebooks
      var currentKey = getCurrentFileKey();
      if (relPath === currentKey) {
        disposeNotebookCellMonaco();
        renderFilePane(relPath);
      } else {
        var tabEl = document.querySelector('[data-path="' + CSS.escape(relPath) + '"]');
        if (tabEl) tabEl.classList.add('unread');
      }
    }
  } else if ((isSessionFile || sessionTouchedFiles.has(relPath)) && relPath.endsWith('project-specs.md')) {
    // Auto-open project-specs.md in split view
    if (!splitMode) toggleSplit();
    openFileTab(relPath, content, relPath);
  }
  // else: don't auto-open
}

function initFileAutoRefresh() {
  setInterval(async function() {
    for (var i = 0; i < fileTabOrder.length; i++) {
      var relPath = fileTabOrder[i];
      var f = openFiles[relPath];
      if (!f || f.editMode || f.modified) continue;

      try {
        var res = await authFetch('/browse/file?path=' + encodeURIComponent(f.absPath));
        var data = await res.json();
        if (data.error) continue;
        if (data.content !== f.content) {
          f.content = data.content;
          f.originalContent = data.content;
          f.tabularData = null; // Force re-parse for tabular files
          f.notebookData = null; // Force re-parse for notebooks
          var currentKey = getCurrentFileKey();
          if (relPath === currentKey) {
            disposeNotebookCellMonaco();
            renderFilePane(relPath);
          } else {
            // Mark unread
            var tabEl = document.querySelector('[data-path="' + CSS.escape(relPath) + '"]');
            if (tabEl) tabEl.classList.add('unread');
          }
        }
      } catch(e) {}
    }
  }, 3000);
}
