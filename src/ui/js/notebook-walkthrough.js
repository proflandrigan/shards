// ═══════════════════════════════════════════════════════════════
// Notebook Walkthrough Panel
// ═══════════════════════════════════════════════════════════════
// Interactive cell-by-cell notebook walkthrough driven by an agent
// (Data Scientist, ML Engineer, or Syn). The agent owns the kernel
// and the .ipynb file on disk; this panel renders the current state
// from a watched JSON file (.shards/notebook-walkthrough.json) and
// dispatches user actions back to the agent as chat messages prefixed
// with [NOTEBOOK-WALKTHROUGH].
//
// The renderer signature matches the other panel renderers in panels.js:
// renderNotebookWalkthrough(container, panel)
// where panel.rawData is the parsed walkthrough state JSON.

function cleanupNotebookWalkthrough(panel) {
  // No long-lived editor instances or Plotly charts to dispose.
  // The state is rebuilt from rawData on every render.
  panel._nwState = panel._nwState || {};
}

function renderNotebookWalkthrough(container, panel) {
  var d = panel.rawData;
  if (!d) {
    container.innerHTML = '<div class="nw-empty">No walkthrough data yet. The agent will push state once the kernel is started.</div>';
    return;
  }

  // Preserve view-only state (e.g. which cell is expanded for editing) across
  // re-renders. The agent owns the source-of-truth state JSON.
  panel._nwState = panel._nwState || { editingCellIdx: null, editBuffer: '' };
  var view = panel._nwState;
  var pid = panel.panelId;

  var cells = (d.cells || []);
  var current = (typeof d.currentCellIndex === 'number') ? d.currentCellIndex : 0;

  // ── Scroll preservation ──
  // The whole container's innerHTML is rewritten on every state update, so the
  // inner .nw-cells scroll position resets to 0. Capture it before rebuilding
  // and restore it after — unless the current cell index changed (Next cell,
  // jump, etc.), in which case scroll the new current cell into view.
  var prevScrollTop = 0;
  var prevCellsEl = container.querySelector('.nw-cells');
  if (prevCellsEl) prevScrollTop = prevCellsEl.scrollTop;
  var prevCurrent = (typeof view.lastRenderedCurrentIndex === 'number')
    ? view.lastRenderedCurrentIndex : null;
  var indexChanged = prevCurrent !== null && prevCurrent !== current;
  var status = d.status || 'ready';
  var nbPath = d.notebookPath || '';
  var nbBaseName = nbPath ? nbPath.split('/').pop() : '(no notebook)';
  var staleCount = 0;
  for (var ci = 0; ci < cells.length; ci++) { if (cells[ci] && cells[ci].stale) staleCount++; }

  var html = '<div class="notebook-walkthrough" data-panel-id="' + esc(pid) + '">';

  // ── Status strip ──
  html += '<div class="nw-status-strip">';
  html += '<div class="nw-strip-left">';
  html += '<span class="nw-nb-name" title="' + esc(nbPath) + '">' + esc(nbBaseName) + '</span>';
  html += '<span class="nw-cell-counter">Cell ' + (current + 1) + ' / ' + cells.length + '</span>';
  html += '<span class="nw-status-badge nw-status-' + esc(status) + '">' + esc(status) + '</span>';
  if (staleCount > 0) {
    html += '<span class="nw-stale-count" title="' + staleCount + ' cell(s) are stale (ancestors changed)">' + staleCount + ' stale</span>';
  }
  html += '</div>';
  html += '<div class="nw-strip-right">';
  html += '<button class="nw-strip-btn" data-nw-action="send-command" data-nw-command="Restart kernel" title="Restart kernel">Restart</button>';
  html += '<button class="nw-strip-btn" data-nw-action="send-command" data-nw-command="Restart &amp; run all" title="Restart the kernel and run every cell top-to-bottom (reproducibility check)">Run All</button>';
  html += '<button class="nw-strip-btn" data-nw-action="send-command" data-nw-command="End walkthrough" title="End walkthrough">End</button>';
  html += '</div>';
  html += '</div>';

  // ── Cells ──
  html += '<div class="nw-cells">';
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i] || {};
    var rawCell = (d.notebookCells && d.notebookCells[i]) ? d.notebookCells[i] : null;
    html += renderWalkthroughCell(pid, i, c, rawCell, current, view);
  }
  html += '</div>';

  // ── Empty notebook fallback ──
  if (cells.length === 0) {
    html += '<div class="nw-empty">Notebook has no cells.</div>';
  }

  html += '</div>';
  container.innerHTML = html;

  // Wire up button click handlers (replaces inline onclicks so that pids or
  // commands containing apostrophes don't break the HTML attribute parser).
  container.querySelectorAll('[data-nw-action]').forEach(function(el) {
    el.addEventListener('click', function(ev) {
      var action = el.getAttribute('data-nw-action');
      if (action === 'send-command') {
        nwSendCommand(pid, el.getAttribute('data-nw-command'));
      } else if (action === 'prompt-question') {
        nwPromptQuestion(pid, parseInt(el.getAttribute('data-cell-idx'), 10));
      } else if (action === 'prompt-insert') {
        nwPromptInsert(pid, parseInt(el.getAttribute('data-cell-idx'), 10));
      } else if (action === 'confirm-delete') {
        nwConfirmDelete(pid, parseInt(el.getAttribute('data-cell-idx'), 10));
      } else if (action === 'toggle-edit') {
        nwToggleEdit(pid, parseInt(el.getAttribute('data-cell-idx'), 10));
      } else if (action === 'apply-edit') {
        nwApplyEdit(pid, parseInt(el.getAttribute('data-cell-idx'), 10));
      }
    });
  });

  // ── Restore scroll / focus the current cell ──
  var newCellsEl = container.querySelector('.nw-cells');
  if (newCellsEl) {
    if (indexChanged) {
      var target = newCellsEl.querySelector('[data-cell-idx="' + current + '"]');
      if (target) {
        // scrollIntoView is relative to the nearest scrollable ancestor —
        // .nw-cells. Center the cell so the user sees it and a bit of context
        // above and below.
        try {
          target.scrollIntoView({ block: 'center', behavior: 'auto' });
        } catch (e) {
          // Older browsers: fallback to math.
          var rect = target.getBoundingClientRect();
          var parentRect = newCellsEl.getBoundingClientRect();
          newCellsEl.scrollTop += (rect.top - parentRect.top) - (parentRect.height - rect.height) / 2;
        }
      }
    } else {
      newCellsEl.scrollTop = prevScrollTop;
    }
  }
  view.lastRenderedCurrentIndex = current;
}

