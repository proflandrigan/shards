// ═══════════════════════════════════════════════════════════════
// Notebook data model
// ═══════════════════════════════════════════════════════════════

function parseNotebookData(jsonString) {
  var nb = JSON.parse(jsonString);
  var cells = (nb.cells || []).map(function(cell, i) {
    return {
      id: 'cell-' + i + '-' + Date.now(),
      cell_type: cell.cell_type || 'code',
      source: Array.isArray(cell.source) ? cell.source.join('') : (cell.source || ''),
      outputs: cell.outputs || [],
      metadata: cell.metadata || {},
      execution_count: cell.execution_count || null,
      monacoInstance: null,
      editing: false,
    };
  });
  return {
    metadata: nb.metadata || {},
    nbformat: nb.nbformat || 4,
    nbformat_minor: nb.nbformat_minor || 0,
    cells: cells,
  };
}

function serializeNotebook(notebookData) {
  var nb = {
    metadata: notebookData.metadata,
    nbformat: notebookData.nbformat,
    nbformat_minor: notebookData.nbformat_minor,
    cells: notebookData.cells.map(function(cell) {
      // Split source into lines with \n endings (Jupyter format)
      var lines = cell.source.split('\n');
      var sourceArr = lines.map(function(line, i) { return i < lines.length - 1 ? line + '\n' : line; });
      // Remove trailing empty string if source ends with \n
      if (sourceArr.length > 0 && sourceArr[sourceArr.length - 1] === '') {
        sourceArr.pop();
      }
      var out = {
        cell_type: cell.cell_type,
        source: sourceArr,
        metadata: cell.metadata || {},
      };
      if (cell.cell_type === 'code') {
        out.outputs = cell.outputs || [];
        out.execution_count = cell.execution_count;
      }
      return out;
    }),
  };
  return JSON.stringify(nb, null, 1);
}

function renderCellOutputs(outputs) {
  if (!outputs || outputs.length === 0) return '';
  var html = '';
  for (var i = 0; i < outputs.length; i++) {
    var output = outputs[i];
    if (output.output_type === 'stream') {
      var text = Array.isArray(output.text) ? output.text.join('') : (output.text || '');
      var cls = output.name === 'stderr' ? 'nb-output-error' : '';
      html += '<div class="nb-cell-output ' + cls + '"><pre>' + esc(text) + '</pre></div>';
    } else if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
      var data = output.data || {};
      if (data['text/html']) {
        var raw = Array.isArray(data['text/html']) ? data['text/html'].join('') : data['text/html'];
        html += '<div class="nb-cell-output nb-output-html">' + raw + '</div>';
      } else if (data['image/png']) {
        html += '<div class="nb-cell-output"><img src="data:image/png;base64,' + data['image/png'] + '"></div>';
      } else if (data['image/jpeg']) {
        html += '<div class="nb-cell-output"><img src="data:image/jpeg;base64,' + data['image/jpeg'] + '"></div>';
      } else if (data['image/svg+xml']) {
        var svg = Array.isArray(data['image/svg+xml']) ? data['image/svg+xml'].join('') : data['image/svg+xml'];
        html += '<div class="nb-cell-output">' + svg + '</div>';
      } else if (data['text/plain']) {
        var plainText = Array.isArray(data['text/plain']) ? data['text/plain'].join('') : data['text/plain'];
        html += '<div class="nb-cell-output"><pre>' + esc(plainText) + '</pre></div>';
      }
    } else if (output.output_type === 'error') {
      var tb = (output.traceback || []).join('\n').replace(/\x1b\[[0-9;]*m/g, '');
      html += '<div class="nb-cell-output nb-output-error"><pre>' + esc(tb) + '</pre></div>';
    }
  }
  return html;
}

// ═══════════════════════════════════════════════════════════════
// Notebook rendering and cell operations
// ═══════════════════════════════════════════════════════════════

