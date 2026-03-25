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
  var ptIdx = panelTabOrder.indexOf(panelId);
  if (ptIdx !== -1) panelTabOrder.splice(ptIdx, 1);

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

  if (p.panel === 'experiment-dashboard') {
    cleanupExperimentDashboard(p);
    renderExperimentDashboard(document.getElementById('file-rendered-view'), p);
    return;
  }

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
    document.getElementById('table-download-csv').style.display = 'inline-block';

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
  } else if (p.panel === 'experiment-dashboard') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderExperimentDashboard(renderedView, p);
  } else if (p.panel === 'chart') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderChartPanel(renderedView, p);
  } else if (p.panel === 'diagram' || p.panel === 'dag') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderDiagramPanel(renderedView, p);
  } else {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderedView.innerHTML =
      '<div class="no-file-msg">Panel type <strong>' + esc(p.panel) + '</strong> is not yet supported in this version.</div>';
  }
}

// ─── Chart Panel (Plotly.js) ──────────────────────────────────────────────────

function renderChartPanel(container, panel) {
  var data = panel.rawData;
  if (!data) {
    container.innerHTML = '<div class="no-file-msg">No chart data provided.</div>';
    return;
  }

  // Ensure container has a div for Plotly
  var chartId = 'chart-' + panel.panelId;
  container.innerHTML = '<div id="' + chartId + '" style="width:100%;height:100%"></div>';

  if (typeof Plotly === 'undefined') {
    container.innerHTML = '<div class="no-file-msg">Plotly.js not loaded. Cannot render chart.</div>';
    return;
  }

  // Support both full Plotly spec { data, layout } and just the data array
  var plotlyData = Array.isArray(data) ? data : (data.data || []);
  var plotlyLayout = data.layout || {
    title: panel.title,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: document.documentElement.getAttribute('data-theme') !== 'light' ? '#b0b0c8' : '#333' },
    margin: { t: 40, r: 20, b: 40, l: 60 }
  };

  try {
    Plotly.newPlot(chartId, plotlyData, plotlyLayout, { responsive: true, displayModeBar: false });
  } catch(e) {
    container.innerHTML = '<div class="no-file-msg">Failed to render Plotly chart: ' + esc(e.message) + '</div>';
  }
}

// ─── Diagram Panel (Mermaid.js) ────────────────────────────────────────────────

