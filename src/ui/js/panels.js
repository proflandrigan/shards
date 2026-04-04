// ═══════════════════════════════════════════════════════════════
// Agent-pushed panel tabs (data-viewer, dag, diagram, chart, etc.)
// ═══════════════════════════════════════════════════════════════

// ─── Theme re-render helper (called from init.js / settings.js) ──────────────

function rerenderActiveDiagramPanel() {
  var activeKey = splitMode ? currentFileInPane : activeTabId;
  if (!activeKey) return;
  var p = openPanels[activeKey];
  if (!p || (p.panel !== 'diagram' && p.panel !== 'dag')) return;
  if (p._diagramState) p._diagramState.lastContent = null; // force Mermaid re-init with new theme
  renderPanelPane(activeKey);
}

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
  var oldRawData = p.rawData;
  p.rawData = newData;

  // Only do a live update if this panel is currently visible
  var activeKey = splitMode ? currentFileInPane : activeTabId;
  if (activeKey !== panelId) return;

  if (p.panel === 'diagram' || p.panel === 'dag') {
    var oldContent = typeof oldRawData === 'string' ? oldRawData : JSON.stringify(oldRawData, null, 2);
    var newContent = typeof newData === 'string' ? newData : JSON.stringify(newData, null, 2);
    if (oldContent === newContent) return;
    if (p._diagramState) {
      p._diagramState.lastContent = null; // force re-fit on changed content
    }
    renderPanelPane(panelId);
    return;
  }

  if (p.panel === 'experiment-dashboard') {
    cleanupExperimentDashboard(p);
    renderExperimentDashboard(document.getElementById('file-rendered-view'), p);
    return;
  }

  if (p.panel === 'prompt-lab') {
    cleanupPromptLab(p);
    renderPromptLab(document.getElementById('file-rendered-view'), p);
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
  renderedView.classList.remove('diagram-active');
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
  } else if (p.panel === 'prompt-lab') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderPromptLab(renderedView, p);
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

// ─── Diagram Panel (Mermaid.js) — pan / zoom ──────────────────────────────────

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

  // Decide whether to restore viewport or fit-to-view
  var isRestore = panel._diagramState && panel._diagramState.lastContent === content;
  if (!panel._diagramState) {
    panel._diagramState = { panX: 0, panY: 0, scale: 1, lastContent: content };
  }
  panel._diagramState.lastContent = content;

  var diagramId = 'mermaid-' + panel.panelId;

  // Build DOM: viewport > canvas > mermaid + controls
  container.innerHTML = '';
  container.classList.add('diagram-active');

  var viewport = document.createElement('div');
  viewport.className = 'diagram-viewport';

  var canvas = document.createElement('div');
  canvas.className = 'diagram-canvas';

  var mermaidDiv = document.createElement('div');
  mermaidDiv.className = 'mermaid';
  mermaidDiv.id = diagramId;
  mermaidDiv.textContent = content;

  canvas.appendChild(mermaidDiv);
  viewport.appendChild(canvas);

  var controls = document.createElement('div');
  controls.className = 'diagram-controls';
  controls.innerHTML =
    '<button class="diagram-ctrl-btn" title="Zoom in" data-action="zoom-in">+</button>' +
    '<span class="diagram-zoom-label">100%</span>' +
    '<button class="diagram-ctrl-btn" title="Zoom out" data-action="zoom-out">&minus;</button>' +
    '<button class="diagram-ctrl-btn" title="Fit to view" data-action="fit">&#9638;</button>';
  viewport.appendChild(controls);
  container.appendChild(viewport);

  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.getAttribute('data-theme') !== 'light' ? 'dark' : 'default',
    securityLevel: 'loose',
  });

  try {
    var result = mermaid.run({ nodes: [document.getElementById(diagramId)] });
    // mermaid.run returns a promise in v11+
    if (result && typeof result.then === 'function') {
      result.then(function() {
        if (isRestore) {
          applyDiagramTransform(canvas, panel._diagramState, controls);
        } else {
          fitDiagramToView(viewport, canvas, panel._diagramState, controls);
        }
      });
    } else {
      // Fallback: run synchronously completed
      if (isRestore) {
        applyDiagramTransform(canvas, panel._diagramState, controls);
      } else {
        fitDiagramToView(viewport, canvas, panel._diagramState, controls);
      }
    }
  } catch(e) {
    container.innerHTML = '<div class="no-file-msg">Failed to render Mermaid diagram: ' + esc(e.message) + '</div>';
    return;
  }

  initDiagramPanZoom(viewport, canvas, panel._diagramState, controls);
}