function renderNotebookView(relPath) {
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  var nb = f.notebookData;
  var renderedView = document.getElementById('file-rendered-view');

  var html = '<div class="notebook-container">';
  html += renderAddCellRow(relPath, -1);

  for (var i = 0; i < nb.cells.length; i++) {
    var cell = nb.cells[i];
    var isActive = i === activeCellIdx;
    var badge = cell.cell_type === 'code'
      ? '<span class="nb-cell-badge code">Code</span>'
      : '<span class="nb-cell-badge markdown">Md</span>';
    var execCount = cell.cell_type === 'code' && cell.execution_count != null
      ? '<span class="nb-exec-count">[' + cell.execution_count + ']</span>' : '';

    html += '<div class="nb-cell ' + (isActive ? 'nb-cell-active' : '') + '" data-cell-idx="' + i + '">';
    html += '<div class="nb-cell-sidebar">' + badge + execCount;
    html += '<div class="nb-cell-actions">';
    html += '<button class="nb-cell-action-btn" onclick="nbMoveCellUp(\'' + esc(relPath) + '\',' + i + ')" title="Move up">&uarr;</button>';
    html += '<button class="nb-cell-action-btn" onclick="nbMoveCellDown(\'' + esc(relPath) + '\',' + i + ')" title="Move down">&darr;</button>';
    html += '<button class="nb-cell-action-btn" onclick="nbToggleCellType(\'' + esc(relPath) + '\',' + i + ')" title="Toggle type">&harr;</button>';
    html += '<button class="nb-cell-action-btn" onclick="nbDeleteCell(\'' + esc(relPath) + '\',' + i + ')" title="Delete">&times;</button>';
    html += '</div></div>';
    html += '<div class="nb-cell-content">';
    html += '<div class="nb-cell-input" onclick="nbCellClick(\'' + esc(relPath) + '\',' + i + ')" data-cell-input="' + i + '">';
    if (cell.cell_type === 'markdown') {
      if (cell.editing) {
        html += '<textarea onblur="nbFinishMarkdownEdit(\'' + esc(relPath) + '\',' + i + ')" data-md-edit="' + i + '">' + esc(cell.source) + '</textarea>';
      } else {
        html += '<div class="file-rendered">' + renderMarkdown(cell.source) + '</div>';
      }
    } else {
      // Code cell — static view (Monaco will be injected on click)
      html += '<pre><code>' + highlightCode(esc(cell.source), 'python') + '</code></pre>';
    }
    html += '</div>';
    // Outputs
    html += renderCellOutputs(cell.outputs);
    html += '</div></div>';
    html += renderAddCellRow(relPath, i);
  }

  html += '</div>';
  renderedView.innerHTML = html;

  // Focus markdown textarea if editing
  var mdEdit = renderedView.querySelector('textarea[data-md-edit]');
  if (mdEdit) mdEdit.focus();

  // Eagerly load Monaco for notebook
  loadMonaco().catch(function() {});
}

function renderAddCellRow(relPath, afterIdx) {
  return '<div class="nb-add-cell-row">' +
    '<button class="nb-add-cell-btn" onclick="nbAddCell(\'' + esc(relPath) + '\',' + afterIdx + ',\'code\')">+ Code</button>' +
    '<button class="nb-add-cell-btn" onclick="nbAddCell(\'' + esc(relPath) + '\',' + afterIdx + ',\'markdown\')">+ Markdown</button>' +
    '</div>';
}

function nbCellClick(relPath, cellIdx) {
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  var cell = f.notebookData.cells[cellIdx];
  if (!cell) return;

  activeCellIdx = cellIdx;

  if (cell.cell_type === 'markdown') {
    // Toggle markdown editing
    if (!cell.editing) {
      disposeNotebookCellMonaco();
      cell.editing = true;
      renderNotebookView(relPath);
    }
    return;
  }

  // Code cell — open Monaco editor
  if (activeNotebookCellIdx === cellIdx) return; // Already editing this cell
  disposeNotebookCellMonaco();

  var inputEl = document.querySelector('[data-cell-input="' + cellIdx + '"]');
  if (!inputEl) return;

  if (monacoFailed) {
    // Fallback: textarea for code cell
    cell.editing = true;
    inputEl.innerHTML = '<textarea onblur="nbFinishCodeEdit(\'' + esc(relPath) + '\',' + cellIdx + ')" style="width:100%;min-height:80px;background:#0a0a16;color:#c0c0d0;border:none;outline:none;font-family:inherit;font-size:13px;line-height:1.55;resize:vertical;padding:0">' + esc(cell.source) + '</textarea>';
    inputEl.querySelector('textarea').focus();
    return;
  }

  loadMonaco().then(function() {
    // Re-check that we're still editing this cell
    if (activeCellIdx !== cellIdx) return;
    inputEl.innerHTML = '<div class="monaco-container"></div>';
    var container = inputEl.querySelector('.monaco-container');
    var editor = createMonacoEditor(container, {
      value: cell.source,
      language: 'python',
      readOnly: false,
      scrollBeyondLastLine: false,
    });

    // Auto-size
    var updateHeight = function() {
      var contentHeight = Math.min(500, Math.max(40, editor.getContentHeight()));
      container.style.height = contentHeight + 'px';
      editor.layout();
    };
    editor.onDidContentSizeChange(updateHeight);
    updateHeight();

    editor.onDidChangeModelContent(function() {
      cell.source = editor.getValue();
      f.modified = true;
      renderWsTabs();
    });

    activeNotebookCellMonaco = editor;
    activeNotebookCellIdx = cellIdx;
    editor.focus();
  }).catch(function() {
    // Fallback
    cell.editing = true;
    renderNotebookView(relPath);
  });
}