function renderWalkthroughCell(pid, idx, cellState, rawCell, current, view) {
  var isCurrent = idx === current;
  var isEditing = view && view.editingCellIdx === idx;
  var stale = !!cellState.stale;
  var executed = !!cellState.executed;
  var cellType = cellState.type || (rawCell ? rawCell.cell_type : 'code');
  var cls = 'nw-cell';
  if (isCurrent) cls += ' nw-cell-current';
  if (stale) cls += ' nw-cell-stale';
  if (executed) cls += ' nw-cell-executed';

  var html = '<div class="' + cls + '" data-cell-idx="' + idx + '">';

  // Header strip per cell (index + type + status badges + action row)
  html += '<div class="nw-cell-header">';
  html += '<span class="nw-cell-idx">[' + idx + ']</span>';
  html += '<span class="nw-cell-type ' + esc(cellType) + '">' + esc(cellType) + '</span>';
  if (executed && !stale) html += '<span class="nw-cell-flag nw-flag-ok">ran</span>';
  if (stale) html += '<span class="nw-cell-flag nw-flag-stale">stale</span>';
  if (isCurrent) html += '<span class="nw-cell-flag nw-flag-current">current</span>';

  // Action row
  html += '<div class="nw-cell-actions">';
  if (cellType === 'code') {
    html += '<button class="nw-act-btn nw-act-run" data-nw-action="send-command" data-nw-command="Run cell ' + idx + '" title="Run cell">Run</button>';
  }
  html += '<button class="nw-act-btn" data-nw-action="send-command" data-nw-command="Re-explain cell ' + idx + '" title="Ask agent to re-explain">Explain</button>';
  html += '<button class="nw-act-btn" data-nw-action="prompt-question" data-cell-idx="' + idx + '" title="Ask a question about this cell">Ask</button>';
  if (cellType === 'code') {
    html += '<button class="nw-act-btn" data-nw-action="toggle-edit" data-cell-idx="' + idx + '" title="Edit cell source">' + (isEditing ? 'Cancel' : 'Edit') + '</button>';
  }
  html += '<button class="nw-act-btn" data-nw-action="prompt-insert" data-cell-idx="' + idx + '" title="Insert a new cell after this one">Insert</button>';
  html += '<button class="nw-act-btn nw-act-delete" data-nw-action="confirm-delete" data-cell-idx="' + idx + '" title="Delete this cell">Delete</button>';
  if (stale) {
    html += '<button class="nw-act-btn nw-act-rerun" data-nw-action="send-command" data-nw-command="Re-run from cell ' + idx + '" title="Re-run this cell and all downstream stale cells">Re-run from here</button>';
  }
  html += '</div>';
  html += '</div>';

  // Body — code/markdown source + outputs (or Monaco editor in edit mode)
  html += '<div class="nw-cell-body">';
  if (isEditing) {
    var src = (rawCell && (Array.isArray(rawCell.source) ? rawCell.source.join('') : rawCell.source)) || '';
    html += '<textarea class="nw-edit-textarea" id="nw-edit-' + esc(pid) + '-' + idx + '">' + esc(src) + '</textarea>';
    html += '<div class="nw-edit-actions">';
    html += '<button class="nw-act-btn nw-act-primary" data-nw-action="apply-edit" data-cell-idx="' + idx + '">Apply &amp; Re-run</button>';
    html += '<button class="nw-act-btn" data-nw-action="toggle-edit" data-cell-idx="' + idx + '">Cancel</button>';
    html += '</div>';
  } else if (rawCell && typeof renderStaticCellHtml === 'function') {
    var staticCell = {
      cell_type: rawCell.cell_type || cellType,
      source: Array.isArray(rawCell.source) ? rawCell.source.join('') : (rawCell.source || ''),
      outputs: rawCell.outputs || [],
    };
    html += renderStaticCellHtml(staticCell);
  } else {
    html += '<div class="nw-cell-no-source">(source unavailable — agent has not yet pushed cell snapshots)</div>';
  }

  // Last explanation/output summary if present
  if (cellState.outputSummary) {
    html += '<div class="nw-output-summary"><strong>Last result:</strong> ' + esc(cellState.outputSummary) + '</div>';
  }
  if (cellState.explanation) {
    html += '<div class="nw-explanation"><strong>Explanation:</strong> ' + esc(cellState.explanation) + '</div>';
  }
  if (cellState.lastRunAt) {
    html += '<div class="nw-last-run">ran ' + esc(cellState.lastRunAt) + '</div>';
  }

  html += '</div>';
  html += '</div>';
  return html;
}