function applyDiagramTransform(canvas, state, controls) {
  canvas.style.transform = 'translate(' + state.panX + 'px, ' + state.panY + 'px) scale(' + state.scale + ')';
  var label = controls.querySelector('.diagram-zoom-label');
  if (label) label.textContent = Math.round(state.scale * 100) + '%';
}

function fitDiagramToView(viewport, canvas, state, controls) {
  canvas.style.transform = 'none';
  var svg = canvas.querySelector('svg');
  if (!svg) return;

  var svgRect = svg.getBoundingClientRect();
  var vpRect = viewport.getBoundingClientRect();
  var pad = 40;

  if (svgRect.width === 0 || svgRect.height === 0) return;

  var scaleX = (vpRect.width - pad * 2) / svgRect.width;
  var scaleY = (vpRect.height - pad * 2) / svgRect.height;
  var scale = Math.min(scaleX, scaleY, 1.5);
  scale = Math.max(scale, 0.1);

  var scaledW = svgRect.width * scale;
  var scaledH = svgRect.height * scale;
  state.panX = (vpRect.width - scaledW) / 2;
  state.panY = (vpRect.height - scaledH) / 2;
  state.scale = scale;

  applyDiagramTransform(canvas, state, controls);
}

function initDiagramPanZoom(viewport, canvas, state, controls) {
  var MIN_SCALE = 0.1;
  var MAX_SCALE = 5;
  var isPanning = false;
  var startX, startY, startPanX, startPanY;

  viewport.addEventListener('pointerdown', function(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.diagram-controls')) return;
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = state.panX;
    startPanY = state.panY;
    viewport.style.cursor = 'grabbing';
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  viewport.addEventListener('pointermove', function(e) {
    if (!isPanning) return;
    state.panX = startPanX + (e.clientX - startX);
    state.panY = startPanY + (e.clientY - startY);
    applyDiagramTransform(canvas, state, controls);
  });

  viewport.addEventListener('pointerup', function(e) {
    if (!isPanning) return;
    isPanning = false;
    viewport.style.cursor = '';
  });

  viewport.addEventListener('pointercancel', function() {
    isPanning = false;
    viewport.style.cursor = '';
  });

  viewport.addEventListener('wheel', function(e) {
    e.preventDefault();
    var rect = viewport.getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;

    var zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    var newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale * zoomFactor));

    var scaleChange = newScale / state.scale;
    state.panX = mouseX - scaleChange * (mouseX - state.panX);
    state.panY = mouseY - scaleChange * (mouseY - state.panY);
    state.scale = newScale;

    applyDiagramTransform(canvas, state, controls);
  }, { passive: false });

  controls.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var rect = viewport.getBoundingClientRect();
    var cx = rect.width / 2;
    var cy = rect.height / 2;

    if (action === 'zoom-in') {
      var ns = Math.min(MAX_SCALE, state.scale * 1.25);
      var sc = ns / state.scale;
      state.panX = cx - sc * (cx - state.panX);
      state.panY = cy - sc * (cy - state.panY);
      state.scale = ns;
      applyDiagramTransform(canvas, state, controls);
    } else if (action === 'zoom-out') {
      var ns2 = Math.max(MIN_SCALE, state.scale * 0.8);
      var sc2 = ns2 / state.scale;
      state.panX = cx - sc2 * (cx - state.panX);
      state.panY = cy - sc2 * (cy - state.panY);
      state.scale = ns2;
      applyDiagramTransform(canvas, state, controls);
    } else if (action === 'fit') {
      fitDiagramToView(viewport, canvas, state, controls);
    }
  });
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

