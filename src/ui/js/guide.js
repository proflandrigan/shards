// ═══════════════════════════════════════════════════════════════
// Shards Developer Guide panel — sidebar TOC + markdown content
// ═══════════════════════════════════════════════════════════════

var guideState = {
  manifest: null,      // { version, sections: [{id, title, pages: [{id, title, file}]}] }
  currentFile: null,   // active page file (relative to docs root)
  pageCache: {},       // file -> markdown text
  searchIndex: null,   // [{ sectionId, pageId, title, file, body }]
  searchQuery: '',
};

var GUIDE_LS_KEY = 'shards.guide.lastPage';

function openGuidePanel() {
  openPanelTab('guide-main', {
    panel: 'guide',
    title: 'Developer Guide',
    data: null,
  });
}

function cleanupGuide(panel) {
  // nothing to tear down — state is persistent across re-renders
}

function renderGuidePanel(container, panel) {
  container.classList.add('guide-panel');
  container.innerHTML =
    '<div class="guide-layout">' +
      '<div class="guide-toc">' +
        '<div class="guide-search-wrap">' +
          '<input type="text" id="guide-search-input" placeholder="Search guide..." value="' + esc(guideState.searchQuery) + '">' +
        '</div>' +
        '<div id="guide-toc-tree"></div>' +
      '</div>' +
      '<div class="guide-content" id="guide-content">' +
        '<div class="guide-loading">Loading…</div>' +
      '</div>' +
    '</div>';

  var input = document.getElementById('guide-search-input');
  input.addEventListener('input', function(e) {
    guideState.searchQuery = e.target.value;
    renderGuideToc();
  });

  if (guideState.manifest) {
    renderGuideToc();
    var file = guideState.currentFile || getLastPageFile() || firstPageFile();
    if (file) loadGuidePage(file);
  } else {
    fetchGuideManifest().then(function() {
      renderGuideToc();
      var file = getLastPageFile() || firstPageFile();
      if (file) loadGuidePage(file);
    }).catch(function(err) {
      document.getElementById('guide-content').innerHTML =
        '<div class="guide-error">Failed to load guide: ' + esc(String(err && err.message || err)) + '</div>';
    });
  }
}

function getLastPageFile() {
  try { return localStorage.getItem(GUIDE_LS_KEY) || null; } catch(e) { return null; }
}

function setLastPageFile(file) {
  try { localStorage.setItem(GUIDE_LS_KEY, file); } catch(e) {}
}

function firstPageFile() {
  var m = guideState.manifest;
  if (!m || !m.sections || !m.sections.length) return null;
  for (var i = 0; i < m.sections.length; i++) {
    var pages = m.sections[i].pages || [];
    if (pages.length) return pages[0].file;
  }
  return null;
}

function fetchGuideManifest() {
  return fetch('/docs/manifest').then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(json) {
    guideState.manifest = json;
    return json;
  });
}

function renderGuideToc() {
  var tree = document.getElementById('guide-toc-tree');
  if (!tree) return;
  var m = guideState.manifest;
  if (!m) { tree.innerHTML = ''; return; }

  var q = (guideState.searchQuery || '').trim().toLowerCase();
  var html = '';
  for (var i = 0; i < m.sections.length; i++) {
    var s = m.sections[i];
    var pages = (s.pages || []).filter(function(p) {
      if (!q) return true;
      if ((p.title || '').toLowerCase().indexOf(q) !== -1) return true;
      if ((s.title || '').toLowerCase().indexOf(q) !== -1) return true;
      var body = guideState.pageCache[p.file];
      return body && body.toLowerCase().indexOf(q) !== -1;
    });
    if (!pages.length) continue;
    html += '<div class="guide-section">';
    html += '<div class="guide-section-title">' + esc(s.title) + '</div>';
    html += '<ul class="guide-page-list">';
    for (var j = 0; j < pages.length; j++) {
      var p = pages[j];
      var active = p.file === guideState.currentFile ? ' active' : '';
      html += '<li class="guide-page-item' + active + '" data-file="' + esc(p.file) + '">' + esc(p.title) + '</li>';
    }
    html += '</ul></div>';
  }
  if (!html) html = '<div class="guide-empty">No matches</div>';
  tree.innerHTML = html;

  var items = tree.querySelectorAll('.guide-page-item');
  for (var k = 0; k < items.length; k++) {
    items[k].addEventListener('click', function() {
      var file = this.getAttribute('data-file');
      loadGuidePage(file);
    });
  }
}

function loadGuidePage(file) {
  guideState.currentFile = file;
  setLastPageFile(file);
  renderGuideToc();
  var content = document.getElementById('guide-content');
  if (!content) return;

  if (guideState.pageCache[file]) {
    renderGuideMarkdown(content, guideState.pageCache[file], file);
    return;
  }

  content.innerHTML = '<div class="guide-loading">Loading…</div>';
  fetch('/docs/page?file=' + encodeURIComponent(file)).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(function(md) {
    guideState.pageCache[file] = md;
    renderGuideMarkdown(content, md, file);
  }).catch(function(err) {
    content.innerHTML = '<div class="guide-error">Failed to load ' + esc(file) + ': ' + esc(String(err && err.message || err)) + '</div>';
  });
}

function renderGuideMarkdown(container, md, file) {
  var html = renderMarkdown(md);
  container.innerHTML = '<div class="guide-prose">' + html + '</div>';
  container.scrollTop = 0;

  // Intercept relative links between guide pages
  var links = container.querySelectorAll('a[href]');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (!href || /^(https?:|mailto:|#)/.test(href)) continue;
    links[i].addEventListener('click', function(e) {
      e.preventDefault();
      var target = this.getAttribute('href');
      // Resolve relative to current file's directory
      var resolved = resolveGuidePath(file, target);
      if (resolved) loadGuidePage(resolved);
    });
  }
}

function resolveGuidePath(currentFile, target) {
  // target may be "../02-agents/syn.md" or "panels.md" etc.
  // Resolve against the directory of currentFile.
  var parts = currentFile.split('/');
  parts.pop(); // drop filename
  var targetParts = target.split('/');
  for (var i = 0; i < targetParts.length; i++) {
    var seg = targetParts[i];
    if (seg === '.' || seg === '') continue;
    if (seg === '..') { parts.pop(); continue; }
    parts.push(seg);
  }
  var resolved = parts.join('/');
  // Strip any anchor
  var hashIdx = resolved.indexOf('#');
  if (hashIdx !== -1) resolved = resolved.slice(0, hashIdx);
  return resolved;
}
