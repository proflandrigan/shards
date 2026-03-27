// ═══════════════════════════════════════════════════════════════
// Quick file picker (Cmd+P)
// ═══════════════════════════════════════════════════════════════

var quickOpenIdx = -1;

function toggleQuickOpen() {
  var overlay = document.getElementById('quick-open-overlay');
  var isVisible = overlay.classList.contains('visible');
  if (isVisible) {
    overlay.classList.remove('visible');
    return;
  }
  overlay.classList.add('visible');
  var input = document.getElementById('quick-open-input');
  input.value = '';
  input.focus();
  quickOpenIdx = -1;
  renderQuickOpenResults('');
}

function getQuickOpenCandidates() {
  // Combine open tabs + session-touched files, deduped
  var seen = {};
  var items = [];
  // Open tabs first (most accessible)
  for (var i = 0; i < fileTabOrder.length; i++) {
    if (!seen[fileTabOrder[i]]) {
      items.push(fileTabOrder[i]);
      seen[fileTabOrder[i]] = true;
    }
  }
  // Session files
  sessionTouchedFiles.forEach(function(f) {
    if (!seen[f]) {
      items.push(f);
      seen[f] = true;
    }
  });
  return items;
}

function fuzzyMatch(query, str) {
  query = query.toLowerCase();
  str = str.toLowerCase();
  if (!query) return true;
  // Simple substring match — good enough for small file lists
  return str.indexOf(query) !== -1;
}

function renderQuickOpenResults(query) {
  var container = document.getElementById('quick-open-results');

  // Symbol search mode: @ prefix
  if (query.startsWith('@')) {
    var symbolQuery = query.substring(1);
    if (symbolQuery.length < 1) {
      container.innerHTML = '<div class="overlay-empty">Type a symbol name to search...</div>';
      return;
    }
    renderSymbolSearchResults(container, symbolQuery);
    return;
  }

  var candidates = getQuickOpenCandidates();
  var filtered = candidates.filter(function(f) { return fuzzyMatch(query, f); });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="overlay-empty">' + (candidates.length === 0 ? 'No files in session yet' : 'No matches') + '</div>';
    return;
  }

  container.innerHTML = '';
  for (var i = 0; i < filtered.length; i++) {
    var item = document.createElement('div');
    item.className = 'overlay-item' + (i === quickOpenIdx ? ' active' : '');
    item.textContent = filtered[i];
    item.addEventListener('click', (function(path) {
      return function() {
        document.getElementById('quick-open-overlay').classList.remove('visible');
        openFileFromExplorer(path);
      };
    })(filtered[i]));
    container.appendChild(item);
  }
}

var symbolSearchDebounce = null;

function renderSymbolSearchResults(container, prefix) {
  // Debounce server calls
  if (symbolSearchDebounce) clearTimeout(symbolSearchDebounce);
  symbolSearchDebounce = setTimeout(function() {
    var currentFile = (typeof getCurrentFileKey === 'function' ? getCurrentFileKey() : '') || '';
    authFetch('/symbols/completions?prefix=' + encodeURIComponent(prefix) + '&file=' + encodeURIComponent(currentFile))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.completions || data.completions.length === 0) {
          container.innerHTML = '<div class="overlay-empty">No symbols matching "' + esc(prefix) + '"</div>';
          return;
        }
        container.innerHTML = '';
        for (var i = 0; i < data.completions.length; i++) {
          var comp = data.completions[i];
          var item = document.createElement('div');
          item.className = 'overlay-item' + (i === quickOpenIdx ? ' active' : '');
          var badge = typeof kindBadge === 'function' ? kindBadge(comp.kind) : comp.kind;
          var badgeClass = typeof kindBadgeClass === 'function' ? kindBadgeClass(comp.kind) : 'ci-badge-other';
          item.innerHTML = '<span class="ci-badge ' + badgeClass + '">' + esc(badge) + '</span> ' +
            '<span class="ci-symbol-name">' + esc(comp.name) + '</span>' +
            (comp.detail ? '<span class="ci-symbol-sig">' + esc(comp.detail) + '</span>' : '') +
            '<span class="ci-symbol-file">' + esc(comp.file) + ':' + comp.line + '</span>';
          item.addEventListener('click', (function(file, line) {
            return function() {
              document.getElementById('quick-open-overlay').classList.remove('visible');
              navigateToDefinition(file, line);
            };
          })(comp.file, comp.line));
          container.appendChild(item);
        }
      })
      .catch(function() {
        container.innerHTML = '<div class="overlay-empty">Symbol search unavailable</div>';
      });
  }, 150);
}

document.getElementById('quick-open-input').addEventListener('input', function() {
  quickOpenIdx = -1;
  renderQuickOpenResults(this.value);
});

document.getElementById('quick-open-input').addEventListener('keydown', function(e) {
  var container = document.getElementById('quick-open-results');
  var items = container.querySelectorAll('.overlay-item');

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    quickOpenIdx = Math.min(quickOpenIdx + 1, items.length - 1);
    updateQuickOpenActive(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    quickOpenIdx = Math.max(quickOpenIdx - 1, 0);
    updateQuickOpenActive(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (quickOpenIdx >= 0 && items[quickOpenIdx]) {
      items[quickOpenIdx].click();
    } else if (items.length > 0) {
      items[0].click();
    }
  } else if (e.key === 'Escape') {
    document.getElementById('quick-open-overlay').classList.remove('visible');
  }
});

function updateQuickOpenActive(items) {
  for (var i = 0; i < items.length; i++) {
    items[i].classList.toggle('active', i === quickOpenIdx);
  }
  if (items[quickOpenIdx]) {
    items[quickOpenIdx].scrollIntoView({ block: 'nearest' });
  }
}