// ═══════════════════════════════════════════════════════════════
// Prompt Laboratory panel
// ═══════════════════════════════════════════════════════════════

function cleanupPromptLab(panel) {
  if (panel._plEditor) {
    try { panel._plEditor.dispose(); } catch(e) {}
    panel._plEditor = null;
  }
  if (panel._plDiffEditor) {
    try {
      var model = panel._plDiffEditor.getModel();
      if (model) {
        if (model.original) model.original.dispose();
        if (model.modified) model.modified.dispose();
      }
      panel._plDiffEditor.dispose();
    } catch(e) {}
    panel._plDiffEditor = null;
  }
  if (panel._plOriginalModel) {
    try { panel._plOriginalModel.dispose(); } catch(e) {}
    panel._plOriginalModel = null;
  }
  if (panel._plModifiedModel) {
    try { panel._plModifiedModel.dispose(); } catch(e) {}
    panel._plModifiedModel = null;
  }
}

function renderPromptLab(container, panel) {
  var d = panel.rawData;
  if (!d) {
    container.innerHTML = '<div class="pl-empty">No prompt lab data. The AI Engineer will push this panel when a project has prompts.</div>';
    return;
  }

  // Preserve editor state across re-renders
  panel._plState = panel._plState || { diffMode: false, resultsCollapsed: false };
  var state = panel._plState;

  var prompts = d.prompts || [];
  var active = d.activePrompt || (prompts.length > 0 ? prompts[0].name : '');
  var status = d.status || 'idle';
  var testRuns = d.testRuns || [];
  var syncHistory = d.syncHistory || [];
  var pid = panel.panelId;

  var html = '<div class="prompt-lab">';

  // ── Toolbar ──
  html += '<div class="pl-toolbar">';
  html += '<select id="pl-select-' + esc(pid) + '" onchange="plSelectPrompt(\'' + esc(pid) + '\')">';
  for (var i = 0; i < prompts.length; i++) {
    var sel = prompts[i].name === active ? ' selected' : '';
    html += '<option value="' + esc(prompts[i].name) + '"' + sel + '>' + esc(prompts[i].filename) + ' (v' + esc(prompts[i].currentVersion) + ')</option>';
  }
  if (prompts.length === 0) html += '<option value="">No prompts found</option>';
  html += '</select>';

  html += '<span class="pl-status-badge ' + esc(status) + '">' + esc(status) + '</span>';
  html += '<span class="pl-toolbar-spacer"></span>';

  html += '<button class="pl-btn' + (state.diffMode ? ' active' : '') + '" onclick="plToggleDiff(\'' + esc(pid) + '\')" title="Toggle diff view">Diff</button>';
  html += '<button class="pl-btn primary" onclick="plRunTest(\'' + esc(pid) + '\')"' + (status !== 'idle' ? ' disabled' : '') + '>Run Test</button>';
  html += '<button class="pl-btn sync" onclick="plSyncToProject(\'' + esc(pid) + '\')"' + (status !== 'idle' ? ' disabled' : '') + '>Sync to Project</button>';
  html += '</div>';

  // ── Body: editor + sidebar ──
  html += '<div class="pl-body">';

  // Editor column
  html += '<div class="pl-editor-col">';
  html += '<div class="pl-editor-container" id="pl-editor-' + esc(pid) + '"></div>';
  html += '</div>';

  // Version sidebar
  html += '<div class="pl-sidebar" id="pl-sidebar-' + esc(pid) + '">';
  html += '</div>';

  html += '</div>'; // end pl-body

  // ── Results area ──
  html += '<div class="pl-results" id="pl-results-' + esc(pid) + '" style="' + (state.resultsCollapsed ? 'display:none' : '') + '">';
  html += '</div>';

  html += '</div>'; // end prompt-lab
  container.innerHTML = html;

  // Render sidebar
  plRenderVersionSidebar(
    document.getElementById('pl-sidebar-' + pid),
    prompts, active, syncHistory, pid
  );

  // Render results
  plRenderResults(document.getElementById('pl-results-' + pid), testRuns);

  // Initialize Monaco editor
  var editorContainer = document.getElementById('pl-editor-' + pid);
  if (!editorContainer) return;

  // Determine content to show
  var content = d.editedContent || d.originalContent || '';
  var originalContent = d.originalContent || '';
  panel._plOriginalContent = originalContent;
  panel._plEditedContent = content;

  if (state.diffMode) {
    plInitDiffEditor(panel, editorContainer, originalContent, content);
  } else {
    plInitEditor(panel, editorContainer, content);
  }
}

