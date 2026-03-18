// ═══════════════════════════════════════════════════════════════
// Agent-pushed panel tabs (data-viewer, dag, diagram, chart, etc.)
// ═══════════════════════════════════════════════════════════════

// ─── Data normalization ────────────────────────────────────────────────────────
// Accepts any data shape the server or agent may send; returns { columns, data }

function normalizePanelData(raw) {
  if (!raw) return { columns: [], data: [] };
  // Already normalized by server (CSV/JSON file parse or prior normalization)
  if (raw.columns && Array.isArray(raw.columns) && raw.data && Array.isArray(raw.data)) {
    return raw;
  }
  // Inline JSON array of objects
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { columns: [], data: [] };
    if (typeof raw[0] === 'object' && raw[0] !== null) return flattenToTable(raw);
    // Array of primitives — single column
    return { columns: ['value'], data: raw.map(function(v) { return { value: v }; }) };
  }
  // Single object — wrap as one row
  if (typeof raw === 'object') return flattenToTable([raw]);
  return { columns: [], data: [] };
}

// ─── Panel tab lifecycle ──────────────────────────────────────────────────────

function openPanelTab(panelId, panelInfo) {
  if (openPanels[panelId]) {
    // Update existing panel
    var p = openPanels[panelId];
    if (panelInfo.title) p.title = panelInfo.title;
    if (panelInfo.agent) p.agent = panelInfo.agent;
    p.rawData = panelInfo.data !== undefined ? panelInfo.data : p.rawData;
    renderWsTabs();
    // Re-render if this panel is currently active
    var activeKey = splitMode ? currentFileInPane : activeTabId;
    if (activeKey === panelId) renderPanelPane(panelId);
    return;
  }

  openPanels[panelId] = {
    panelId: panelId,
    panel: panelInfo.panel,
    title: panelInfo.title || panelInfo.panel,
    agent: panelInfo.agent || null,
    rawData: panelInfo.data !== undefined ? panelInfo.data : null,
    tabulatorInstance: null,
  };
  panelTabOrder.push(panelId);

  // Switch to the new panel
  if (splitMode) {
    currentFileInPane = panelId;
    renderWsTabs();
    renderPanelPane(panelId);
  } else {
    activeTabId = panelId;
    renderWsTabs();
    showActiveContent();
  }
}

function closePanelTab(panelId) {
  var p = openPanels[panelId];
  if (!p) return;

  // Destroy tabulator instance if it exists
  if (p.tabulatorInstance) {
    if (activeTabulatorInstance === p.tabulatorInstance) {
      activeTabulatorInstance = null;
      activeTabularColumns = null;
    }
    try { p.tabulatorInstance.destroy(); } catch(e) {}
    p.tabulatorInstance = null;
  }

  delete openPanels[panelId];
  panelTabOrder = panelTabOrder.filter(function(id) { return id !== panelId; });

  // Switch away if this panel was active
  var activeKey = splitMode ? currentFileInPane : activeTabId;
  if (activeKey === panelId) {
    if (splitMode) {
      currentFileInPane = fileTabOrder.length > 0 ? fileTabOrder[0] :
                          (panelTabOrder.length > 0 ? panelTabOrder[0] : null);
    } else {
      activeTabId = panelTabOrder.length > 0 ? panelTabOrder[0] :
                   (fileTabOrder.length > 0 ? fileTabOrder[0] : 'chat');
    }
  }

  renderWsTabs();
  showActiveContent();
}

// ─── Live update (Story 2.3) ──────────────────────────────────────────────────
// Called on ui-panel-update SSE; re-renders data preserving sort state

