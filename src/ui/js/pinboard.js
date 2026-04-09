// ═══════════════════════════════════════════════════════════════
// Pinboard — drag-and-drop context shelf above chat input
// ═══════════════════════════════════════════════════════════════

// Pin types: { type: 'file', path, name } or { type: 'snippet', path, name, text, startLine, endLine }

function addPin(pin) {
  // Deduplicate: don't add the same file twice (snippets can repeat)
  if (pin.type === 'file') {
    for (var i = 0; i < pinnedItems.length; i++) {
      if (pinnedItems[i].type === 'file' && pinnedItems[i].path === pin.path) return;
    }
  }
  pinnedItems.push(pin);
  renderPinboard();
}

function removePin(index) {
  pinnedItems.splice(index, 1);
  renderPinboard();
}

function clearAllPins() {
  pinnedItems.length = 0;
  renderPinboard();
}

function pinCurrentSelection() {
  var ctx = captureSelectionContext();
  if (!ctx) return;
  addPin({
    type: 'snippet',
    path: ctx.filePath,
    name: ctx.filePath.split('/').pop() +
      (ctx.startLine != null
        ? ':' + ctx.startLine + (ctx.endLine !== ctx.startLine ? '-' + ctx.endLine : '')
        : ''),
    text: ctx.text,
    startLine: ctx.startLine,
    endLine: ctx.endLine,
  });
}

function pinFileByPath(filePath) {
  addPin({
    type: 'file',
    path: filePath,
    name: filePath.split('/').pop(),
  });
}

function renderPinboard() {
  var el = document.getElementById('pinboard');
  if (!el) return;

  if (pinnedItems.length === 0) {
    el.classList.remove('visible');
    el.innerHTML = '';
    if (typeof renderHud === 'function') renderHud();
    return;
  }

  el.classList.add('visible');
  var html = '<div class="pinboard-header">' +
    '<span class="pinboard-label">Pinned Context</span>' +
    '<button class="pinboard-clear" onclick="clearAllPins()" title="Clear all pins">&times; Clear</button>' +
  '</div><div class="pinboard-chips">';

  for (var i = 0; i < pinnedItems.length; i++) {
    var pin = pinnedItems[i];
    var icon = pin.type === 'file' ? '&#128196;' : '&#9998;';
    var tooltip = pin.type === 'snippet'
      ? esc(pin.path) + (pin.startLine != null ? ':' + pin.startLine + '-' + pin.endLine : '')
      : esc(pin.path);
    html += '<span class="pin-chip" title="' + tooltip + '" data-index="' + i + '">' +
      '<span class="pin-chip-icon">' + icon + '</span>' +
      '<span class="pin-chip-name">' + esc(pin.name) + '</span>' +
      '<button class="pin-chip-remove" onclick="removePin(' + i + ')" title="Unpin">&times;</button>' +
    '</span>';
  }

  html += '</div>';
  el.innerHTML = html;
  if (typeof renderHud === 'function') renderHud();
}

// ─── Format pinned context for message prepending ───────────

async function formatPinnedContextForMessage(userMessage) {
  if (pinnedItems.length === 0) return userMessage;

  // Fetch all file contents in parallel
  var fetches = pinnedItems.map(function(pin) {
    if (pin.type === 'file') return fetchPinnedFileContent(pin.path);
    return Promise.resolve(null);
  });
  var results = await Promise.all(fetches);

  var sections = [];
  for (var i = 0; i < pinnedItems.length; i++) {
    var pin = pinnedItems[i];
    if (pin.type === 'snippet') {
      var fileRef = 'File: ' + pin.path;
      if (pin.startLine != null) {
        fileRef += pin.startLine === pin.endLine
          ? ' (line ' + pin.startLine + ')'
          : ' (lines ' + pin.startLine + '-' + pin.endLine + ')';
      }
      sections.push(fileRef + '\n```\n' + pin.text + '\n```');
    } else if (pin.type === 'file') {
      var content = results[i];
      if (content !== null) {
        sections.push('File: ' + pin.path + '\n```\n' + content + '\n```');
      } else {
        sections.push('File: ' + pin.path + ' (could not read)');
      }
    }
  }

  return '--- Pinned Context ---\n' + sections.join('\n\n') + '\n--- End Pinned Context ---\n\n' + userMessage;
}

async function fetchPinnedFileContent(filePath) {
  try {
    var res = await authFetch('/browse/file/text?path=' + encodeURIComponent(filePath));
    if (!res.ok) return null;
    var text = await res.text();
    // Truncate very large files to keep context manageable
    if (text.length > 20000) {
      text = text.substring(0, 20000) + '\n... (truncated, ' + text.length + ' chars total)';
    }
    return text;
  } catch (e) {
    return null;
  }
}

// ─── Drag-and-drop handling ─────────────────────────────────

function initPinboardDropZone() {
  var chatPane = document.getElementById('chat-pane');
  if (!chatPane) return;

  chatPane.addEventListener('dragover', function(e) {
    if (!e.dataTransfer.types.includes('application/x-shards-file')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    var pinboard = document.getElementById('pinboard');
    if (pinboard) pinboard.classList.add('drag-over');
  });

  chatPane.addEventListener('dragleave', function(e) {
    // Only remove highlight if leaving the chat pane entirely
    if (e.relatedTarget && chatPane.contains(e.relatedTarget)) return;
    var pinboard = document.getElementById('pinboard');
    if (pinboard) pinboard.classList.remove('drag-over');
  });

  chatPane.addEventListener('drop', function(e) {
    var pinboard = document.getElementById('pinboard');
    if (pinboard) pinboard.classList.remove('drag-over');

    var filePath = e.dataTransfer.getData('application/x-shards-file');
    if (!filePath) return;
    e.preventDefault();
    pinFileByPath(filePath);
  });
}

function makeExplorerEntryDraggable(row, fullPath) {
  row.setAttribute('draggable', 'true');
  row.addEventListener('dragstart', function(e) {
    e.dataTransfer.setData('application/x-shards-file', fullPath);
    e.dataTransfer.setData('text/plain', fullPath);
    e.dataTransfer.effectAllowed = 'copy';
    row.classList.add('dragging');
    // Show drop zone indicator
    var pinboard = document.getElementById('pinboard');
    if (pinboard) pinboard.classList.add('drop-target');
  });
  row.addEventListener('dragend', function() {
    row.classList.remove('dragging');
    var pinboard = document.getElementById('pinboard');
    if (pinboard) pinboard.classList.remove('drop-target');
  });
}