function renderDiagramPanel(container, panel) {
  var data = panel.rawData;
  if (!data) {
    container.innerHTML = '<div class="no-file-msg">No diagram data provided.</div>';
    return;
  }

  var content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  if (typeof mermaid === 'undefined') {
    container.innerHTML = '<div class="no-file-msg">Mermaid.js not loaded. Cannot render diagram.</div>';
    return;
  }

  var diagramId = 'mermaid-' + panel.panelId;
  container.innerHTML = '<div class="mermaid" id="' + diagramId + '">' + esc(content) + '</div>';

  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: document.documentElement.getAttribute('data-theme') !== 'light' ? 'dark' : 'default',
      securityLevel: 'loose',
    });
    mermaid.run({ nodes: [document.getElementById(diagramId)] });
  } catch(e) {
    container.innerHTML = '<div class="no-file-msg">Failed to render Mermaid diagram: ' + esc(e.message) + '</div>';
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

// ─── Experiment Dashboard ────────────────────────────────────────────────────

function cleanupExperimentDashboard(panel) {
  if (panel._expTabulator) {
    try { panel._expTabulator.destroy(); } catch(e) {}
    panel._expTabulator = null;
  }
  var barEl = document.getElementById('exp-bar-' + panel.panelId);
  var lineEl = document.getElementById('exp-line-' + panel.panelId);
  if (typeof Plotly !== 'undefined') {
    if (barEl) try { Plotly.purge(barEl); } catch(e) {}
    if (lineEl) try { Plotly.purge(lineEl); } catch(e) {}
  }
}

function renderExperimentDashboard(container, panel) {
  var d = panel.rawData;
  if (!d) {
    container.innerHTML = '<div class="no-file-msg">No experiment data provided.</div>';
    return;
  }

  // Preserve comparison state across re-renders
  panel._expState = panel._expState || { selectedRows: [] };

  var html = '<div class="experiment-dashboard">';

  // ── Progress bar ──
  var total = d.plannedCount || 0;
  var done = (d.experiments || []).length;
  var status = d.status || 'setup';
  var current = d.currentExperiment || null;

  html += '<div class="exp-progress">';
  html += '<div class="exp-progress-label">';
  html += '<span><span class="exp-status-badge ' + esc(status) + '">' + esc(status) + '</span></span>';
  html += '<span>' + done + ' / ' + total + ' experiments</span>';
  html += '</div>';
  html += '<div class="exp-progress-bar">';
  for (var i = 1; i <= total; i++) {
    var cls = 'pending';
    if (i <= done) cls = 'completed';
    else if (status === 'running' && current === i) cls = 'active';
    html += '<div class="exp-progress-segment ' + cls + '"></div>';
  }
  html += '</div></div>';

  // ── Charts ──
  var exps = d.experiments || [];
  var barId = 'exp-bar-' + panel.panelId;
  var lineId = 'exp-line-' + panel.panelId;
  html += '<div class="exp-charts">';
  html += '<div id="' + barId + '"></div>';
  html += '<div id="' + lineId + '"></div>';
  html += '</div>';

  // ── Comparison controls ──
  html += '<div class="exp-compare-bar">';
  html += '<button id="exp-compare-btn-' + panel.panelId + '" disabled onclick="expCompare(\'' + esc(panel.panelId) + '\')">Compare Selected</button>';
  html += '<span id="exp-compare-count-' + panel.panelId + '" class="exp-compare-hint">Select 2 rows to compare</span>';
  html += '</div>';
  html += '<div id="exp-compare-view-' + panel.panelId + '"></div>';

  // ── Results table ──
  html += '<div class="exp-results-table" id="exp-table-' + panel.panelId + '"></div>';

  html += '</div>';
  container.innerHTML = html;

  // ── Render Plotly charts ──
  if (typeof Plotly !== 'undefined' && exps.length > 0) {
    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    var fontColor = isDark ? '#b0b0c8' : '#333';
    var gridColor = isDark ? '#1e1e32' : '#e0e0e0';

    // Bar chart — deltas
    var barNames = exps.map(function(e) { return e.name || ('Exp ' + e.index); });
    var barDeltas = exps.map(function(e) { return e.metrics && e.metrics.outcome ? e.metrics.outcome.delta : 0; });
    var barColors = barDeltas.map(function(v) { return v >= 0 ? '#4a9' : '#c84a4a'; });

    var barShapes = [];
    if (d.successThreshold != null && d.baseline && d.baseline.value != null) {
      barShapes.push({
        type: 'line', yref: 'y', y0: d.successThreshold - d.baseline.value,
        y1: d.successThreshold - d.baseline.value, x0: -0.5, x1: barNames.length - 0.5,
        line: { color: '#c8a84a', width: 1, dash: 'dash' }
      });
    }

    Plotly.newPlot(barId, [{
      x: barNames, y: barDeltas, type: 'bar',
      marker: { color: barColors },
      hovertemplate: '%{x}: %{y:+.4f}<extra></extra>'
    }], {
      title: { text: 'Outcome Metric Delta', font: { size: 13, color: fontColor } },
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      font: { color: fontColor }, margin: { t: 36, r: 16, b: 40, l: 50 },
      xaxis: { gridcolor: gridColor }, yaxis: { gridcolor: gridColor, zeroline: true, zerolinecolor: '#6a6a88' },
      shapes: barShapes
    }, { responsive: true, displayModeBar: false });

    // Line chart — cumulative outcome value
    var lineX = ['Baseline'].concat(barNames);
    var lineY = [d.baseline ? d.baseline.value : 0];
    for (var j = 0; j < exps.length; j++) {
      lineY.push(exps[j].metrics && exps[j].metrics.outcome ? exps[j].metrics.outcome.after : lineY[lineY.length - 1]);
    }

    var lineShapes = [];
    if (d.successThreshold != null) {
      lineShapes.push({
        type: 'line', yref: 'y', y0: d.successThreshold, y1: d.successThreshold,
        x0: -0.5, x1: lineX.length - 0.5,
        line: { color: '#c8a84a', width: 1, dash: 'dash' }
      });
    }

    Plotly.newPlot(lineId, [{
      x: lineX, y: lineY, type: 'scatter', mode: 'lines+markers',
      line: { color: '#6a8ac8', width: 2 }, marker: { size: 6 },
      hovertemplate: '%{x}: %{y:.4f}<extra></extra>'
    }], {
      title: { text: 'Outcome Metric Over Time', font: { size: 13, color: fontColor } },
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      font: { color: fontColor }, margin: { t: 36, r: 16, b: 40, l: 50 },
      xaxis: { gridcolor: gridColor }, yaxis: { gridcolor: gridColor },
      shapes: lineShapes
    }, { responsive: true, displayModeBar: false });
  }

  // ── Results Tabulator table ──
  if (typeof Tabulator !== 'undefined' && exps.length > 0) {
    var tableRows = exps.map(function(e) {
      var om = e.metrics && e.metrics.outcome ? e.metrics.outcome : {};
      return {
        index: e.index,
        name: e.name || '',
        before: om.before != null ? om.before : '',
        after: om.after != null ? om.after : '',
        delta: om.delta != null ? om.delta : '',
        dsVerdict: e.dsVerdict || '',
        outcome: e.outcome || '',
        recommendation: e.recommendation || ''
      };
    });

    var tblContainer = document.getElementById('exp-table-' + panel.panelId);
    var tbl = new Tabulator(tblContainer, {
      data: tableRows,
      layout: 'fitDataFill',
      height: '100%',
      selectableRows: 'highlight',
      columns: [
        { title: '#', field: 'index', width: 40, hozAlign: 'center' },
        { title: 'Name', field: 'name', minWidth: 120 },
        { title: 'Before', field: 'before', hozAlign: 'right', width: 80 },
        { title: 'After', field: 'after', hozAlign: 'right', width: 80 },
        { title: 'Delta', field: 'delta', hozAlign: 'right', width: 80,
          formatter: function(cell) {
            var v = cell.getValue();
            if (v === '' || v == null) return '';
            var cls = v > 0 ? 'exp-delta-positive' : (v < 0 ? 'exp-delta-negative' : '');
            return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + v + '</span>';
          }
        },
        { title: 'DS Verdict', field: 'dsVerdict', minWidth: 150,
          formatter: function(cell) {
            var v = cell.getValue();
            return v.length > 80 ? v.substring(0, 80) + '...' : v;
          }
        },
        { title: 'Outcome', field: 'outcome', width: 100,
          formatter: function(cell) {
            var v = cell.getValue();
            var cls = v.toLowerCase();
            return '<span class="exp-outcome-badge ' + cls + '">' + esc(v) + '</span>';
          }
        },
        { title: 'Recommendation', field: 'recommendation', width: 120,
          formatter: function(cell) {
            var v = cell.getValue();
            var cls = v.toLowerCase();
            return '<span class="exp-rec-badge ' + cls + '">' + esc(v) + '</span>';
          }
        }
      ]
    });

    // Track selection for comparison
    tbl.on('rowSelected', function() { expUpdateCompareUI(panel.panelId, tbl); });
    tbl.on('rowDeselected', function() { expUpdateCompareUI(panel.panelId, tbl); });
    panel._expTabulator = tbl;
  }
}

// ── Comparison helpers ──

function expUpdateCompareUI(panelId, tbl) {
  var selected = tbl.getSelectedData();
  var btn = document.getElementById('exp-compare-btn-' + panelId);
  var count = document.getElementById('exp-compare-count-' + panelId);
  if (btn) btn.disabled = selected.length !== 2;
  if (count) count.textContent = selected.length === 2 ? '2 selected' : 'Select 2 rows to compare';
}

function expCompare(panelId) {
  var p = openPanels[panelId];
  if (!p || !p._expTabulator) return;
  var selected = p._expTabulator.getSelectedData();
  if (selected.length !== 2) return;

  var d = p.rawData;
  var exps = d.experiments || [];
  var a = exps.find(function(e) { return e.index === selected[0].index; });
  var b = exps.find(function(e) { return e.index === selected[1].index; });
  if (!a || !b) return;

  var view = document.getElementById('exp-compare-view-' + panelId);
  if (!view) return;

  view.innerHTML = '<div class="exp-compare-split">' +
    expCompareColumn(a) + expCompareColumn(b) +
    '</div>';
}

function expCompareColumn(exp) {
  var html = '<div>';
  html += '<h4>Experiment ' + exp.index + ': ' + esc(exp.name || '') + '</h4>';
  html += '<table><tr><th>Metric</th><th>Before</th><th>After</th><th>Delta</th></tr>';

  var om = exp.metrics && exp.metrics.outcome ? exp.metrics.outcome : {};
  html += '<tr><td><strong>Outcome</strong></td>';
  html += '<td>' + (om.before != null ? om.before : '-') + '</td>';
  html += '<td>' + (om.after != null ? om.after : '-') + '</td>';
  html += '<td class="' + (om.delta > 0 ? 'exp-delta-positive' : om.delta < 0 ? 'exp-delta-negative' : '') + '">';
  html += (om.delta != null ? (om.delta > 0 ? '+' : '') + om.delta : '-') + '</td></tr>';

  var secondary = (exp.metrics && exp.metrics.secondary) || [];
  for (var i = 0; i < secondary.length; i++) {
    var s = secondary[i];
    html += '<tr><td>' + esc(s.name) + '</td>';
    html += '<td>' + (s.before != null ? s.before : '-') + '</td>';
    html += '<td>' + (s.after != null ? s.after : '-') + '</td>';
    var dCls = s.delta > 0 ? 'exp-delta-positive' : s.delta < 0 ? 'exp-delta-negative' : '';
    html += '<td class="' + dCls + '">' + (s.delta != null ? (s.delta > 0 ? '+' : '') + s.delta : '-') + '</td></tr>';
  }

  html += '</table>';
  html += '<div style="margin-top:8px;font-size:11px"><strong>Recommendation:</strong> ' + esc(exp.recommendation || '-') + '</div>';
  html += '</div>';
  return html;
}
