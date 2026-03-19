// ═══════════════════════════════════════════════════════════════
// Explorer sidebar
// ═══════════════════════════════════════════════════════════════

function toggleExplorer() {
  document.getElementById('explorer-sidebar').classList.toggle('collapsed');
}

function switchExplorerView(mode) {
  explorerViewMode = mode;
  localStorage.setItem('shards-explorer-view', mode);
  updateExplorerViewToggle();
  var breadcrumb = document.getElementById('explorer-breadcrumb');
  if (breadcrumb) breadcrumb.style.display = mode === 'tree' ? 'none' : '';
  if (mode === 'tree') {
    renderTree();
  } else {
    browseDir(currentBrowseDir || undefined);
  }
}

function updateExplorerViewToggle() {
  var btn = document.getElementById('explorer-view-toggle');
  if (!btn) return;
  btn.textContent = explorerViewMode === 'tree' ? 'List' : 'Tree';
  btn.title = explorerViewMode === 'tree' ? 'Switch to list view' : 'Switch to tree view';
}

async function browseDir(dir) {
  try {
    var url = dir ? '/browse?dir=' + encodeURIComponent(dir) : '/browse';
    var res = await authFetch(url);
    var data = await res.json();
    if (data.error) return;
    currentBrowseDir = data.path;

    // Seed tree root on first load
    if (!treeRootPath) {
      treeRootPath = data.path;
      treeChildren[data.path] = data;
      treeExpanded[data.path] = true;
    }

    updateExplorerViewToggle();

    var breadcrumb = document.getElementById('explorer-breadcrumb');
    if (explorerViewMode === 'tree') {
      if (breadcrumb) breadcrumb.style.display = 'none';
      renderTree();
    } else {
      if (breadcrumb) breadcrumb.style.display = '';
      renderBreadcrumb(data.path);
      renderDirListing(data);
    }
  } catch(e) {}
}

// ─── Tree view ─────────────────────────────────────────────────

function renderTree() {
  var el = document.getElementById('explorer-listing');
  el.innerHTML = '';
  if (!treeRootPath || !treeChildren[treeRootPath]) return;
  renderTreeNodes(el, treeRootPath, 0);
}

function renderTreeNodes(container, dirPath, depth) {
  var data = treeChildren[dirPath];
  if (!data) return;
  var entries = data.entries || [];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var fullPath = dirPath.replace(/\/+$/, '') + '/' + entry.name;
    var row = document.createElement('div');

    if (entry.type === 'dir') {
      var isExpanded = !!treeExpanded[fullPath];
      var isLoading = !!treeLoading[fullPath];
      row.className = 'tree-entry is-dir' + (isExpanded ? ' expanded' : '');
      row.style.paddingLeft = (8 + depth * 14) + 'px';
      var toggleChar = isLoading ? '&#9675;' : (isExpanded ? '&#9660;' : '&#9654;');
      row.innerHTML =
        '<span class="tree-toggle">' + toggleChar + '</span>' +
        '<span class="dir-icon">&#128193;</span>' +
        '<span class="dir-name">' + esc(entry.name) + '</span>';
      row.addEventListener('click', (function(fp) {
        return function() { toggleTreeDir(fp); };
      })(fullPath));
      container.appendChild(row);

      if (isExpanded) {
        if (treeChildren[fullPath]) {
          renderTreeNodes(container, fullPath, depth + 1);
        } else if (!isLoading) {
          fetchTreeDir(fullPath);
        }
      }
    } else {
      var relFromRoot = treeRootPath ? fullPath.replace(treeRootPath + '/', '') : fullPath;
      var touchClass = sessionTouchedFiles.has(fullPath) || sessionTouchedFiles.has(relFromRoot) ? ' touched' : '';
      row.className = 'tree-entry is-file' + touchClass;
      row.style.paddingLeft = (8 + depth * 14 + 18) + 'px';
      row.innerHTML =
        '<span class="dir-icon file-icon">&#128196;</span>' +
        '<span class="dir-name">' + esc(entry.name) + '</span>' +
        '<span class="dir-size">' + formatSize(entry.size) + '</span>';
      row.addEventListener('click', (function(fp) {
        return function() { openFileFromExplorer(fp); };
      })(fullPath));
      container.appendChild(row);
    }
  }
}

async function fetchTreeDir(dirPath) {
  treeLoading[dirPath] = true;
  renderTree();
  try {
    var res = await authFetch('/browse?dir=' + encodeURIComponent(dirPath));
    var data = await res.json();
    if (!data.error) {
      treeChildren[dirPath] = data;
    }
  } catch(e) {}
  treeLoading[dirPath] = false;
  renderTree();
}