function plInitEditor(panel, container, content) {
  loadMonaco().then(function() {
    if (panel._plEditor || panel._plDiffEditor) return; // already initialized
    var editor = createMonacoEditor(container, {
      value: content,
      language: 'markdown',
      wordWrap: 'on',
      readOnly: false,
    });
    panel._plEditor = editor;

    // Track edits
    editor.onDidChangeModelContent(function() {
      panel._plEditedContent = editor.getValue();
    });

    // Keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function() {
      plRunTest(panel.panelId);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function() {
      // Save draft — prevent default, content is auto-tracked
    });
  });
}

function plInitDiffEditor(panel, container, original, modified) {
  loadMonaco().then(function() {
    if (panel._plEditor || panel._plDiffEditor) return;
    var originalModel = monaco.editor.createModel(original, 'markdown');
    var modifiedModel = monaco.editor.createModel(modified, 'markdown');
    panel._plOriginalModel = originalModel;
    panel._plModifiedModel = modifiedModel;

    var diffEditor = monaco.editor.createDiffEditor(container, {
      theme: currentMonacoTheme(),
      automaticLayout: true,
      readOnly: false,
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
    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    panel._plDiffEditor = diffEditor;

    // Track edits on modified side
    modifiedModel.onDidChangeContent(function() {
      panel._plEditedContent = modifiedModel.getValue();
    });
  });
}

function plSelectPrompt(panelId) {
  var p = openPanels[panelId];
  if (!p || !p.rawData) return;
  var sel = document.getElementById('pl-select-' + panelId);
  if (!sel) return;
  var promptName = sel.value;
  plLoadPrompt(panelId, promptName);
}

function plLoadPrompt(panelId, promptName) {
  var p = openPanels[panelId];
  if (!p || !p.rawData) return;
  var d = p.rawData;

  // Find the prompt in data
  var prompt = null;
  for (var i = 0; i < (d.prompts || []).length; i++) {
    if (d.prompts[i].name === promptName) { prompt = d.prompts[i]; break; }
  }
  if (!prompt) return;

  // Build the file path
  var promptsDir = d.promptsDir || 'prompts';
  var filePath = (d.projectDir ? d.projectDir + '/' : '') + promptsDir + '/' + prompt.filename;

  authFetch('/browse/file/text?path=' + encodeURIComponent(filePath))
    .then(function(res) { return res.ok ? res.text() : Promise.reject('File not found'); })
    .then(function(content) {
      p._plOriginalContent = content;
      p._plEditedContent = content;
      d.activePrompt = promptName;
      d.originalContent = content;
      d.editedContent = content;

      // Update editor
      if (p._plEditor) {
        p._plEditor.setValue(content);
      } else if (p._plDiffEditor) {
        // Re-render in diff mode with new content
        cleanupPromptLab(p);
        var container = document.getElementById('pl-editor-' + panelId);
        if (container) {
          container.innerHTML = '';
          plInitDiffEditor(p, container, content, content);
        }
      }

      // Re-render sidebar to update active state
      var sidebar = document.getElementById('pl-sidebar-' + panelId);
      if (sidebar) {
        plRenderVersionSidebar(sidebar, d.prompts || [], promptName, d.syncHistory || [], panelId);
      }
    })
    .catch(function(err) {
      console.warn('plLoadPrompt failed:', err);
    });
}

function plToggleDiff(panelId) {
  var p = openPanels[panelId];
  if (!p) return;
  p._plState = p._plState || { diffMode: false, resultsCollapsed: false };
  p._plState.diffMode = !p._plState.diffMode;

  // Capture current content before cleanup
  var editedContent = p._plEditedContent || '';
  var originalContent = p._plOriginalContent || '';
  cleanupPromptLab(p);

  var container = document.getElementById('pl-editor-' + panelId);
  if (!container) return;
  container.innerHTML = '';

  if (p._plState.diffMode) {
    plInitDiffEditor(p, container, originalContent, editedContent);
  } else {
    plInitEditor(p, container, editedContent);
  }

  // Update diff button active state
  var toolbar = container.closest('.prompt-lab');
  if (toolbar) {
    var btns = toolbar.querySelectorAll('.pl-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent === 'Diff') {
        btns[i].classList.toggle('active', p._plState.diffMode);
        break;
      }
    }
  }
}

function plRunTest(panelId) {
  var p = openPanels[panelId];
  if (!p || !p.rawData) return;
  var d = p.rawData;
  if (d.status !== 'idle') return;

  var promptName = d.activePrompt || '';
  var content = p._plEditedContent || '';
  if (!promptName || !content) return;

  var message = '[PROMPT-LAB] Run evaluation for prompt "' + promptName + '" with content:\n---\n' + content + '\n---';

  // Find active session
  var sessionId = activeSessionId;

  authFetch('/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message, sessionId: sessionId })
  }).then(function(res) {
    if (!res.ok) console.warn('plRunTest: chat/send failed');
  }).catch(function(err) {
    console.warn('plRunTest error:', err);
  });

  // Optimistic status update
  var badge = document.querySelector('#pl-select-' + panelId);
  if (badge) {
    var statusBadge = badge.parentNode.querySelector('.pl-status-badge');
    if (statusBadge) {
      statusBadge.className = 'pl-status-badge testing';
      statusBadge.textContent = 'testing';
    }
  }
}