function nbFinishMarkdownEdit(relPath, cellIdx) {
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  var cell = f.notebookData.cells[cellIdx];
  if (!cell) return;
  var textarea = document.querySelector('textarea[data-md-edit="' + cellIdx + '"]');
  if (textarea) {
    cell.source = textarea.value;
    f.modified = true;
    renderWsTabs();
  }
  cell.editing = false;
  renderNotebookView(relPath);
}

function nbFinishCodeEdit(relPath, cellIdx) {
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  var cell = f.notebookData.cells[cellIdx];
  if (!cell) return;
  var textarea = document.querySelector('[data-cell-input="' + cellIdx + '"] textarea');
  if (textarea) {
    cell.source = textarea.value;
    f.modified = true;
    renderWsTabs();
  }
  cell.editing = false;
  disposeNotebookCellMonaco();
  renderNotebookView(relPath);
}

function nbAddCell(relPath, afterIdx, cellType) {
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  disposeNotebookCellMonaco();
  var newCell = {
    id: 'cell-new-' + Date.now(),
    cell_type: cellType,
    source: '',
    outputs: [],
    metadata: {},
    execution_count: null,
    monacoInstance: null,
    editing: true,
  };
  f.notebookData.cells.splice(afterIdx + 1, 0, newCell);
  f.modified = true;
  activeCellIdx = afterIdx + 1;
  renderWsTabs();
  renderNotebookView(relPath);
  // Scroll to new cell
  setTimeout(function() {
    var el = document.querySelector('[data-cell-idx="' + (afterIdx + 1) + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

function nbDeleteCell(relPath, cellIdx) {
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  var cell = f.notebookData.cells[cellIdx];
  if (cell.source.trim() && !confirm('Delete this cell?')) return;
  if (activeNotebookCellIdx === cellIdx) disposeNotebookCellMonaco();
  f.notebookData.cells.splice(cellIdx, 1);
  f.modified = true;
  activeCellIdx = null;
  renderWsTabs();
  renderNotebookView(relPath);
}

function nbMoveCellUp(relPath, cellIdx) {
  if (cellIdx === 0) return;
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  disposeNotebookCellMonaco();
  var cells = f.notebookData.cells;
  var tmp = cells[cellIdx - 1];
  cells[cellIdx - 1] = cells[cellIdx];
  cells[cellIdx] = tmp;
  f.modified = true;
  activeCellIdx = cellIdx - 1;
  renderWsTabs();
  renderNotebookView(relPath);
}

function nbMoveCellDown(relPath, cellIdx) {
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  if (cellIdx >= f.notebookData.cells.length - 1) return;
  disposeNotebookCellMonaco();
  var cells = f.notebookData.cells;
  var tmp = cells[cellIdx];
  cells[cellIdx] = cells[cellIdx + 1];
  cells[cellIdx + 1] = tmp;
  f.modified = true;
  activeCellIdx = cellIdx + 1;
  renderWsTabs();
  renderNotebookView(relPath);
}

function nbToggleCellType(relPath, cellIdx) {
  var f = openFiles[relPath];
  if (!f || !f.notebookData) return;
  disposeNotebookCellMonaco();
  var cell = f.notebookData.cells[cellIdx];
  if (cell.cell_type === 'code') {
    cell.cell_type = 'markdown';
    cell.outputs = [];
    cell.execution_count = null;
  } else {
    cell.cell_type = 'code';
  }
  cell.editing = false;
  f.modified = true;
  renderWsTabs();
  renderNotebookView(relPath);
}
