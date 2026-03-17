// ═══════════════════════════════════════════════════════════════
// Explorer sidebar
// ═══════════════════════════════════════════════════════════════

function toggleExplorer() {
  document.getElementById('explorer-sidebar').classList.toggle('collapsed');
}

async function browseDir(dir) {
  try {
    var url = dir ? '/browse?dir=' + encodeURIComponent(dir) : '/browse';
    var res = await fetch(url);
    var data = await res.json();
    if (data.error) return;
    currentBrowseDir = data.path;
    renderBreadcrumb(data.path);
    renderDirListing(data);
  } catch(e) {}
}

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
      row.className = 'dir-entry is-file';
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
  try {
    var res = await fetch('/browse/file?path=' + encodeURIComponent(filePath));
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