function plSyncToProject(panelId) {
  var p = openPanels[panelId];
  if (!p || !p.rawData) return;
  var d = p.rawData;
  if (d.status !== 'idle') return;

  var promptName = d.activePrompt || '';
  var content = p._plEditedContent || '';
  if (!promptName || !content) return;

  var message = '[PROMPT-LAB] Sync prompt "' + promptName + '" to project. Edited content:\n---\n' + content + '\n---\nWrite to prompts/ with incremented version, update project-specs.md, and commit.';

  var sessionId = activeSessionId;

  authFetch('/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message, sessionId: sessionId })
  }).then(function(res) {
    if (!res.ok) console.warn('plSyncToProject: chat/send failed');
  }).catch(function(err) {
    console.warn('plSyncToProject error:', err);
  });

  // Optimistic status update
  var badge = document.querySelector('#pl-select-' + panelId);
  if (badge) {
    var statusBadge = badge.parentNode.querySelector('.pl-status-badge');
    if (statusBadge) {
      statusBadge.className = 'pl-status-badge syncing';
      statusBadge.textContent = 'syncing';
    }
  }
}

function plRenderResults(container, testRuns) {
  if (!container) return;
  if (!testRuns || testRuns.length === 0) {
    container.innerHTML = '<div class="pl-results-header"><span class="pl-results-title">Test Results</span></div>' +
      '<div style="font-size:11px;color:#6a6a88">No test runs yet. Edit a prompt and click "Run Test".</div>';
    return;
  }

  // Show latest run
  var run = testRuns[testRuns.length - 1];
  var html = '<div class="pl-results-header">';
  html += '<span class="pl-results-title">Test Results — ' + esc(run.promptName || '') + '</span>';
  html += '<span style="font-size:10px;color:#6a6a88">' + esc(run.timestamp || '') + '</span>';
  html += '</div>';

  // Status
  if (run.status === 'running') {
    html += '<div style="font-size:11px;color:#c8a84a">Evaluation running...</div>';
    container.innerHTML = html;
    return;
  }
  if (run.status === 'error') {
    html += '<div style="font-size:11px;color:#c84a4a">Error: ' + esc(run.error || 'Unknown error') + '</div>';
    container.innerHTML = html;
    return;
  }

  // Metrics cards
  var metrics = run.metrics || {};
  var metricKeys = Object.keys(metrics);
  if (metricKeys.length > 0) {
    html += '<div class="pl-metrics">';
    for (var i = 0; i < metricKeys.length; i++) {
      var key = metricKeys[i];
      var val = metrics[key];
      var valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
      html += '<div class="pl-metric-card">';
      html += '<div class="pl-metric-name">' + esc(key) + '</div>';
      html += '<div class="pl-metric-value">' + esc(valStr) + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  // Sample outputs
  var samples = run.sampleOutputs || [];
  if (samples.length > 0) {
    html += '<div class="pl-samples">';
    for (var j = 0; j < samples.length && j < 5; j++) {
      var s = samples[j];
      html += '<div class="pl-sample-card">';
      if (s.score != null) html += '<span class="pl-sample-score">' + s.score + '</span>';
      html += '<div class="pl-sample-label">Input</div>';
      html += '<div class="pl-sample-text">' + esc(s.input || '') + '</div>';
      html += '<div class="pl-sample-label" style="margin-top:4px">Output</div>';
      html += '<div class="pl-sample-text">' + esc(s.output || '') + '</div>';
      html += '</div>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

function plRenderVersionSidebar(container, prompts, activePrompt, syncHistory, panelId) {
  if (!container) return;
  var html = '<div class="pl-sidebar-title">Prompts</div>';

  for (var i = 0; i < prompts.length; i++) {
    var pr = prompts[i];
    var isActive = pr.name === activePrompt;
    html += '<div class="pl-prompt-item' + (isActive ? ' active' : '') + '" onclick="plLoadPrompt(\'' + esc(panelId) + '\', \'' + esc(pr.name) + '\')">';
    html += '<div class="pl-prompt-name">' + esc(pr.filename) + '</div>';
    html += '<div class="pl-prompt-meta">v' + esc(pr.currentVersion) + ' &middot; ' + esc(pr.model || '') + '</div>';
    html += '</div>';

    // Version list (expanded for active prompt)
    if (isActive && pr.versions && pr.versions.length > 0) {
      html += '<div class="pl-version-list">';
      for (var j = 0; j < pr.versions.length; j++) {
        var v = pr.versions[j];
        var isCurrent = v.version === pr.currentVersion;
        var scoreStr = '';
        if (v.evaluationScore) {
          var scoreKeys = Object.keys(v.evaluationScore);
          if (scoreKeys.length > 0) scoreStr = scoreKeys[0] + ': ' + v.evaluationScore[scoreKeys[0]];
        }
        html += '<div class="pl-version-item' + (isCurrent ? ' current' : '') + '">';
        html += '<span>v' + esc(v.version) + (isCurrent ? ' (current)' : '') + '</span>';
        html += '<span>' + esc(scoreStr) + '</span>';
        html += '</div>';
      }
      html += '</div>';
    }
  }

  // Sync history
  if (syncHistory.length > 0) {
    html += '<div class="pl-sync-history">';
    html += '<div class="pl-sidebar-title">Sync History</div>';
    for (var k = syncHistory.length - 1; k >= 0 && k >= syncHistory.length - 5; k--) {
      var sh = syncHistory[k];
      html += '<div class="pl-sync-entry">';
      html += esc(sh.promptName) + ' <span class="version">v' + esc(sh.fromVersion) + ' → v' + esc(sh.toVersion) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  if (prompts.length === 0) {
    html += '<div style="padding:12px;font-size:11px;color:#6a6a88">No prompts in project.</div>';
  }

  container.innerHTML = html;
}