function toggleTreeDir(dirPath) {
  if (treeExpanded[dirPath]) {
    treeExpanded[dirPath] = false;
    renderTree();
  } else {
    treeExpanded[dirPath] = true;
    if (!treeChildren[dirPath] && !treeLoading[dirPath]) {
      fetchTreeDir(dirPath);
    } else {
      renderTree();
    }
  }
}

// ─── List view ─────────────────────────────────────────────────

function renderBreadcrumb(dirPath) {
  var el = document.getElementById('explorer-breadcrumb');
  el.innerHTML = '';
  var parts = dirPath.split('/').filter(Boolean);

  var root = document.createElement('span');
  root.className = 'crumb';
  root.textContent = '/';
  root.addEventListener('click', function() { browseDir('/'); });
  el.appendChild(root);

  for (var i = 0; i < parts.length; i++) {
    var cumPath = '/' + parts.slice(0, i + 1).join('/');
    var isCurrent = i === parts.length - 1;

    var sep = document.createElement('span');
    sep.className = 'crumb-sep';
    sep.textContent = '/';
    el.appendChild(sep);

    var crumb = document.createElement('span');
    crumb.className = 'crumb' + (isCurrent ? ' current' : '');
    crumb.textContent = parts[i];
    if (!isCurrent) crumb.addEventListener('click', (function(p) { return function() { browseDir(p); }; })(cumPath));
    el.appendChild(crumb);
  }
}

function renderDirListing(data) {
  var el = document.getElementById('explorer-listing');
  el.innerHTML = '';

  if (data.parent) {
    var parentEl = document.createElement('div');
    parentEl.className = 'dir-entry parent-entry is-dir';
    parentEl.innerHTML = '<span class="dir-icon">..</span><span class="dir-name">Parent directory</span>';
    parentEl.addEventListener('click', function() { browseDir(data.parent); });
    el.appendChild(parentEl);
  }

  for (var j = 0; j < data.entries.length; j++) {
    var entry = data.entries[j];
    var fullPath = data.path + '/' + entry.name;
    var row = document.createElement('div');

    if (entry.type === 'dir') {
      row.className = 'dir-entry is-dir';
      row.innerHTML = '<span class="dir-icon">&#128193;</span><span class="dir-name">' + esc(entry.name) + '</span>';
      row.addEventListener('click', (function(fp) { return function() { browseDir(fp); }; })(fullPath));
    } else {
      var relFromRoot = treeRootPath ? fullPath.replace(treeRootPath + '/', '') : fullPath;
      var touchClass = sessionTouchedFiles.has(fullPath) || sessionTouchedFiles.has(relFromRoot) ? ' touched' : '';
      row.className = 'dir-entry is-file' + touchClass;
      row.innerHTML = '<span class="dir-icon">&#128196;</span><span class="dir-name">' + esc(entry.name) + '</span><span class="dir-size">' + formatSize(entry.size) + '</span>';
      row.addEventListener('click', (function(fp) { return function() { openFileFromExplorer(fp); }; })(fullPath));
    }
    el.appendChild(row);
  }

  if (data.entries.length === 0 && !data.parent) {
    el.innerHTML = '<div style="padding:8px 12px;color:#3a3a54;font-size:10px">Empty directory</div>';
  }
}

async function openFileFromExplorer(filePath) {
  if (isMediaFile(filePath)) {
    // For images/PDFs, open with absPath — no text content needed
    var relPath = filePath;
    // Try to get relative path from the project
    if (treeRootPath && filePath.indexOf(treeRootPath) === 0) {
      relPath = filePath.slice(treeRootPath.length + 1);
    }
    openFileTab(relPath, '', filePath, { media: true });
    return;
  }
  try {
    var res = await authFetch('/browse/file?path=' + encodeURIComponent(filePath));
    var data = await res.json();
    if (data.error) return;
    var key = data.relPath || filePath;
    openFileTab(key, data.content, data.path);
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// Explorer resize
// ═══════════════════════════════════════════════════════════════

function initExplorerResize() {
  var handle = document.getElementById('explorer-resize');
  var sidebar = document.getElementById('explorer-sidebar');
  var startX, startW;

  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    handle.classList.add('dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  function onMove(e) {
    var newW = Math.max(140, Math.min(500, startW + (e.clientX - startX)));
    sidebar.style.width = newW + 'px';
  }
  function onUp() {
    handle.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
}