function updatePanelData(panelId, newData) {
  var p = openPanels[panelId];
  if (!p) return;
  p.rawData = newData;

  // Only do a live Tabulator update if this panel is currently visible
  var activeKey = splitMode ? currentFileInPane : activeTabId;
  if (activeKey !== panelId) return;

  if (p.panel === 'data-viewer' && p.tabulatorInstance) {
    var sorters = [];
    try { sorters = p.tabulatorInstance.getSorters() || []; } catch(e) {}
    var tableData = normalizePanelData(newData);
    p.tabulatorInstance.replaceData(tableData.data).then(function() {
      if (sorters.length > 0) {
        try { p.tabulatorInstance.setSort(sorters); } catch(e) {}
      }
      document.getElementById('table-row-count').textContent = tableData.data.length + ' rows';
    }).catch(function() {});
  }
}

// ─── Panel rendering ──────────────────────────────────────────────────────────

function renderPanelPane(panelId) {
  var p = openPanels[panelId];
  if (!p) { renderEmptyFilePane(); return; }

  // Set header, hide file-specific controls
  document.getElementById('file-path-display').textContent = p.title;
  document.getElementById('edit-btn').style.display = 'none';
  document.getElementById('save-btn').style.display = 'none';

  var renderedView = document.getElementById('file-rendered-view');
  var editorEl = document.getElementById('file-editor');
  var tableView = document.getElementById('table-view');

  renderedView.classList.remove('visible');
  renderedView.innerHTML = '';
  editorEl.style.display = 'none';
  disposeMonacoInstance();

  if (p.panel === 'data-viewer') {
    tableView.classList.add('visible');

    // Always destroy stale instance — container DOM may have been overwritten
    // by a file tab's initTabulator since we last rendered this panel
    if (p.tabulatorInstance) {
      if (activeTabulatorInstance === p.tabulatorInstance) {
        activeTabulatorInstance = null;
        activeTabularColumns = null;
      }
      try { p.tabulatorInstance.destroy(); } catch(e) {}
      p.tabulatorInstance = null;
    }

    var tableData = normalizePanelData(p.rawData);
    initPanelTabulator(p, tableData);
  } else {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderedView.innerHTML =
      '<div class="no-file-msg">Panel type <strong>' + esc(p.panel) + '</strong> is not yet supported in this version.</div>';
  }
}

// ─── Panel Tabulator init ─────────────────────────────────────────────────────

function initPanelTabulator(panel, tableData) {
  // If the global active instance belongs to a file (not this panel), leave it —
  // it will be cleaned up by the next renderFilePane call. We just overwrite the
  // global pointer after creating the panel instance.
  activeTabularColumns = tableData.columns;

  var columns = tableData.columns.map(function(col) {
    return {
      title: col,
      field: col,
      headerFilter: 'input',
      sorter: 'string',
      resizable: true,
      editor: false,
    };
  });

  var container = document.getElementById('table-container');
  container.innerHTML = '';

  // Hide edit buttons — panels are always read-only
  document.getElementById('table-edit-btns').className = '';

  if (typeof Tabulator === 'undefined') {
    container.innerHTML = '<div class="no-file-msg">Tabulator not loaded. Cannot render data viewer.</div>';
    return;
  }

  var instance = new Tabulator(container, {
    data: tableData.data,
    columns: columns.length > 0 ? columns : [{ title: '(no columns)', field: '_empty' }],
    layout: 'fitDataFill',
    height: '100%',
    virtualDom: true,
    selectableRows: false,
    placeholder: 'No data',
  });

  instance.on('dataLoaded', function(data) {
    document.getElementById('table-row-count').textContent = data.length + ' rows';
  });
  instance.on('dataFiltered', function(filters, rows) {
    document.getElementById('table-row-count').textContent = rows.length + ' rows';
  });

  // Wire global search to this instance
  var searchInput = document.getElementById('table-search');
  searchInput.value = '';
  searchInput.oninput = function() {
    var term = searchInput.value.toLowerCase();
    if (!term) {
      instance.clearFilter();
    } else {
      instance.setFilter(function(rowData) {
        return Object.values(rowData).some(function(v) {
          return v != null && String(v).toLowerCase().includes(term);
        });
      });
    }
  };

  panel.tabulatorInstance = instance;
  activeTabulatorInstance = instance;
}