// ─── Action dispatchers ──────────────────────────────────────────────────────
// All actions become chat messages prefixed [NOTEBOOK-WALKTHROUGH] sent via
// /chat/send to the active session — same pattern as the Prompt Lab.

function nwSendCommand(panelId, commandText) {
  var msg = '[NOTEBOOK-WALKTHROUGH] ' + commandText;
  var sessionId = activeSessionId;
  if (typeof authFetch !== 'function') return;
  authFetch('/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, sessionId: sessionId }),
  }).catch(function() {});
}

function nwPromptQuestion(panelId, idx) {
  var q = window.prompt('Question about cell ' + idx + ':', '');
  if (!q) return;
  nwSendCommand(panelId, 'Question on cell ' + idx + ': ' + q);
}

function nwPromptInsert(panelId, idx) {
  var typeAns = window.prompt('Insert what kind of cell after [' + idx + ']? Type "code" or "markdown":', 'code');
  if (!typeAns) return;
  typeAns = String(typeAns).trim().toLowerCase();
  if (typeAns !== 'code' && typeAns !== 'markdown') return;
  var content = window.prompt('Cell content (you can also leave blank and ask the agent to fill it in):', '');
  if (content === null) return;
  // Encode newlines so the chat protocol stays single-line-friendly. Agent
  // will decode \n on receipt.
  var encoded = content.replace(/\r\n?/g, '\n').replace(/\n/g, '\\n');
  nwSendCommand(panelId, 'Insert cell after ' + idx + ' (' + typeAns + '): ' + encoded);
}

function nwConfirmDelete(panelId, idx) {
  if (!window.confirm('Delete cell ' + idx + '? Downstream cells may go stale.')) return;
  nwSendCommand(panelId, 'Delete cell ' + idx);
}

function nwToggleEdit(panelId, idx) {
  var p = openPanels[panelId];
  if (!p) return;
  p._nwState = p._nwState || { editingCellIdx: null };
  if (p._nwState.editingCellIdx === idx) {
    p._nwState.editingCellIdx = null;
  } else {
    p._nwState.editingCellIdx = idx;
  }
  var container = document.getElementById('file-rendered-view');
  if (container) renderNotebookWalkthrough(container, p);
}

function nwApplyEdit(panelId, idx) {
  var ta = document.getElementById('nw-edit-' + panelId + '-' + idx);
  if (!ta) return;
  var newSrc = ta.value || '';
  var encoded = newSrc.replace(/\r\n?/g, '\n').replace(/\n/g, '\\n');
  // Reset edit-mode view state before re-render
  var p = openPanels[panelId];
  if (p && p._nwState) p._nwState.editingCellIdx = null;
  nwSendCommand(panelId, 'Edit cell ' + idx + ': ' + encoded);
}
