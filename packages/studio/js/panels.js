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

  if (p.panel === 'eval-dashboard') {
    cleanupEvalDashboard(p);
    renderEvalDashboard(document.getElementById('file-rendered-view'), p);
    return;
  }

  if (p.panel === 'model-card') {
    cleanupModelCard(p);
    renderModelCard(document.getElementById('file-rendered-view'), p);
    return;
  }

  if (p.panel === 'knowledge-map') {
    cleanupKnowledgeMap(p);
    renderKnowledgeMapPanel(document.getElementById('file-rendered-view'), p);
    return;
  }

  if (p.panel === 'guide') {
    cleanupGuide(p);
    renderGuidePanel(document.getElementById('file-rendered-view'), p);
    return;
  }

  if (p.panel === 'pr-review') {
    renderPRReviewPanel(document.getElementById('file-rendered-view'), p);
    return;
  }

  if (p.panel === 'notebook-walkthrough') {
    if (typeof cleanupNotebookWalkthrough === 'function') cleanupNotebookWalkthrough(p);
    if (typeof renderNotebookWalkthrough === 'function') {
      renderNotebookWalkthrough(document.getElementById('file-rendered-view'), p);
    }
    return;
  }

  if (p.panel === 'brainstorm') {
    cleanupBrainstorm(p);
    renderBrainstorm(document.getElementById('file-rendered-view'), p);
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
  } else if (p.panel === 'eval-dashboard') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderEvalDashboard(renderedView, p);
  } else if (p.panel === 'model-card') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderModelCard(renderedView, p);
  } else if (p.panel === 'chart') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderChartPanel(renderedView, p);
  } else if (p.panel === 'diagram' || p.panel === 'dag') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderDiagramPanel(renderedView, p);
  } else if (p.panel === 'knowledge-map') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderKnowledgeMapPanel(renderedView, p);
  } else if (p.panel === 'guide') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderGuidePanel(renderedView, p);
  } else if (p.panel === 'pr-review') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderPRReviewPanel(renderedView, p);
  } else if (p.panel === 'notebook-walkthrough') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    if (typeof renderNotebookWalkthrough === 'function') {
      renderNotebookWalkthrough(renderedView, p);
    } else {
      renderedView.innerHTML = '<div class="no-file-msg">notebook-walkthrough renderer not loaded.</div>';
    }
  } else if (p.panel === 'brainstorm') {
    tableView.classList.remove('visible');
    renderedView.classList.add('visible');
    renderBrainstorm(renderedView, p);
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

  // Detect AR (autonomous-research) mode vs. classic experiment mode.
  // AR uses `iterationBudget` in constraints and marks `mode: "autonomous-research"`.
  // Classic experiment mode uses `plannedCount`. The dashboard renders both, with
  // AR-specific enrichments (auto-decision colors, cost accounting, convergence).
  var isAR = d.mode === 'autonomous-research';
  var constraints = d.constraints || {};
  var cost = d.costAccounting || {};
  var convergence = d.convergence || {};
  var exps = d.experiments || [];

  // Preserve comparison state across re-renders
  panel._expState = panel._expState || { selectedRows: [] };

  var html = '<div class="experiment-dashboard' + (isAR ? ' ar-mode' : '') + '">';

  // ── Progress bar ──
  var total = isAR
    ? (constraints.iterationBudget || d.plannedCount || 0)
    : (d.plannedCount || 0);
  var done = exps.length;
  var status = d.status || 'setup';
  var current = d.currentExperiment || null;
  var label = isAR ? 'iterations' : 'experiments';

  html += '<div class="exp-progress">';
  html += '<div class="exp-progress-label">';
  html += '<span><span class="exp-status-badge ' + esc(status) + '">' + esc(status) + '</span></span>';
  if (isAR && d.preset) {
    html += '<span class="exp-preset-badge">' + esc(d.preset) + '</span>';
  }
  html += '<span>' + done + ' / ' + total + ' ' + label + '</span>';
  if (isAR && convergence.detected && convergence.reason) {
    html += '<span class="exp-converge-badge" title="Convergence">' + esc(convergence.reason) + '</span>';
  }
  html += '</div>';
  html += '<div class="exp-progress-bar">';
  if (isAR) {
    // AR: color-code each completed iteration by auto-decision
    for (var i = 1; i <= total; i++) {
      var cls = 'pending';
      if (i <= done) {
        var ent = exps[i - 1];
        if (ent && ent.autoDecision === 'green') cls = 'completed ar-green';
        else if (ent && ent.autoDecision === 'red') cls = 'completed ar-red';
        else if (ent && ent.autoDecision === 'yellow') cls = 'completed ar-yellow';
        else cls = 'completed';
      } else if (status === 'running' && current === i) {
        cls = 'active';
      }
      html += '<div class="exp-progress-segment ' + cls + '"></div>';
    }
  } else {
    for (var i = 1; i <= total; i++) {
      var cls = 'pending';
      if (i <= done) cls = 'completed';
      else if (status === 'running' && current === i) cls = 'active';
      html += '<div class="exp-progress-segment ' + cls + '"></div>';
    }
  }
  html += '</div></div>';

  // ── AR cost/convergence strip ──
  if (isAR) {
    var ceiling = constraints.costCeiling || {};
    var dollarsSpent = cost.dollarsSpent || 0;
    var tokensIn = cost.tokensIn || 0;
    var tokensOut = cost.tokensOut || 0;
    var reviewerTasks = cost.reviewerTasksSpawned || 0;
    var pctDollars = (ceiling.dollars && ceiling.dollars > 0)
      ? (dollarsSpent / ceiling.dollars * 100) : null;
    var pctTokens = (ceiling.tokens && ceiling.tokens > 0)
      ? ((tokensIn + tokensOut) / ceiling.tokens * 100) : null;
    var warnCls = '';
    if (pctDollars >= 80 || pctTokens >= 80) warnCls = ' ar-cost-warn';
    else if (pctDollars >= 50 || pctTokens >= 50) warnCls = ' ar-cost-caution';

    html += '<div class="ar-cost-strip' + warnCls + '">';
    html += '<span class="ar-cost-item"><strong>$' + dollarsSpent.toFixed(4) + '</strong>';
    if (ceiling.dollars) html += ' / $' + ceiling.dollars;
    html += '</span>';
    html += '<span class="ar-cost-item"><strong>' + (tokensIn + tokensOut) + '</strong> tokens';
    if (ceiling.tokens) html += ' / ' + ceiling.tokens;
    html += '</span>';
    html += '<span class="ar-cost-item"><strong>' + reviewerTasks + '</strong> reviewer tasks</span>';
    if (d.lastGreenCommit) {
      html += '<span class="ar-cost-item" title="lastGreenCommit">green @ '
        + esc(String(d.lastGreenCommit).slice(0, 7)) + '</span>';
    }
    html += '</div>';
  }

  // ── Charts ──
  var barId = 'exp-bar-' + panel.panelId;
  var lineId = 'exp-line-' + panel.panelId;
  html += '<div class="exp-charts">';
  html += '<div id="' + barId + '"></div>';
  html += '<div id="' + lineId + '"></div>';
  html += '</div>';

  // ── Comparison controls ──
  html += '<div class="exp-compare-bar">';
  html += '<button id="exp-compare-btn-' + panel.panelId + '" class="exp-compare-action-btn" data-panel-id="' + esc(panel.panelId) + '" disabled>Compare Selected</button>';
  html += '<span id="exp-compare-count-' + panel.panelId + '" class="exp-compare-hint">Select 2 rows to compare</span>';
  html += '</div>';
  html += '<div id="exp-compare-view-' + panel.panelId + '"></div>';

  // ── Results table ──
  html += '<div class="exp-results-table" id="exp-table-' + panel.panelId + '"></div>';

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.exp-compare-action-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { expCompare(btn.dataset.panelId); });
  });

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
        recommendation: e.recommendation || '',
        // AR-specific fields (undefined on classic experiment runs — columns hidden below)
        autoDecision: e.autoDecision || '',
        reverted: e.reverted === true ? 'yes' : (e.reverted === false ? 'no' : ''),
        evalType: e.evalType || '',
        hypothesisSource: e.hypothesisSource || '',
        reviewerVerdict: e.reviewerVerdict || ''
      };
    });

    var columns = [
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
      }
    ];

    if (isAR) {
      columns.push(
        { title: 'Auto', field: 'autoDecision', width: 80,
          formatter: function(cell) {
            var v = cell.getValue();
            if (!v) return '';
            return '<span class="ar-auto-badge ar-' + esc(v) + '">' + esc(v) + '</span>';
          }
        },
        { title: 'Kept?', field: 'reverted', width: 70,
          formatter: function(cell) {
            var v = cell.getValue();
            if (v === 'yes') return '<span class="ar-reverted">reverted</span>';
            if (v === 'no') return '<span class="ar-kept">kept</span>';
            return '';
          }
        },
        { title: 'Eval', field: 'evalType', width: 70 },
        { title: 'Source', field: 'hypothesisSource', width: 110 },
        { title: 'Reviewer', field: 'reviewerVerdict', width: 110,
          formatter: function(cell) {
            var v = cell.getValue();
            if (!v) return '';
            return '<span class="ar-reviewer-verdict ar-rv-' + esc(v.toLowerCase()) + '">' + esc(v) + '</span>';
          }
        }
      );
    } else {
      columns.push(
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
      );
    }

    var tblContainer = document.getElementById('exp-table-' + panel.panelId);
    var tbl = new Tabulator(tblContainer, {
      data: tableRows,
      layout: 'fitDataFill',
      height: '100%',
      selectableRows: 'highlight',
      columns: columns
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
// Eval Dashboard panel
// ═══════════════════════════════════════════════════════════════

function cleanupEvalDashboard(panel) {
  if (panel._evalTabulator) {
    try { panel._evalTabulator.destroy(); } catch(e) {}
    panel._evalTabulator = null;
  }
  if (panel._evalPromptTabulator) {
    try { panel._evalPromptTabulator.destroy(); } catch(e) {}
    panel._evalPromptTabulator = null;
  }
  if (panel._evalInfraTabulator) {
    try { panel._evalInfraTabulator.destroy(); } catch(e) {}
    panel._evalInfraTabulator = null;
  }
  var chartEl = document.getElementById('eval-chart-' + panel.panelId);
  if (typeof Plotly !== 'undefined' && chartEl) {
    try { Plotly.purge(chartEl); } catch(e) {}
  }
}

function renderEvalDashboard(container, panel) {
  var d = panel.rawData;
  if (!d) {
    container.innerHTML = '<div class="no-file-msg">No evaluation data provided.</div>';
    return;
  }

  var summary = d.summary || {};
  var dims = d.dimensions || [];
  var cost = d.cost || {};
  var variant = d.variant || 'ai-engineer';
  var status = d.status || 'running';

  var html = '<div class="eval-dashboard">';

  // ── Summary header ──
  var verdict = (summary.overallVerdict || 'PARTIAL').toLowerCase();
  html += '<div class="eval-summary-header">';
  html += '<span class="eval-verdict-badge ' + verdict + '">' + esc(summary.overallVerdict || 'PENDING') + '</span>';
  html += '<span class="eval-summary-stat"><strong>' + (summary.passed || 0) + '</strong> passed</span>';
  html += '<span class="eval-summary-stat"><strong>' + (summary.failed || 0) + '</strong> failed</span>';
  html += '<span class="eval-status-badge ' + esc(status) + '">' + esc(status) + '</span>';
  html += '</div>';

  // ── Dimensions table ──
  html += '<p class="eval-section-label">Evaluation Dimensions</p>';
  html += '<div class="eval-dimensions-table" id="eval-dims-' + panel.panelId + '"></div>';

  // ── Variant-specific sections ──
  if (variant === 'ai-engineer') {
    // Prompt comparison
    var prompts = d.prompts || [];
    if (prompts.length > 0) {
      html += '<p class="eval-section-label">Prompt Comparison</p>';
      html += '<div class="eval-prompt-compare" id="eval-prompts-' + panel.panelId + '"></div>';
    }

    // Safety cards
    var safety = d.safety || {};
    var safetyKeys = Object.keys(safety);
    if (safetyKeys.length > 0) {
      html += '<p class="eval-section-label">Safety</p>';
      html += '<div class="eval-safety-cards">';
      for (var si = 0; si < safetyKeys.length; si++) {
        var sk = safetyKeys[si];
        var sv = safety[sk];
        var rate = sv.passRate != null ? sv.passRate : 0;
        var rateStr = (rate * 100).toFixed(1) + '%';
        var rateCls = rate >= 0.95 ? 'high' : rate >= 0.8 ? 'medium' : 'low';
        html += '<div class="eval-safety-card">';
        html += '<div class="eval-safety-card-label">' + esc(sk.replace(/([A-Z])/g, ' $1').trim()) + '</div>';
        html += '<div class="eval-safety-card-value ' + rateCls + '">' + rateStr + '</div>';
        html += '<div class="eval-safety-card-count">' + (sv.total || 0) + ' tests</div>';
        html += '</div>';
      }
      html += '</div>';
    }
  } else if (variant === 'ml-engineer') {
    // Baseline vs Candidate chart
    var baseline = d.baseline;
    var bestCandidate = d.bestCandidate;
    if (baseline && bestCandidate) {
      html += '<p class="eval-section-label">Baseline vs Best Candidate</p>';
      html += '<div class="eval-charts"><div id="eval-chart-' + panel.panelId + '"></div></div>';
    }

    // Infrastructure readiness
    var infra = d.infrastructure || [];
    if (infra.length > 0) {
      html += '<p class="eval-section-label">Infrastructure Readiness</p>';
      html += '<div class="eval-infra-table" id="eval-infra-' + panel.panelId + '"></div>';
    }
  }

  // ── Cost cards ──
  if (cost.perRequest != null || cost.per1kTokens != null || cost.monthlyProjected != null) {
    html += '<p class="eval-section-label">Cost</p>';
    html += '<div class="eval-cost-cards">';
    if (cost.perRequest != null) {
      html += '<div class="eval-cost-card"><div class="eval-cost-card-label">Per Request</div>';
      html += '<div class="eval-cost-card-value">$' + cost.perRequest.toFixed(4) + '</div></div>';
    }
    if (cost.per1kTokens != null) {
      html += '<div class="eval-cost-card"><div class="eval-cost-card-label">Per 1k Tokens</div>';
      html += '<div class="eval-cost-card-value">$' + cost.per1kTokens.toFixed(4) + '</div></div>';
    }
    if (cost.monthlyProjected != null) {
      html += '<div class="eval-cost-card"><div class="eval-cost-card-label">Monthly Projection</div>';
      html += '<div class="eval-cost-card-value">$' + cost.monthlyProjected.toLocaleString() + '</div></div>';
    }
    if (cost.budget != null) {
      html += '<div class="eval-cost-card"><div class="eval-cost-card-label">Budget</div>';
      html += '<div class="eval-cost-card-value">$' + cost.budget.toLocaleString() + '</div></div>';
    }
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;

  // ── Render dimensions Tabulator ──
  if (typeof Tabulator !== 'undefined' && dims.length > 0) {
    var dimsEl = document.getElementById('eval-dims-' + panel.panelId);
    if (dimsEl) {
      panel._evalTabulator = new Tabulator(dimsEl, {
        data: dims,
        layout: 'fitDataFill',
        height: '100%',
        columns: [
          { title: 'Dimension', field: 'dimension', minWidth: 120 },
          { title: 'Metric', field: 'metric', minWidth: 100 },
          { title: 'Target', field: 'target', hozAlign: 'right', width: 90 },
          { title: 'Actual', field: 'actual', hozAlign: 'right', width: 90 },
          { title: 'Unit', field: 'unit', width: 80 },
          { title: 'Verdict', field: 'verdict', width: 80, hozAlign: 'center',
            formatter: function(cell) {
              var v = (cell.getValue() || '').toLowerCase();
              return '<span class="eval-cell-' + (v === 'pass' ? 'pass' : 'fail') + '">' + esc(v.toUpperCase()) + '</span>';
            }
          }
        ]
      });
    }
  }

  // ── AI Engineer: Prompt comparison Tabulator ──
  if (variant === 'ai-engineer' && typeof Tabulator !== 'undefined') {
    var prompts = d.prompts || [];
    var promptsEl = document.getElementById('eval-prompts-' + panel.panelId);
    if (promptsEl && prompts.length > 0) {
      // Build columns: fixed cols + one col per unique dimension
      var dimNames = [];
      for (var pi = 0; pi < prompts.length; pi++) {
        var pDims = prompts[pi].dimensions || [];
        for (var di = 0; di < pDims.length; di++) {
          if (dimNames.indexOf(pDims[di].dimension) === -1) dimNames.push(pDims[di].dimension);
        }
      }

      var promptRows = prompts.map(function(p) {
        var row = {
          name: p.name || '',
          version: p.version || '',
          model: p.model || '',
          costPerCall: p.costPerCall != null ? '$' + p.costPerCall.toFixed(4) : '',
          costPer1kTokens: p.costPer1kTokens != null ? '$' + p.costPer1kTokens.toFixed(4) : '',
          latencyP95: p.latencyP95ms != null ? p.latencyP95ms + 'ms' : ''
        };
        var pDims = p.dimensions || [];
        for (var di = 0; di < dimNames.length; di++) {
          var match = pDims.find(function(dd) { return dd.dimension === dimNames[di]; });
          if (match) {
            row['dim_' + di] = (match.actual != null ? match.actual : '') + ' ' + (match.verdict || '');
            row['dim_' + di + '_verdict'] = match.verdict || '';
          } else {
            row['dim_' + di] = '';
            row['dim_' + di + '_verdict'] = '';
          }
        }
        return row;
      });

      var promptCols = [
        { title: 'Prompt', field: 'name', minWidth: 120 },
        { title: 'Version', field: 'version', width: 70 },
        { title: 'Model', field: 'model', minWidth: 100 },
        { title: 'Cost/Call', field: 'costPerCall', hozAlign: 'right', width: 90 },
        { title: 'Cost/1k Tokens', field: 'costPer1kTokens', hozAlign: 'right', width: 110 },
        { title: 'Latency P95', field: 'latencyP95', hozAlign: 'right', width: 90 }
      ];
      for (var di = 0; di < dimNames.length; di++) {
        (function(idx, name) {
          promptCols.push({
            title: name, field: 'dim_' + idx, hozAlign: 'center', minWidth: 90,
            formatter: function(cell) {
              var row = cell.getRow().getData();
              var v = (row['dim_' + idx + '_verdict'] || '').toLowerCase();
              var cls = v === 'pass' ? 'eval-cell-pass' : v === 'fail' ? 'eval-cell-fail' : '';
              return '<span class="' + cls + '">' + esc(cell.getValue()) + '</span>';
            }
          });
        })(di, dimNames[di]);
      }

      panel._evalPromptTabulator = new Tabulator(promptsEl, {
        data: promptRows,
        layout: 'fitDataFill',
        height: '100%',
        columns: promptCols
      });
    }
  }

  // ── ML Engineer: Baseline vs Candidate Plotly chart ──
  if (variant === 'ml-engineer' && typeof Plotly !== 'undefined') {
    var baseline = d.baseline;
    var bestCandidate = d.bestCandidate;
    var chartEl = document.getElementById('eval-chart-' + panel.panelId);
    if (baseline && bestCandidate && chartEl) {
      var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
      var fontColor = isDark ? '#b0b0c8' : '#333';
      var gridColor = isDark ? '#1e1e32' : '#e0e0e0';

      var bMetrics = baseline.metrics || {};
      var cMetrics = bestCandidate.metrics || {};
      var metricKeys = Object.keys(cMetrics);

      Plotly.newPlot(chartEl, [
        {
          x: metricKeys, y: metricKeys.map(function(k) { return bMetrics[k] || 0; }),
          type: 'bar', name: baseline.model || 'Baseline',
          marker: { color: '#6a6a88' }
        },
        {
          x: metricKeys, y: metricKeys.map(function(k) { return cMetrics[k] || 0; }),
          type: 'bar', name: bestCandidate.model || 'Best Candidate',
          marker: { color: '#4a9' }
        }
      ], {
        barmode: 'group',
        title: { text: baseline.model + ' vs ' + bestCandidate.model, font: { size: 13, color: fontColor } },
        paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: fontColor }, margin: { t: 36, r: 16, b: 40, l: 50 },
        xaxis: { gridcolor: gridColor }, yaxis: { gridcolor: gridColor },
        legend: { orientation: 'h', y: -0.15 }
      }, { responsive: true, displayModeBar: false });
    }
  }

  // ── ML Engineer: Infrastructure Tabulator ──
  if (variant === 'ml-engineer' && typeof Tabulator !== 'undefined') {
    var infra = d.infrastructure || [];
    var infraEl = document.getElementById('eval-infra-' + panel.panelId);
    if (infraEl && infra.length > 0) {
      panel._evalInfraTabulator = new Tabulator(infraEl, {
        data: infra,
        layout: 'fitDataFill',
        height: '100%',
        columns: [
          { title: 'Dimension', field: 'dimension', minWidth: 120 },
          { title: 'Actual', field: 'actual', hozAlign: 'right', width: 100 },
          { title: 'Budget', field: 'budget', hozAlign: 'right', width: 100 },
          { title: 'Verdict', field: 'verdict', width: 80, hozAlign: 'center',
            formatter: function(cell) {
              var v = (cell.getValue() || '').toLowerCase();
              return '<span class="eval-cell-' + (v === 'pass' ? 'pass' : 'fail') + '">' + esc(v.toUpperCase()) + '</span>';
            }
          }
        ]
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Model Card panel
// ═══════════════════════════════════════════════════════════════

function cleanupModelCard(panel) {
  if (panel._mcMetricsTabulator) {
    try { panel._mcMetricsTabulator.destroy(); } catch(e) {}
    panel._mcMetricsTabulator = null;
  }
  if (panel._mcQuantTabulator) {
    try { panel._mcQuantTabulator.destroy(); } catch(e) {}
    panel._mcQuantTabulator = null;
  }
}

function renderModelCard(container, panel) {
  var d = panel.rawData;
  if (!d) {
    container.innerHTML = '<div class="no-file-msg">No model card data provided.</div>';
    return;
  }

  var md = d.modelDetails || {};
  var iu = d.intendedUse || {};
  var fac = d.factors || {};
  var met = d.metrics || {};
  var evData = d.evaluationData || {};
  var trData = d.trainingData || {};
  var qa = d.quantitativeAnalyses || {};
  var eth = d.ethicalConsiderations || {};
  var cav = d.caveatsAndRecommendations || {};
  var evalSum = d.evalSummary || {};

  var html = '<div class="model-card-panel">';

  // ── Header ──
  html += '<div class="model-card-header">';
  html += '<h2 class="model-card-title">' + esc(md.name || d.projectName || 'Untitled Model') + '</h2>';
  html += '<div class="model-card-meta">';
  if (md.version) html += '<span class="model-card-version-badge">' + esc(md.version) + '</span>';
  if (md.type) html += '<span class="model-card-meta-item"><strong>Type:</strong> ' + esc(md.type) + '</span>';
  if (md.date) html += '<span class="model-card-meta-item"><strong>Date:</strong> ' + esc(md.date) + '</span>';
  if (md.owner) html += '<span class="model-card-meta-item"><strong>Owner:</strong> ' + esc(md.owner) + '</span>';
  if (md.framework) html += '<span class="model-card-meta-item"><strong>Framework:</strong> ' + esc(md.framework) + '</span>';
  html += '</div></div>';

  // ── Sections ──

  // 1. Model Details
  html += mcSection('Model Details', false, function() {
    var body = '';
    if (md.license) body += '<p><strong>License:</strong> ' + esc(md.license) + '</p>';
    var refs = md.references || [];
    if (refs.length > 0) {
      body += '<p><strong>References:</strong></p><ul>';
      for (var i = 0; i < refs.length; i++) body += '<li>' + esc(refs[i]) + '</li>';
      body += '</ul>';
    }
    return body || '<p>No additional details.</p>';
  });

  // 2. Intended Use
  html += mcSection('Intended Use', false, function() {
    var body = '';
    if (iu.primaryUse) body += '<p><strong>Primary use:</strong> ' + esc(iu.primaryUse) + '</p>';
    if (iu.primaryUsers) body += '<p><strong>Primary users:</strong> ' + esc(iu.primaryUsers) + '</p>';
    var oos = iu.outOfScopeUses || [];
    if (oos.length > 0) {
      body += '<p><strong>Out-of-scope uses:</strong></p><ul>';
      for (var i = 0; i < oos.length; i++) body += '<li>' + esc(oos[i]) + '</li>';
      body += '</ul>';
    }
    return body || '<p>Not specified.</p>';
  });

  // 3. Factors
  html += mcSection('Factors', false, function() {
    var body = '';
    var rf = fac.relevantFactors || [];
    var ef = fac.evaluationFactors || [];
    if (rf.length > 0) {
      body += '<p><strong>Relevant factors:</strong></p><ul>';
      for (var i = 0; i < rf.length; i++) body += '<li>' + esc(rf[i]) + '</li>';
      body += '</ul>';
    }
    if (ef.length > 0) {
      body += '<p><strong>Evaluation factors:</strong></p><ul>';
      for (var i = 0; i < ef.length; i++) body += '<li>' + esc(ef[i]) + '</li>';
      body += '</ul>';
    }
    return body || '<p>Not specified.</p>';
  });

  // 4. Metrics (rendered as inline table + optional Tabulator)
  html += mcSection('Metrics', false, function() {
    var body = '';
    var pm = met.performanceMeasures || [];
    if (pm.length > 0) {
      body += '<table class="model-card-table"><tr><th>Measure</th><th>Value</th><th>Description</th><th>Rationale</th></tr>';
      for (var i = 0; i < pm.length; i++) {
        body += '<tr><td>' + esc(pm[i].name || '') + '</td><td>' + esc(String(pm[i].value || '')) + '</td>';
        body += '<td>' + esc(pm[i].description || '') + '</td><td>' + esc(pm[i].rationale || '') + '</td></tr>';
      }
      body += '</table>';
    }
    var dt = met.decisionThresholds || [];
    if (dt.length > 0) {
      body += '<p><strong>Decision Thresholds:</strong></p>';
      body += '<table class="model-card-table"><tr><th>Threshold</th><th>Value</th><th>Rationale</th></tr>';
      for (var i = 0; i < dt.length; i++) {
        body += '<tr><td>' + esc(dt[i].name || '') + '</td><td>' + esc(String(dt[i].threshold || '')) + '</td>';
        body += '<td>' + esc(dt[i].rationale || '') + '</td></tr>';
      }
      body += '</table>';
    }
    return body || '<p>No metrics defined.</p>';
  });

  // 5. Evaluation Data
  html += mcSection('Evaluation Data', false, function() {
    return mcDataSection(evData);
  });

  // 6. Training Data
  html += mcSection('Training Data', false, function() {
    return mcDataSection(trData);
  });

  // 7. Quantitative Analyses
  html += mcSection('Quantitative Analyses', false, function() {
    var body = '';
    var ur = qa.unitaryResults || [];
    if (ur.length > 0) {
      body += '<p><strong>Unitary Results:</strong></p>';
      body += '<table class="model-card-table"><tr><th>Metric</th><th>Value</th><th>Subset</th></tr>';
      for (var i = 0; i < ur.length; i++) {
        body += '<tr><td>' + esc(ur[i].metric || '') + '</td><td>' + esc(String(ur[i].value || '')) + '</td>';
        body += '<td>' + esc(ur[i].subset || '') + '</td></tr>';
      }
      body += '</table>';
    }
    var ir = qa.intersectionalResults || [];
    if (ir.length > 0) {
      body += '<p><strong>Intersectional Results:</strong></p>';
      body += '<table class="model-card-table"><tr><th>Metric</th><th>Value</th><th>Factors</th></tr>';
      for (var i = 0; i < ir.length; i++) {
        body += '<tr><td>' + esc(ir[i].metric || '') + '</td><td>' + esc(String(ir[i].value || '')) + '</td>';
        body += '<td>' + esc((ir[i].factors || []).join(', ')) + '</td></tr>';
      }
      body += '</table>';
    }
    return body || '<p>No quantitative analyses available.</p>';
  });

  // 8. Ethical Considerations (highlighted)
  html += mcSection('Ethical Considerations', true, function() {
    var body = '';
    var risks = eth.risks || [];
    if (risks.length > 0) {
      body += '<p><strong>Risks:</strong></p><ul>';
      for (var i = 0; i < risks.length; i++) body += '<li>' + esc(risks[i]) + '</li>';
      body += '</ul>';
    }
    var mits = eth.mitigations || [];
    if (mits.length > 0) {
      body += '<p><strong>Mitigations:</strong></p><ul>';
      for (var i = 0; i < mits.length; i++) body += '<li>' + esc(mits[i]) + '</li>';
      body += '</ul>';
    }
    if (eth.academicReview) {
      body += '<p><strong>Academic Review:</strong></p><p>' + esc(eth.academicReview) + '</p>';
    }
    return body || '<p>No ethical considerations documented.</p>';
  });

  // 9. Caveats and Recommendations
  html += mcSection('Caveats and Recommendations', false, function() {
    var body = '';
    var cavs = cav.caveats || [];
    if (cavs.length > 0) {
      body += '<p><strong>Caveats:</strong></p><ul>';
      for (var i = 0; i < cavs.length; i++) body += '<li>' + esc(cavs[i]) + '</li>';
      body += '</ul>';
    }
    var recs = cav.recommendations || [];
    if (recs.length > 0) {
      body += '<p><strong>Recommendations:</strong></p><ul>';
      for (var i = 0; i < recs.length; i++) body += '<li>' + esc(recs[i]) + '</li>';
      body += '</ul>';
    }
    return body || '<p>No caveats or recommendations.</p>';
  });

  // ── Eval Summary footer ──
  var evalDims = evalSum.dimensions || [];
  if (evalSum.overallVerdict || evalDims.length > 0) {
    html += '<div class="model-card-eval-footer">';
    html += '<p class="eval-section-label">Evaluation Summary</p>';
    if (evalSum.overallVerdict) {
      var v = evalSum.overallVerdict.toLowerCase();
      html += '<span class="eval-verdict-badge ' + v + '">' + esc(evalSum.overallVerdict) + '</span>';
    }
    if (evalDims.length > 0) {
      html += '<div class="model-card-eval-dims">';
      for (var i = 0; i < evalDims.length; i++) {
        var ev = evalDims[i];
        var cls = (ev.verdict || '').toLowerCase() === 'pass' ? 'pass' : 'fail';
        html += '<span class="model-card-eval-dim ' + cls + '">' + esc(ev.dimension) + ': ' + esc(ev.verdict || '') + '</span>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // ── Export button ──
  html += '<button class="model-card-export-btn" data-panel-id="' + esc(panel.panelId) + '">Export as Markdown</button>';

  html += '</div>';
  container.innerHTML = html;

  container.querySelectorAll('.model-card-export-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { mcExportMarkdown(btn.dataset.panelId); });
  });
}

// Model card section builder
function mcSection(title, isEthical, contentFn) {
  var cls = 'model-card-section' + (isEthical ? ' ethical' : '');
  return '<details class="' + cls + '" open>' +
    '<summary>' + esc(title) + '</summary>' +
    '<div class="model-card-section-body">' + contentFn() + '</div>' +
    '</details>';
}

// Dataset info helper
function mcDataSection(data) {
  var body = '';
  var ds = data.datasets;
  if (ds) {
    var arr = Array.isArray(ds) ? ds : [ds];
    body += '<p><strong>Datasets:</strong> ' + arr.map(function(d) { return esc(d); }).join(', ') + '</p>';
  }
  if (data.size) body += '<p><strong>Size:</strong> ' + esc(String(data.size)) + '</p>';
  if (data.preprocessing) body += '<p><strong>Preprocessing:</strong> ' + esc(data.preprocessing) + '</p>';
  if (data.motivation) body += '<p><strong>Motivation:</strong> ' + esc(data.motivation) + '</p>';
  return body || '<p>Not specified.</p>';
}

// Export model card as markdown
function mcExportMarkdown(panelId) {
  var p = openPanels[panelId];
  if (!p || !p.rawData) return;
  var md = modelCardToMarkdown(p.rawData);
  var blob = new Blob([md], { type: 'text/markdown' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (p.rawData.projectName || 'model-card') + '-model-card.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function modelCardToMarkdown(d) {
  var md = d.modelDetails || {};
  var iu = d.intendedUse || {};
  var fac = d.factors || {};
  var met = d.metrics || {};
  var evData = d.evaluationData || {};
  var trData = d.trainingData || {};
  var qa = d.quantitativeAnalyses || {};
  var eth = d.ethicalConsiderations || {};
  var cav = d.caveatsAndRecommendations || {};
  var evalSum = d.evalSummary || {};
  var cost = evalSum.cost || {};

  var lines = [];
  lines.push('# Model Card: ' + (md.name || d.projectName || 'Untitled'));
  lines.push('');
  lines.push('- **Version:** ' + (md.version || 'N/A'));
  lines.push('- **Type:** ' + (md.type || 'N/A'));
  lines.push('- **Owner:** ' + (md.owner || 'N/A'));
  lines.push('- **Date:** ' + (md.date || 'N/A'));
  lines.push('- **Framework:** ' + (md.framework || 'N/A'));
  lines.push('');
  lines.push('---');
  lines.push('');

  // Model Details
  lines.push('## Model Details');
  lines.push('');
  if (md.license) lines.push('**License:** ' + md.license);
  var refs = md.references || [];
  if (refs.length > 0) {
    lines.push('');
    lines.push('**References:**');
    for (var i = 0; i < refs.length; i++) lines.push('- ' + refs[i]);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Intended Use
  lines.push('## Intended Use');
  lines.push('');
  if (iu.primaryUse) lines.push('- **Primary use:** ' + iu.primaryUse);
  if (iu.primaryUsers) lines.push('- **Primary users:** ' + iu.primaryUsers);
  var oos = iu.outOfScopeUses || [];
  if (oos.length > 0) {
    lines.push('- **Out-of-scope uses:**');
    for (var i = 0; i < oos.length; i++) lines.push('  - ' + oos[i]);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Factors
  lines.push('## Factors');
  lines.push('');
  var rf = fac.relevantFactors || [];
  if (rf.length > 0) {
    lines.push('- **Relevant factors:** ' + rf.join(', '));
  }
  var ef = fac.evaluationFactors || [];
  if (ef.length > 0) {
    lines.push('- **Evaluation factors:** ' + ef.join(', '));
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Metrics
  lines.push('## Metrics');
  lines.push('');
  var pm = met.performanceMeasures || [];
  if (pm.length > 0) {
    lines.push('| Measure | Value | Description | Rationale |');
    lines.push('|---------|-------|-------------|-----------|');
    for (var i = 0; i < pm.length; i++) {
      lines.push('| ' + (pm[i].name || '') + ' | ' + (pm[i].value || '') + ' | ' + (pm[i].description || '') + ' | ' + (pm[i].rationale || '') + ' |');
    }
  }
  var dt = met.decisionThresholds || [];
  if (dt.length > 0) {
    lines.push('');
    lines.push('### Decision Thresholds');
    lines.push('');
    lines.push('| Threshold | Value | Rationale |');
    lines.push('|-----------|-------|-----------|');
    for (var i = 0; i < dt.length; i++) {
      lines.push('| ' + (dt[i].name || '') + ' | ' + (dt[i].threshold || '') + ' | ' + (dt[i].rationale || '') + ' |');
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Evaluation Data
  lines.push('## Evaluation Data');
  lines.push('');
  lines.push(mdDataSection(evData));
  lines.push('---');
  lines.push('');

  // Training Data
  lines.push('## Training Data');
  lines.push('');
  lines.push(mdDataSection(trData));
  lines.push('---');
  lines.push('');

  // Quantitative Analyses
  lines.push('## Quantitative Analyses');
  lines.push('');
  var ur = qa.unitaryResults || [];
  if (ur.length > 0) {
    lines.push('### Unitary Results');
    lines.push('');
    lines.push('| Metric | Value | Subset |');
    lines.push('|--------|-------|--------|');
    for (var i = 0; i < ur.length; i++) {
      lines.push('| ' + (ur[i].metric || '') + ' | ' + (ur[i].value || '') + ' | ' + (ur[i].subset || '') + ' |');
    }
    lines.push('');
  }
  var ir = qa.intersectionalResults || [];
  if (ir.length > 0) {
    lines.push('### Intersectional Results');
    lines.push('');
    lines.push('| Metric | Value | Factors |');
    lines.push('|--------|-------|---------|');
    for (var i = 0; i < ir.length; i++) {
      lines.push('| ' + (ir[i].metric || '') + ' | ' + (ir[i].value || '') + ' | ' + (ir[i].factors || []).join(', ') + ' |');
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Ethical Considerations
  lines.push('## Ethical Considerations');
  lines.push('');
  var risks = eth.risks || [];
  if (risks.length > 0) {
    lines.push('**Risks:**');
    for (var i = 0; i < risks.length; i++) lines.push('- ' + risks[i]);
    lines.push('');
  }
  var mits = eth.mitigations || [];
  if (mits.length > 0) {
    lines.push('**Mitigations:**');
    for (var i = 0; i < mits.length; i++) lines.push('- ' + mits[i]);
    lines.push('');
  }
  if (eth.academicReview) {
    lines.push('**Academic Review:**');
    lines.push('');
    lines.push(eth.academicReview);
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Caveats and Recommendations
  lines.push('## Caveats and Recommendations');
  lines.push('');
  var cavs = cav.caveats || [];
  if (cavs.length > 0) {
    lines.push('**Caveats:**');
    for (var i = 0; i < cavs.length; i++) lines.push('- ' + cavs[i]);
    lines.push('');
  }
  var recs = cav.recommendations || [];
  if (recs.length > 0) {
    lines.push('**Recommendations:**');
    for (var i = 0; i < recs.length; i++) lines.push('- ' + recs[i]);
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Eval Summary
  var evalDims = evalSum.dimensions || [];
  if (evalSum.overallVerdict || evalDims.length > 0) {
    lines.push('## Evaluation Summary');
    lines.push('');
    if (evalSum.overallVerdict) lines.push('- **Overall verdict:** ' + evalSum.overallVerdict);
    lines.push('');
    if (evalDims.length > 0) {
      lines.push('| Dimension | Metric | Target | Actual | Verdict |');
      lines.push('|-----------|--------|--------|--------|---------|');
      for (var i = 0; i < evalDims.length; i++) {
        var ev = evalDims[i];
        lines.push('| ' + (ev.dimension || '') + ' | ' + (ev.metric || '') + ' | ' + (ev.target || '') + ' | ' + (ev.actual || '') + ' | ' + (ev.verdict || '') + ' |');
      }
      lines.push('');
    }
    if (cost.perRequest != null || cost.per1kTokens != null || cost.monthlyProjected != null) {
      lines.push('### Cost Profile');
      lines.push('');
      if (cost.perRequest != null) lines.push('- **Per request:** $' + cost.perRequest.toFixed(4));
      if (cost.per1kTokens != null) lines.push('- **Per 1k tokens:** $' + cost.per1kTokens.toFixed(4));
      if (cost.monthlyProjected != null) lines.push('- **Monthly projection:** $' + cost.monthlyProjected);
      if (cost.budget != null) lines.push('- **Budget:** $' + cost.budget);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function mdDataSection(data) {
  var lines = [];
  var ds = data.datasets;
  if (ds) {
    var arr = Array.isArray(ds) ? ds : [ds];
    lines.push('- **Datasets:** ' + arr.join(', '));
  }
  if (data.size) lines.push('- **Size:** ' + data.size);
  if (data.preprocessing) lines.push('- **Preprocessing:** ' + data.preprocessing);
  if (data.motivation) lines.push('- **Motivation:** ' + data.motivation);
  lines.push('');
  return lines.join('\n');
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
  html += '<select id="pl-select-' + esc(pid) + '" class="pl-select-prompt" data-panel-id="' + esc(pid) + '">';
  for (var i = 0; i < prompts.length; i++) {
    var sel = prompts[i].name === active ? ' selected' : '';
    html += '<option value="' + esc(prompts[i].name) + '"' + sel + '>' + esc(prompts[i].filename) + ' (v' + esc(prompts[i].currentVersion) + ')</option>';
  }
  if (prompts.length === 0) html += '<option value="">No prompts found</option>';
  html += '</select>';

  html += '<span class="pl-status-badge ' + esc(status) + '">' + esc(status) + '</span>';
  html += '<span class="pl-toolbar-spacer"></span>';

  html += '<button class="pl-btn pl-action-diff' + (state.diffMode ? ' active' : '') + '" data-panel-id="' + esc(pid) + '" title="Toggle diff view">Diff</button>';
  html += '<button class="pl-btn primary pl-action-run" data-panel-id="' + esc(pid) + '"' + (status !== 'idle' ? ' disabled' : '') + '>Run Test</button>';
  html += '<button class="pl-btn sync pl-action-sync" data-panel-id="' + esc(pid) + '"' + (status !== 'idle' ? ' disabled' : '') + '>Sync to Project</button>';
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

  container.querySelectorAll('.pl-select-prompt').forEach(function(el) {
    el.addEventListener('change', function() { plSelectPrompt(el.dataset.panelId); });
  });
  container.querySelectorAll('.pl-action-diff').forEach(function(btn) {
    btn.addEventListener('click', function() { plToggleDiff(btn.dataset.panelId); });
  });
  container.querySelectorAll('.pl-action-run').forEach(function(btn) {
    btn.addEventListener('click', function() { plRunTest(btn.dataset.panelId); });
  });
  container.querySelectorAll('.pl-action-sync').forEach(function(btn) {
    btn.addEventListener('click', function() { plSyncToProject(btn.dataset.panelId); });
  });

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
    html += '<div class="pl-prompt-item pl-load-prompt' + (isActive ? ' active' : '') + '" data-panel-id="' + esc(panelId) + '" data-prompt-name="' + esc(pr.name) + '">';
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

  container.querySelectorAll('.pl-load-prompt').forEach(function(el) {
    el.addEventListener('click', function() { plLoadPrompt(el.dataset.panelId, el.dataset.promptName); });
  });
}

// ─── PR Review Panel ──────────────────────────────────────────────────────────

function renderPRReviewPanel(container, panel) {
  var data = panel.rawData;

  // Ensure addressed map exists on panel object (persists across re-renders)
  if (!panel._addressedMap) panel._addressedMap = {};

  if (!data) {
    container.innerHTML = '<div class="pr-review"><div class="pr-empty"><h3>Loading PR comments...</h3><p>Fetching from GitHub.</p></div></div>';
    return;
  }

  if (data.ghMissing) {
    container.innerHTML =
      '<div class="pr-review"><div class="pr-gh-missing">' +
      '<h3>GitHub CLI not installed</h3>' +
      '<p>Install it with <code>brew install gh</code> and authenticate with <code>gh auth login</code>.</p>' +
      '</div></div>';
    return;
  }

  if (data.error) {
    container.innerHTML =
      '<div class="pr-review"><div class="pr-empty"><h3>Could not load PR</h3><p>' + esc(data.error) + '</p></div></div>';
    return;
  }

  var threads = data.threads || [];
  var generalComments = data.generalComments || [];
  var reviews = data.reviews || [];

  // Count addressed
  var addressedCount = Object.values(panel._addressedMap).filter(Boolean).length;
  var totalThreads = threads.length;
  var pct = totalThreads > 0 ? Math.round((addressedCount / totalThreads) * 100) : 0;

  // Determine review decision display
  var prInfo = panel._prInfo || {};
  var reviewDecision = prInfo.reviewDecision || '';
  var decisionClass = reviewDecision === 'APPROVED' ? 'approved' :
                      reviewDecision === 'CHANGES_REQUESTED' ? 'changes' :
                      reviewDecision === 'REVIEW_REQUIRED' ? 'review-required' : 'pending';
  var decisionLabel = reviewDecision === 'APPROVED' ? 'Approved' :
                      reviewDecision === 'CHANGES_REQUESTED' ? 'Changes Requested' :
                      reviewDecision === 'REVIEW_REQUIRED' ? 'Review Required' : 'Pending';

  var html = '<div class="pr-review">';

  // Header
  html += '<div class="pr-header">';
  html += '<div class="pr-header-title">';
  if (prInfo.url) {
    html += '<a href="' + esc(prInfo.url) + '" target="_blank" rel="noopener">PR #' + esc(String(data.pr || '')) + '</a>';
    if (prInfo.title) html += ' &mdash; ' + esc(prInfo.title);
  } else {
    html += 'PR #' + esc(String(data.pr || ''));
  }
  html += '</div>';
  html += '<div class="pr-header-meta">';
  if (reviewDecision) {
    html += '<span class="pr-review-badge ' + decisionClass + '">' + esc(decisionLabel) + '</span>';
  }
  html += '<button class="pr-btn pr-refresh-btn" data-panel-id="' + esc(panel.panelId) + '">Refresh</button>';
  html += '</div>';
  html += '</div>';

  // Progress bar
  if (totalThreads > 0) {
    html += '<div class="pr-progress-bar">';
    html += '<span class="pr-progress-label">' + addressedCount + ' / ' + totalThreads + ' addressed</span>';
    html += '<div class="pr-progress-track"><div class="pr-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '</div>';
  }

  html += '<div class="pr-content" id="pr-content-' + esc(panel.panelId) + '">';

  // Review summaries (non-COMMENTED reviews with a body)
  var summaryReviews = reviews.filter(function(r) { return r.body && r.body.trim(); });
  if (summaryReviews.length > 0) {
    html += '<div class="pr-section-header">Reviews</div>';
    for (var ri = 0; ri < summaryReviews.length; ri++) {
      var rv = summaryReviews[ri];
      var rvClass = rv.state === 'APPROVED' ? 'approved' : rv.state === 'CHANGES_REQUESTED' ? 'changes' : 'pending';
      html += '<div class="pr-review-card">';
      html += '<div class="pr-review-card-header">';
      html += '<span class="pr-review-badge ' + rvClass + '">' + esc(rv.state.replace(/_/g, ' ')) + '</span>';
      html += '<span class="pr-review-card-author">' + esc(rv.author) + '</span>';
      html += '<span class="pr-review-card-date">' + esc(formatPRDate(rv.submittedAt)) + '</span>';
      html += '</div>';
      if (rv.body) html += '<div class="pr-review-card-body">' + renderPRMarkdown(rv.body) + '</div>';
      html += '</div>';
    }
  }

  // Inline review threads
  if (threads.length > 0) {
    html += '<div class="pr-section-header">Review Threads (' + threads.length + ')</div>';
    for (var ti = 0; ti < threads.length; ti++) {
      var thread = threads[ti];
      var isAddressed = !!panel._addressedMap[thread.threadId];
      var isCollapsed = panel._collapsedMap && panel._collapsedMap[thread.threadId];
      var threadClass = 'pr-thread-card' + (isAddressed ? ' addressed' : '') + (isCollapsed ? ' collapsed' : '');
      html += '<div class="' + threadClass + '" id="pr-thread-' + esc(thread.threadId) + '" data-thread-id="' + esc(thread.threadId) + '">';

      // Thread header (file + line, clickable to open file)
      html += '<div class="pr-thread-header pr-toggle-thread" data-panel-id="' + esc(panel.panelId) + '" data-thread-id="' + esc(thread.threadId) + '">';
      html += '<span class="pr-thread-file pr-open-file" title="Open file at line ' + thread.line + '" data-file="' + esc(thread.file) + '" data-line="' + esc(String(thread.line || '')) + '">' + esc(thread.file) + '</span>';
      if (thread.line) html += '<span class="pr-thread-line">:' + thread.line + '</span>';
      html += '<span class="pr-thread-count">' + thread.comments.length + ' comment' + (thread.comments.length !== 1 ? 's' : '') + '</span>';
      html += '<div class="pr-addressed-toggle pr-stop-propagation">';
      html += '<input type="checkbox" class="pr-addressed-checkbox" id="pr-addr-' + esc(thread.threadId) + '" ' + (isAddressed ? 'checked' : '') +
              ' data-panel-id="' + esc(panel.panelId) + '" data-thread-id="' + esc(thread.threadId) + '">';
      html += '<label class="pr-addressed-label" for="pr-addr-' + esc(thread.threadId) + '">Done</label>';
      html += '</div>';
      html += '<span class="pr-thread-collapse-icon">&#9660;</span>';
      html += '</div>';

      // Thread body
      html += '<div class="pr-thread-body">';

      // Diff hunk
      if (thread.diffHunk) {
        html += '<div class="pr-diff-hunk">';
        var hunkLines = thread.diffHunk.split('\n');
        for (var hl = 0; hl < hunkLines.length; hl++) {
          var ln = hunkLines[hl];
          var lnClass = ln.startsWith('+') ? 'add' : ln.startsWith('-') ? 'del' : ln.startsWith('@') ? 'meta' : 'ctx';
          html += '<span class="pr-diff-hunk-line ' + lnClass + '">' + esc(ln) + '</span>';
        }
        html += '</div>';
      }

      // Comments
      html += '<div class="pr-comment-list">';
      for (var ci = 0; ci < thread.comments.length; ci++) {
        var comment = thread.comments[ci];
        html += '<div class="pr-comment' + (comment.isReply ? ' reply' : '') + '">';
        html += '<div class="pr-comment-header">';
        html += '<span class="pr-comment-author">' + esc(comment.author) + '</span>';
        html += '<span class="pr-comment-date">' + esc(formatPRDate(comment.createdAt)) + '</span>';
        html += '</div>';
        html += '<div class="pr-comment-body">' + renderPRMarkdown(comment.body) + '</div>';
        html += '</div>';
      }
      html += '</div>';

      html += '</div>'; // thread body
      html += '</div>'; // thread card
    }
  } else {
    html += '<div class="pr-empty"><h3>No review threads</h3><p>No inline code review comments found on this PR.</p></div>';
  }

  // General comments
  if (generalComments.length > 0) {
    html += '<div class="pr-section-header">PR Comments (' + generalComments.length + ')</div>';
    for (var gi = 0; gi < generalComments.length; gi++) {
      var gc = generalComments[gi];
      html += '<div class="pr-general-comment">';
      html += '<div class="pr-comment-header">';
      html += '<span class="pr-comment-author">' + esc(gc.author) + '</span>';
      html += '<span class="pr-comment-date">' + esc(formatPRDate(gc.createdAt)) + '</span>';
      html += '</div>';
      html += '<div class="pr-comment-body">' + renderPRMarkdown(gc.body) + '</div>';
      html += '</div>';
    }
  }

  html += '</div>'; // pr-content
  html += '</div>'; // pr-review

  container.innerHTML = html;

  container.querySelectorAll('.pr-refresh-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { refreshPRReviewPanel(btn.dataset.panelId); });
  });
  container.querySelectorAll('.pr-toggle-thread').forEach(function(el) {
    el.addEventListener('click', function() { prToggleThread(el.dataset.panelId, el.dataset.threadId); });
  });
  container.querySelectorAll('.pr-open-file').forEach(function(el) {
    el.addEventListener('click', function(ev) {
      ev.stopPropagation();
      var lineStr = el.dataset.line;
      var line = lineStr ? parseInt(lineStr, 10) : 0;
      prOpenFileLine(el.dataset.file, line);
    });
  });
  container.querySelectorAll('.pr-stop-propagation').forEach(function(el) {
    el.addEventListener('click', function(ev) { ev.stopPropagation(); });
  });
  container.querySelectorAll('.pr-addressed-checkbox').forEach(function(el) {
    el.addEventListener('change', function() { prToggleAddressed(el.dataset.panelId, el.dataset.threadId, el.checked); });
  });
}

function prToggleThread(panelId, threadId) {
  var p = openPanels[panelId];
  if (!p) return;
  if (!p._collapsedMap) p._collapsedMap = {};
  p._collapsedMap[threadId] = !p._collapsedMap[threadId];
  var card = document.getElementById('pr-thread-' + threadId);
  if (card) card.classList.toggle('collapsed', !!p._collapsedMap[threadId]);
}

function prToggleAddressed(panelId, threadId, checked) {
  var p = openPanels[panelId];
  if (!p) return;
  if (!p._addressedMap) p._addressedMap = {};
  p._addressedMap[threadId] = checked;
  // Update addressed class on the card
  var card = document.getElementById('pr-thread-' + threadId);
  if (card) card.classList.toggle('addressed', checked);
  // Recompute progress bar
  var threads = (p.rawData && p.rawData.threads) || [];
  var total = threads.length;
  var addressed = Object.values(p._addressedMap).filter(Boolean).length;
  var pct = total > 0 ? Math.round((addressed / total) * 100) : 0;
  var fill = document.querySelector('#pr-content-' + CSS.escape(panelId) + ' ~ .pr-progress-bar .pr-progress-fill') ||
             document.querySelector('.pr-progress-fill');
  if (fill) fill.style.width = pct + '%';
  var label = document.querySelector('.pr-progress-label');
  if (label) label.textContent = addressed + ' / ' + total + ' addressed';
}

function prOpenFileLine(filePath, line) {
  if (typeof openFileFromExplorer !== 'function') return;
  openFileFromExplorer(filePath).then(function() {
    setTimeout(function() {
      var inst = typeof activeMonacoInstance !== 'undefined' ? activeMonacoInstance : null;
      if (inst && line) {
        inst.revealLineInCenter(line);
        inst.setPosition({ lineNumber: line, column: 1 });
        inst.focus();
      }
    }, 200);
  }).catch(function() {});
}

function refreshPRReviewPanel(panelId) {
  var p = openPanels[panelId];
  if (!p || !p.rawData || !p.rawData.pr) return;
  var prNum = p.rawData.pr;
  authFetch('/git/pr-comments?pr=' + prNum).then(function(res) { return res.json(); }).then(function(data) {
    p.rawData = Object.assign({}, p.rawData, data);
    var container = document.getElementById('file-rendered-view');
    if (container) renderPRReviewPanel(container, p);
  }).catch(function() {});
}

function formatPRDate(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function renderPRMarkdown(text) {
  if (!text) return '';
  if (typeof marked !== 'undefined') {
    try { return marked.parse(text); } catch {}
  }
  // Minimal fallback: escape and preserve newlines
  return '<p>' + esc(text).replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
}

// ═══════════════════════════════════════════════════════════════
// Brainstorm panel — live multi-specialist fan-out from Syn
// ═══════════════════════════════════════════════════════════════
//
// Data shape (written by syn/brainstorm.md to
//   brainstorm/brainstorm_<project>.state.json):
//
// {
//   "mode": "brainstorm",
//   "project": "<slug>",
//   "created": "<ISO>",
//   "phase": "intake|gathering|synthesis|facilitation",
//   "problem": "<initial idea>",
//   "context": { "environment": ..., "data": ..., "compute": ..., "openness": ... },
//   "specialists": [
//     { "name": "data-scientist", "status": "queued|thinking|responded|skipped",
//       "started_at": "...", "responded_at": "...",
//       "headline": "...", "ideas_count": 3 }
//   ],
//   "synthesis": { "quick_wins": [...], "bold_bets": [...], "wildcards": [...],
//                  "themes": [...], "recommended_start": "...",
//                  "recommendation_rationale": "..." } | null,
//   "facilitation_log": [ { "ts": "...", "actor": "...", "text": "..." } ],
//   "outcome": { "decision": "single|multi-workstream", ... } | null
// }

function cleanupBrainstorm(panel) {
  // No persistent sub-components yet (no Tabulator, no Plotly); placeholder for
  // symmetry with other panel cleanup helpers.
  return;
}

function renderBrainstorm(container, panel) {
  var d = panel.rawData;
  if (!d) {
    container.innerHTML = '<div class="no-file-msg">No brainstorm state available yet.</div>';
    return;
  }

  // Defensive defaults — agent may write state mid-phase before all fields exist.
  var phase = d.phase || 'intake';
  var problem = d.problem || '(problem not captured yet)';
  var specialists = Array.isArray(d.specialists) ? d.specialists : [];
  var synthesis = d.synthesis || null;
  var log = Array.isArray(d.facilitation_log) ? d.facilitation_log : [];
  var outcome = d.outcome || null;
  var ctx = d.context || {};

  var html = '<div class="brainstorm-panel">';

  // ── Header ──
  html += '<div class="brain-header">';
  html += '<div class="brain-title">' + esc(d.project || 'brainstorm') + '</div>';
  html += '<div class="brain-phase-pill brain-phase-' + esc(phase) + '">' + esc(phase) + '</div>';
  html += '</div>';

  html += '<div class="brain-problem"><span class="brain-problem-label">Problem</span>'
       +  '<div class="brain-problem-body">' + esc(problem) + '</div></div>';

  // ── Context strip (compact) ──
  var ctxItems = [];
  if (ctx.environment) ctxItems.push(['env', ctx.environment]);
  if (ctx.data)        ctxItems.push(['data', ctx.data]);
  if (ctx.compute)     ctxItems.push(['compute', ctx.compute]);
  if (ctx.openness)    ctxItems.push(['openness', ctx.openness]);
  if (ctxItems.length > 0) {
    html += '<div class="brain-context-strip">';
    for (var c = 0; c < ctxItems.length; c++) {
      html += '<div class="brain-context-item">'
           +  '<span class="brain-context-key">' + esc(ctxItems[c][0]) + '</span>'
           +  '<span class="brain-context-val">' + esc(String(ctxItems[c][1])) + '</span>'
           +  '</div>';
    }
    html += '</div>';
  }

  // ── Specialist progress bar ──
  var total = specialists.length;
  var done = specialists.filter(function(s) { return s.status === 'responded'; }).length;
  var pending = specialists.filter(function(s) { return s.status === 'thinking'; }).length;
  if (total > 0) {
    html += '<div class="brain-progress">';
    html += '<div class="brain-progress-label">'
         +  '<span><strong>' + done + '</strong> / ' + total + ' shards checked in</span>'
         +  (pending > 0 ? '<span class="brain-progress-pending">' + pending + ' thinking…</span>' : '')
         +  '</div>';
    html += '<div class="brain-progress-bar">';
    for (var i = 0; i < total; i++) {
      var s = specialists[i];
      var cls = 'brain-prog-seg ' + (s.status || 'queued');
      html += '<div class="' + cls + '" title="' + esc(s.name || '') + ' — ' + esc(s.status || '') + '"></div>';
    }
    html += '</div></div>';
  }

  // ── Specialist grid ──
  html += '<div class="brain-section-label">Specialist input</div>';
  if (specialists.length === 0) {
    html += '<div class="brain-empty">Waiting for Syn to spawn the chorus…</div>';
  } else {
    html += '<div class="brain-specialist-grid">';
    for (var si = 0; si < specialists.length; si++) {
      var sp = specialists[si];
      var status = sp.status || 'queued';
      html += '<div class="brain-card brain-card-' + esc(status) + '">';
      html += '<div class="brain-card-head">';
      html += '<span class="brain-card-name">' + esc(sp.name || '') + '</span>';
      html += '<span class="brain-card-status">';
      if (status === 'thinking') html += '<span class="brain-spinner"></span>';
      html += esc(status);
      html += '</span>';
      html += '</div>';
      if (sp.headline) {
        html += '<div class="brain-card-headline">' + esc(sp.headline) + '</div>';
      } else if (status === 'thinking') {
        html += '<div class="brain-card-headline brain-card-pending">thinking…</div>';
      } else if (status === 'queued') {
        html += '<div class="brain-card-headline brain-card-pending">queued</div>';
      }
      if (typeof sp.ideas_count === 'number' && sp.ideas_count > 0) {
        html += '<div class="brain-card-meta">' + sp.ideas_count + ' idea'
             + (sp.ideas_count === 1 ? '' : 's') + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // ── Synthesis (appears when phase >= synthesis) ──
  if (synthesis) {
    html += '<div class="brain-section-label">Synthesis</div>';
    html += '<div class="brain-synthesis">';
    html += brainSynthBucket('Quick wins', 'quick-wins', synthesis.quick_wins);
    html += brainSynthBucket('Bold bets',  'bold-bets',  synthesis.bold_bets);
    html += brainSynthBucket('Wildcards',  'wildcards',  synthesis.wildcards);
    if (Array.isArray(synthesis.themes) && synthesis.themes.length > 0) {
      html += '<div class="brain-themes"><span class="brain-themes-label">Themes:</span> ';
      html += synthesis.themes.map(function(t) {
        return '<span class="brain-theme-chip">' + esc(t) + '</span>';
      }).join('');
      html += '</div>';
    }
    if (synthesis.recommended_start) {
      html += '<div class="brain-recommend">';
      html += '<div class="brain-recommend-label">Recommended starting point</div>';
      html += '<div class="brain-recommend-title">' + esc(synthesis.recommended_start) + '</div>';
      if (synthesis.recommendation_rationale) {
        html += '<div class="brain-recommend-rationale">'
             +  esc(synthesis.recommendation_rationale) + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // ── Facilitation log (Phase 3) ──
  if (log.length > 0) {
    html += '<div class="brain-section-label">Facilitation log</div>';
    html += '<div class="brain-log">';
    for (var li = log.length - 1; li >= 0; li--) {
      var entry = log[li];
      html += '<div class="brain-log-entry">';
      html += '<span class="brain-log-actor brain-actor-' + esc(entry.actor || 'syn') + '">'
           +  esc(entry.actor || '') + '</span>';
      html += '<span class="brain-log-text">' + esc(entry.text || '') + '</span>';
      if (entry.ts) {
        html += '<span class="brain-log-ts">' + esc(brainFormatTs(entry.ts)) + '</span>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // ── Outcome banner ──
  if (outcome) {
    html += '<div class="brain-outcome brain-outcome-' + esc(outcome.decision || 'unknown') + '">';
    html += '<span class="brain-outcome-label">Outcome</span>';
    if (outcome.decision === 'single') {
      html += '<span class="brain-outcome-detail">Escalated to <strong>'
           +  esc(outcome.direction || '?') + '</strong>';
      if (outcome.target_dir) html += ' → <code>' + esc(outcome.target_dir) + '</code>';
      html += '</span>';
    } else if (outcome.decision === 'multi-workstream') {
      var n = outcome.workstream_count
           || (Array.isArray(outcome.workstreams) ? outcome.workstreams.length : 0);
      html += '<span class="brain-outcome-detail">Multi-workstream — <strong>'
           +  n + '</strong> workstream' + (n === 1 ? '' : 's') + '</span>';
    } else {
      html += '<span class="brain-outcome-detail">' + esc(JSON.stringify(outcome)) + '</span>';
    }
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function brainSynthBucket(label, cls, items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  var html = '<div class="brain-bucket brain-bucket-' + cls + '">';
  html += '<div class="brain-bucket-label">' + esc(label) + '</div>';
  html += '<ul class="brain-bucket-list">';
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (typeof item === 'string') {
      html += '<li><strong>' + esc(item) + '</strong></li>';
    } else {
      html += '<li>';
      html += '<strong>' + esc(item.title || '') + '</strong>';
      if (item.rationale) html += ' — ' + esc(item.rationale);
      html += '</li>';
    }
  }
  html += '</ul></div>';
  return html;
}

function brainFormatTs(iso) {
  if (!iso) return '';
  try {
    var d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso; }
}
