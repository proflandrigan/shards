// ═══════════════════════════════════════════════════════════════
// Knowledge Map — interactive project wiki panel
// ═══════════════════════════════════════════════════════════════

var knowledgeCache = null;
var kmActiveView = 'cards'; // 'cards' | 'graph'
var kmActiveFilters = { search: '', type: 'all', confidence: 'all' };
var kmShowNewForm = false;

// ─── YAML frontmatter parser ──────────────────────────────────

function kmParseFrontmatter(text) {
  var meta = {};
  var body = text;
  if (!text || !text.startsWith('---')) return { meta: meta, body: body };

  var endIdx = text.indexOf('---', 3);
  if (endIdx === -1) return { meta: meta, body: body };

  var yamlBlock = text.substring(3, endIdx).trim();
  body = text.substring(endIdx + 3).trim();

  var lines = yamlBlock.split('\n');
  var currentKey = null;
  var multilineValue = '';
  var inMultiline = false;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (inMultiline) {
      // Multiline block: indented lines belong to current key
      if (line.match(/^\s/) && (i + 1 >= lines.length || lines[i + 1].match(/^\s/) || !lines[i + 1].includes(':'))) {
        multilineValue += (multilineValue ? '\n' : '') + line.replace(/^\s{2}/, '');
        if (i === lines.length - 1) {
          meta[currentKey] = multilineValue;
        }
        continue;
      } else {
        meta[currentKey] = multilineValue;
        inMultiline = false;
        multilineValue = '';
      }
    }

    var colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    var key = line.substring(0, colonIdx).trim();
    var val = line.substring(colonIdx + 1).trim();

    if (val === '|') {
      currentKey = key;
      inMultiline = true;
      multilineValue = '';
      continue;
    }

    // Array: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      var inner = val.substring(1, val.length - 1);
      meta[key] = inner ? inner.split(',').map(function(s) { return s.trim(); }) : [];
    } else {
      meta[key] = val;
    }
  }

  return { meta: meta, body: body };
}

function kmRebuildFrontmatter(meta) {
  var lines = ['---'];
  var order = ['title', 'domain', 'source_project', 'contributed_by', 'date', 'type', 'confidence'];
  var written = {};

  for (var i = 0; i < order.length; i++) {
    var k = order[i];
    if (meta[k] === undefined) continue;
    lines.push(kmSerializeField(k, meta[k]));
    written[k] = true;
  }

  // Write any remaining keys not in standard order
  var keys = Object.keys(meta);
  for (var j = 0; j < keys.length; j++) {
    if (written[keys[j]]) continue;
    lines.push(kmSerializeField(keys[j], meta[keys[j]]));
  }

  lines.push('---');
  return lines.join('\n');
}

function kmSerializeField(key, val) {
  if (Array.isArray(val)) {
    return key + ': [' + val.join(', ') + ']';
  }
  if (typeof val === 'string' && val.indexOf('\n') !== -1) {
    return key + ': |\n' + val.split('\n').map(function(l) { return '  ' + l; }).join('\n');
  }
  return key + ': ' + val;
}

function kmSlugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
}

function kmIsStale(entry) {
  if (entry.meta.confidence === 'low') return true;
  if (!entry.meta.date) return false;
  var entryDate = new Date(entry.meta.date);
  var sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  return entryDate < sixMonthsAgo;
}

// ─── Data loading ─────────────────────────────────────────────

function kmLoadEntries() {
  return authFetch('/knowledge/entries').then(function(res) {
    return res.json();
  }).then(function(data) {
    var entries = [];
    for (var i = 0; i < data.entries.length; i++) {
      var e = data.entries[i];
      var parsed = kmParseFrontmatter(e.content);
      entries.push({
        path: e.path,
        meta: parsed.meta,
        body: parsed.body,
        raw: e.content,
      });
    }
    knowledgeCache = entries;
    return entries;
  });
}

// ─── Main renderer ────────────────────────────────────────────

function renderKnowledgeMapPanel(container, panel) {
  container.innerHTML = '';

  var wrapper = document.createElement('div');
  wrapper.className = 'km-panel';

  // Toolbar
  var toolbar = document.createElement('div');
  toolbar.className = 'km-toolbar';
  toolbar.innerHTML =
    '<input class="km-search" type="text" placeholder="Search entries..." value="' + esc(kmActiveFilters.search) + '">' +
    '<div class="km-filter-group">' +
      '<button class="km-filter-chip' + (kmActiveFilters.type === 'all' ? ' active' : '') + '" data-type="all">All</button>' +
      '<button class="km-filter-chip' + (kmActiveFilters.type === 'entities' ? ' active' : '') + '" data-type="entities">Entities</button>' +
      '<button class="km-filter-chip' + (kmActiveFilters.type === 'infrastructure' ? ' active' : '') + '" data-type="infrastructure">Infra</button>' +
      '<button class="km-filter-chip' + (kmActiveFilters.type === 'patterns' ? ' active' : '') + '" data-type="patterns">Patterns</button>' +
      '<button class="km-filter-chip' + (kmActiveFilters.type === 'features' ? ' active' : '') + '" data-type="features">Features</button>' +
    '</div>' +
    '<div class="km-toolbar-actions">' +
      '<button class="km-btn" id="km-rebuild-idx" title="Rebuild INDEX.md from disk">Rebuild Index</button>' +
      '<button class="km-btn" id="km-view-toggle">' + (kmActiveView === 'cards' ? 'Graph View' : 'Card View') + '</button>' +
      '<button class="km-btn km-btn-primary" id="km-add-btn">+ Add Entry</button>' +
    '</div>';
  wrapper.appendChild(toolbar);

  // Content area
  var content = document.createElement('div');
  content.className = 'km-content';
  content.id = 'km-content-area';
  wrapper.appendChild(content);

  container.appendChild(wrapper);

  // Wire toolbar events
  var searchInput = toolbar.querySelector('.km-search');
  var debounceTimer = null;
  searchInput.addEventListener('input', function() {
    kmActiveFilters.search = this.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() { kmRefreshContent(content); }, 200);
  });

  var chips = toolbar.querySelectorAll('.km-filter-chip');
  for (var i = 0; i < chips.length; i++) {
    chips[i].addEventListener('click', function() {
      kmActiveFilters.type = this.getAttribute('data-type');
      for (var j = 0; j < chips.length; j++) chips[j].classList.remove('active');
      this.classList.add('active');
      kmRefreshContent(content);
    });
  }

  document.getElementById('km-view-toggle').addEventListener('click', function() {
    kmActiveView = kmActiveView === 'cards' ? 'graph' : 'cards';
    this.textContent = kmActiveView === 'cards' ? 'Graph View' : 'Card View';
    kmRefreshContent(content);
  });

  document.getElementById('km-add-btn').addEventListener('click', function() {
    kmShowNewForm = true;
    kmRefreshContent(content);
  });

  document.getElementById('km-rebuild-idx').addEventListener('click', function() {
    if (!knowledgeCache) return;
    kmUpdateIndex(knowledgeCache).then(function() {
      alert('INDEX.md rebuilt successfully.');
    });
  });

  // Load and render
  content.innerHTML = '<div class="km-empty-state"><p>Loading...</p></div>';
  kmLoadEntries().then(function() {
    kmRefreshContent(content);
  }).catch(function(err) {
    content.innerHTML = '<div class="km-empty-state"><h3>Failed to load knowledge entries</h3><p>' + esc(String(err)) + '</p></div>';
  });
}

function kmRefreshContent(contentEl) {
  if (!contentEl) return;
  contentEl.innerHTML = '';

  if (kmShowNewForm) {
    kmRenderNewEntryForm(contentEl);
    return;
  }

  var entries = knowledgeCache || [];

  if (entries.length === 0) {
    contentEl.innerHTML =
      '<div class="km-empty-state">' +
        '<div class="km-empty-icon">&#9671;</div>' +
        '<h3>No knowledge entries yet</h3>' +
        '<p>The Knowledge Ledger is where agents store reusable facts about your project — entity relationships, infrastructure quirks, SQL patterns, and verified features.</p>' +
        '<button class="km-btn km-btn-primary" onclick="kmShowNewForm=true;kmRefreshContent(document.getElementById(\'km-content-area\'))">Create First Entry</button>' +
      '</div>';
    return;
  }

  if (kmActiveView === 'graph') {
    kmRenderGraph(contentEl, kmFilterEntries(entries));
  } else {
    kmRenderCards(contentEl, kmFilterEntries(entries));
  }
}

function kmFilterEntries(entries) {
  var result = [];
  var search = kmActiveFilters.search.toLowerCase();
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    // Hide superseded entries unless searching explicitly
    if (e.meta.superseded === 'true' && !search) continue;
    if (kmActiveFilters.type !== 'all' && e.meta.type !== kmActiveFilters.type) continue;
    if (search) {
      var doms = Array.isArray(e.meta.domain) ? e.meta.domain : (e.meta.domain ? [e.meta.domain] : []);
      var haystack = ((e.meta.title || '') + ' ' + e.body + ' ' + doms.join(' ')).toLowerCase();
      if (haystack.indexOf(search) === -1) continue;
    }
    result.push(e);
  }
  return result;
}

// ─── Card view ────────────────────────────────────────────────

function kmRenderCards(contentEl, entries) {
  var types = ['entities', 'infrastructure', 'patterns', 'features'];
  var grouped = {};
  for (var t = 0; t < types.length; t++) grouped[types[t]] = [];
  for (var i = 0; i < entries.length; i++) {
    var type = entries[i].meta.type || 'patterns';
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(entries[i]);
  }

  var hasAny = false;
  for (var ti = 0; ti < types.length; ti++) {
    var typeEntries = grouped[types[ti]];
    if (typeEntries.length === 0) continue;
    hasAny = true;

    var section = document.createElement('div');
    section.className = 'km-type-section';

    var header = document.createElement('div');
    header.className = 'km-type-header';
    header.textContent = types[ti] + ' (' + typeEntries.length + ')';
    section.appendChild(header);

    var grid = document.createElement('div');
    grid.className = 'km-card-grid';

    for (var j = 0; j < typeEntries.length; j++) {
      grid.appendChild(kmCreateCard(typeEntries[j]));
    }

    section.appendChild(grid);
    contentEl.appendChild(section);
  }

  if (!hasAny) {
    contentEl.innerHTML = '<div class="km-empty-state"><h3>No entries match filters</h3></div>';
  }
}

function kmCreateCard(entry) {
  var card = document.createElement('div');
  card.className = 'km-card';
  card.setAttribute('data-path', entry.path);

  var domains = Array.isArray(entry.meta.domain) ? entry.meta.domain : (entry.meta.domain ? [entry.meta.domain] : []);
  var confidence = entry.meta.confidence || 'medium';
  var type = entry.meta.type || 'patterns';
  var stale = kmIsStale(entry);

  // Preview: strip markdown, take first ~80 chars
  var previewText = entry.body.replace(/[#*`_\[\]]/g, '').substring(0, 100);

  card.innerHTML =
    '<div class="km-card-top">' +
      '<span class="km-type-badge ' + esc(type) + '">' + esc(type) + '</span>' +
      '<span class="km-card-title" title="' + esc(entry.meta.title || '') + '">' + esc(entry.meta.title || 'Untitled') + '</span>' +
      '<span class="km-confidence-dot ' + esc(confidence) + '" title="Confidence: ' + esc(confidence) + '"></span>' +
    '</div>' +
    '<div class="km-card-meta">' +
      domains.map(function(d) { return '<span class="km-domain-tag">' + esc(d) + '</span>'; }).join('') +
      '<span class="km-card-date">' + esc(entry.meta.date || '') +
        (stale ? ' <span class="km-stale-badge">Stale</span>' : '') +
      '</span>' +
    '</div>' +
    '<div class="km-card-preview">' + esc(previewText) + '</div>';

  card.addEventListener('click', function(e) {
    if (card.classList.contains('expanded')) return;
    kmExpandCard(card, entry);
  });

  return card;
}

function kmExpandCard(card, entry) {
  card.classList.add('expanded');
  var domains = Array.isArray(entry.meta.domain) ? entry.meta.domain : (entry.meta.domain ? [entry.meta.domain] : []);
  var confidence = entry.meta.confidence || 'medium';
  var type = entry.meta.type || 'patterns';

  var formHtml =
    '<div class="km-card-top">' +
      '<span class="km-type-badge ' + esc(type) + '">' + esc(type) + '</span>' +
      '<span class="km-card-title">' + esc(entry.meta.title || 'Untitled') + '</span>' +
      '<span class="km-confidence-dot ' + esc(confidence) + '"></span>' +
    '</div>' +
    '<div class="km-edit-form">' +
      '<div class="km-field-row">' +
        '<div class="km-field"><label>Title</label><input type="text" class="km-edit-title" value="' + esc(entry.meta.title || '') + '"></div>' +
        '<div class="km-field"><label>Type</label>' +
          '<select class="km-edit-type">' +
            '<option value="entities"' + (type === 'entities' ? ' selected' : '') + '>Entities</option>' +
            '<option value="infrastructure"' + (type === 'infrastructure' ? ' selected' : '') + '>Infrastructure</option>' +
            '<option value="patterns"' + (type === 'patterns' ? ' selected' : '') + '>Patterns</option>' +
            '<option value="features"' + (type === 'features' ? ' selected' : '') + '>Features</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="km-field-row">' +
        '<div class="km-field"><label>Domains (comma-separated)</label><input type="text" class="km-edit-domains" value="' + esc(domains.join(', ')) + '"></div>' +
        '<div class="km-field"><label>Confidence</label>' +
          '<select class="km-edit-confidence">' +
            '<option value="high"' + (confidence === 'high' ? ' selected' : '') + '>High</option>' +
            '<option value="medium"' + (confidence === 'medium' ? ' selected' : '') + '>Medium</option>' +
            '<option value="low"' + (confidence === 'low' ? ' selected' : '') + '>Low</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="km-field"><label>Content</label><textarea class="km-edit-body">' + esc(entry.body) + '</textarea></div>' +
      '<div class="km-preview-label">Preview</div>' +
      '<div class="km-preview-area"></div>' +
      '<div class="km-edit-actions">' +
        '<button class="km-btn km-btn-primary km-save-btn">Save</button>' +
        '<button class="km-btn km-cancel-btn">Cancel</button>' +
        '<button class="km-btn km-btn-danger km-supersede-btn">Mark Superseded</button>' +
      '</div>' +
    '</div>';

  card.innerHTML = formHtml;

  // Live preview
  var textarea = card.querySelector('.km-edit-body');
  var previewArea = card.querySelector('.km-preview-area');
  function updatePreview() {
    if (typeof marked !== 'undefined') {
      previewArea.innerHTML = marked.parse(textarea.value);
    } else {
      previewArea.textContent = textarea.value;
    }
  }
  textarea.addEventListener('input', updatePreview);
  updatePreview();

  // Save
  card.querySelector('.km-save-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    var newMeta = Object.assign({}, entry.meta);
    newMeta.title = card.querySelector('.km-edit-title').value.trim();
    newMeta.type = card.querySelector('.km-edit-type').value;
    newMeta.confidence = card.querySelector('.km-edit-confidence').value;
    var domainStr = card.querySelector('.km-edit-domains').value;
    newMeta.domain = domainStr ? domainStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
    var newBody = textarea.value;

    // If type changed, we need to write to new path and blank the old file
    var oldType = entry.meta.type || 'patterns';
    var newType = newMeta.type;
    if (oldType !== newType) {
      var filename = entry.path.split('/').pop();
      var newPath = '.shards/knowledge/' + newType + '/' + filename;
      var content = kmRebuildFrontmatter(newMeta) + '\n\n' + newBody;
      // Write new file, then mark old file as moved (redirect stub)
      authFetch('/browse/file/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newPath, content: content }),
      }).then(function() {
        // Write a stub so the old path isn't an orphan empty file
        var stub = '---\nsuperseded: true\nmoved_to: ' + newPath + '\n---\n\nMoved to ' + newPath + '\n';
        return authFetch('/browse/file/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: entry.path, content: stub }),
        });
      }).then(function() {
        entry.path = newPath;
        entry.meta = newMeta;
        entry.body = newBody;
        entry.raw = content;
        return kmUpdateIndex(knowledgeCache);
      }).then(function() {
        kmRefreshContent(document.getElementById('km-content-area'));
      });
    } else {
      kmSaveEntry(entry, newMeta, newBody).then(function() {
        kmRefreshContent(document.getElementById('km-content-area'));
      });
    }
  });

  // Cancel
  card.querySelector('.km-cancel-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    kmRefreshContent(document.getElementById('km-content-area'));
  });

  // Mark superseded
  card.querySelector('.km-supersede-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    kmConfirm('Mark this entry as superseded?', function() {
      var newMeta = Object.assign({}, entry.meta);
      newMeta.superseded = 'true';
      kmSaveEntry(entry, newMeta, entry.body).then(function() {
        kmRefreshContent(document.getElementById('km-content-area'));
      });
    });
  });

  // Prevent card click from collapsing
  card.querySelector('.km-edit-form').addEventListener('click', function(e) {
    e.stopPropagation();
  });
}

// ─── Persistence ──────────────────────────────────────────────

function kmSaveEntry(entry, newMeta, newBody) {
  var content = kmRebuildFrontmatter(newMeta) + '\n\n' + newBody;

  return authFetch('/browse/file/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: entry.path, content: content }),
  }).then(function() {
    // Only update cache after successful save
    entry.meta = newMeta;
    entry.body = newBody;
    entry.raw = content;
    return kmUpdateIndex(knowledgeCache);
  });
}

function kmCreateEntry(meta, body) {
  var slug = kmSlugify(meta.title || 'untitled');
  var category = meta.type || 'patterns';
  var filePath = '.shards/knowledge/' + category + '/' + slug + '.md';

  // Check for conflicts in cache
  if (knowledgeCache) {
    var existing = knowledgeCache.filter(function(e) { return e.path === filePath; });
    if (existing.length > 0) {
      var v = 2;
      while (knowledgeCache.some(function(e) { return e.path === '.shards/knowledge/' + category + '/' + slug + '_v' + v + '.md'; })) v++;
      slug = slug + '_v' + v;
      filePath = '.shards/knowledge/' + category + '/' + slug + '.md';
    }
  }

  if (!meta.date) {
    var d = new Date();
    meta.date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  var content = kmRebuildFrontmatter(meta) + '\n\n' + body;
  var newEntry = { path: filePath, meta: meta, body: body, raw: content };

  return authFetch('/browse/file/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content: content }),
  }).then(function() {
    if (!knowledgeCache) knowledgeCache = [];
    knowledgeCache.push(newEntry);
    return kmUpdateIndex(knowledgeCache);
  });
}

function kmUpdateIndex(entries) {
  var lines = [
    '# Knowledge Ledger — Index',
    '',
    '| Date | Type | Title | Domains | Confidence | File |',
    '|------|------|-------|---------|------------|------|',
  ];

  // Sort by date descending
  var sorted = entries.slice().sort(function(a, b) {
    return (b.meta.date || '').localeCompare(a.meta.date || '');
  });

  for (var i = 0; i < sorted.length; i++) {
    var e = sorted[i];
    var domains = Array.isArray(e.meta.domain) ? e.meta.domain.join(', ') : (e.meta.domain || '');
    lines.push(
      '| ' + (e.meta.date || '') +
      ' | ' + (e.meta.type || '') +
      ' | ' + (e.meta.title || '') +
      ' | ' + domains +
      ' | ' + (e.meta.confidence || '') +
      ' | ' + e.path + ' |'
    );
  }

  lines.push('');
  var content = lines.join('\n');

  return authFetch('/browse/file/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '.shards/knowledge/INDEX.md', content: content }),
  });
}

// ─── New entry form ───────────────────────────────────────────

function kmRenderNewEntryForm(contentEl) {
  var form = document.createElement('div');
  form.className = 'km-new-entry-form';
  form.innerHTML =
    '<h3>New Knowledge Entry</h3>' +
    '<div class="km-edit-form">' +
      '<div class="km-field"><label>Title</label><input type="text" class="km-new-title" placeholder="e.g. Orders table grain is one row per order_id"></div>' +
      '<div class="km-field-row">' +
        '<div class="km-field"><label>Type</label>' +
          '<select class="km-new-type">' +
            '<option value="entities">Entities</option>' +
            '<option value="infrastructure">Infrastructure</option>' +
            '<option value="patterns">Patterns</option>' +
            '<option value="features">Features</option>' +
          '</select>' +
        '</div>' +
        '<div class="km-field"><label>Confidence</label>' +
          '<select class="km-new-confidence">' +
            '<option value="high">High</option>' +
            '<option value="medium" selected>Medium</option>' +
            '<option value="low">Low</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div class="km-field"><label>Domains (comma-separated)</label><input type="text" class="km-new-domains" placeholder="e.g. orders, analytics, dbt"></div>' +
      '<div class="km-field"><label>Source Project</label><input type="text" class="km-new-source" placeholder="e.g. studies/churn_analysis or Manual entry"></div>' +
      '<div class="km-field"><label>Content (3-10 lines, specific and actionable)</label><textarea class="km-new-body" placeholder="Include table names, column names, SQL, or system names. Vague entries are less useful."></textarea></div>' +
      '<div class="km-preview-label">Preview</div>' +
      '<div class="km-preview-area"></div>' +
      '<div class="km-edit-actions">' +
        '<button class="km-btn km-btn-primary km-create-btn">Create Entry</button>' +
        '<button class="km-btn km-new-cancel-btn">Cancel</button>' +
      '</div>' +
    '</div>';

  contentEl.appendChild(form);

  // Live preview
  var textarea = form.querySelector('.km-new-body');
  var previewArea = form.querySelector('.km-preview-area');
  textarea.addEventListener('input', function() {
    if (typeof marked !== 'undefined') {
      previewArea.innerHTML = marked.parse(textarea.value);
    } else {
      previewArea.textContent = textarea.value;
    }
  });

  // Create
  form.querySelector('.km-create-btn').addEventListener('click', function() {
    var title = form.querySelector('.km-new-title').value.trim();
    if (!title) { alert('Title is required.'); return; }

    var body = textarea.value.trim();
    if (!body) { alert('Content is required.'); return; }

    var domainStr = form.querySelector('.km-new-domains').value;
    var meta = {
      title: title,
      domain: domainStr ? domainStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [],
      source_project: form.querySelector('.km-new-source').value.trim() || 'Manual entry',
      contributed_by: 'User (via UI)',
      date: '',
      type: form.querySelector('.km-new-type').value,
      confidence: form.querySelector('.km-new-confidence').value,
    };

    kmCreateEntry(meta, body).then(function() {
      kmShowNewForm = false;
      kmRefreshContent(document.getElementById('km-content-area'));
    });
  });

  // Cancel
  form.querySelector('.km-new-cancel-btn').addEventListener('click', function() {
    kmShowNewForm = false;
    kmRefreshContent(document.getElementById('km-content-area'));
  });
}

// ─── Graph view ───────────────────────────────────────────────

function kmRenderGraph(contentEl, entries) {
  if (entries.length === 0) {
    contentEl.innerHTML = '<div class="km-empty-state"><h3>No entries to graph</h3></div>';
    return;
  }

  if (typeof mermaid === 'undefined') {
    contentEl.innerHTML = '<div class="km-empty-state"><h3>Mermaid.js not loaded</h3><p>Cannot render knowledge graph.</p></div>';
    return;
  }

  var edges = kmDeriveRelationships(entries);
  var def = kmBuildMermaidDef(entries, edges);

  var viewport = document.createElement('div');
  viewport.className = 'km-graph-viewport diagram-viewport';

  var canvas = document.createElement('div');
  canvas.className = 'km-graph-canvas diagram-canvas';

  var diagramId = 'km-graph-' + Date.now();
  var mermaidDiv = document.createElement('div');
  mermaidDiv.className = 'mermaid';
  mermaidDiv.id = diagramId;
  mermaidDiv.textContent = def;

  canvas.appendChild(mermaidDiv);
  viewport.appendChild(canvas);

  // Controls
  var controls = document.createElement('div');
  controls.className = 'diagram-controls';
  controls.innerHTML =
    '<button class="diagram-ctrl-btn" title="Zoom in" data-action="zoom-in">+</button>' +
    '<span class="diagram-zoom-label">100%</span>' +
    '<button class="diagram-ctrl-btn" title="Zoom out" data-action="zoom-out">&minus;</button>' +
    '<button class="diagram-ctrl-btn" title="Fit to view" data-action="fit">&#9638;</button>';
  viewport.appendChild(controls);
  contentEl.appendChild(viewport);

  // Force full height
  viewport.style.height = '100%';
  viewport.style.minHeight = '400px';

  mermaid.initialize({
    startOnLoad: false,
    theme: document.documentElement.getAttribute('data-theme') !== 'light' ? 'dark' : 'default',
    securityLevel: 'loose',
  });

  var graphState = { panX: 0, panY: 0, scale: 1, lastContent: null };

  try {
    var result = mermaid.run({ nodes: [document.getElementById(diagramId)] });
    var afterRender = function() {
      if (typeof fitDiagramToView === 'function') {
        fitDiagramToView(viewport, canvas, graphState, controls);
      }
      // Attach click handlers to nodes
      kmAttachGraphClicks(viewport, entries);
    };

    if (result && typeof result.then === 'function') {
      result.then(afterRender);
    } else {
      afterRender();
    }
  } catch(e) {
    contentEl.innerHTML = '<div class="km-empty-state"><h3>Failed to render graph</h3><p>' + esc(e.message) + '</p></div>';
    return;
  }

  if (typeof initDiagramPanZoom === 'function') {
    initDiagramPanZoom(viewport, canvas, graphState, controls);
  }
}

function kmDeriveRelationships(entries) {
  var edges = [];
  var seen = {};

  for (var i = 0; i < entries.length; i++) {
    var a = entries[i];
    var aDomains = Array.isArray(a.meta.domain) ? a.meta.domain : (a.meta.domain ? [a.meta.domain] : []);

    for (var j = i + 1; j < entries.length; j++) {
      var b = entries[j];
      var bDomains = Array.isArray(b.meta.domain) ? b.meta.domain : (b.meta.domain ? [b.meta.domain] : []);
      var key = a.path + '::' + b.path;
      if (seen[key]) continue;

      // Shared domains
      for (var d = 0; d < aDomains.length; d++) {
        if (bDomains.indexOf(aDomains[d]) !== -1) {
          edges.push({ from: a.path, to: b.path, label: aDomains[d], type: 'domain' });
          seen[key] = true;
          break;
        }
      }
      if (seen[key]) continue;

      // Content cross-references (title mentions)
      var aTitle = (a.meta.title || '').toLowerCase();
      var bTitle = (b.meta.title || '').toLowerCase();
      var aBody = (a.body || '').toLowerCase();
      var bBody = (b.body || '').toLowerCase();

      if (aTitle.length > 4 && bBody.indexOf(aTitle) !== -1) {
        edges.push({ from: b.path, to: a.path, label: 'references', type: 'reference' });
        seen[key] = true;
        continue;
      }
      if (bTitle.length > 4 && aBody.indexOf(bTitle) !== -1) {
        edges.push({ from: a.path, to: b.path, label: 'references', type: 'reference' });
        seen[key] = true;
        continue;
      }

      // Same source_project
      if (a.meta.source_project && b.meta.source_project &&
          a.meta.source_project === b.meta.source_project &&
          a.meta.source_project !== 'Manual entry') {
        edges.push({ from: a.path, to: b.path, label: '', type: 'project' });
        seen[key] = true;
      }
    }
  }

  return edges;
}

function kmBuildMermaidDef(entries, edges) {
  var TYPE_ICONS = { entities: '🔷', infrastructure: '🔧', patterns: '🧩', features: '⭐' };
  var lines = ['graph LR'];

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var nodeId = kmNodeId(e.path);
    var icon = TYPE_ICONS[e.meta.type] || '▪';
    var label = icon + ' ' + (e.meta.title || 'Untitled').replace(/["[\](){}|<>#&]/g, ' ');
    lines.push('  ' + nodeId + '["' + label + '"]');
  }

  for (var j = 0; j < edges.length; j++) {
    var edge = edges[j];
    var fromId = kmNodeId(edge.from);
    var toId = kmNodeId(edge.to);

    if (edge.type === 'domain') {
      var safeLabel = (edge.label || '').replace(/[|[\]"]/g, ' ');
      lines.push('  ' + fromId + ' --- |' + safeLabel + '| ' + toId);
    } else if (edge.type === 'reference') {
      lines.push('  ' + fromId + ' --> |references| ' + toId);
    } else {
      lines.push('  ' + fromId + ' -.- ' + toId);
    }
  }

  // Style classes
  lines.push('  classDef entity fill:#0e1e3a,stroke:#4a8ae8,color:#4a8ae8');
  lines.push('  classDef infra fill:#1e0e2a,stroke:#9a6ac8,color:#9a6ac8');
  lines.push('  classDef pattern fill:#0e2a1a,stroke:#4ac87a,color:#4ac87a');
  lines.push('  classDef feature fill:#2a1e0a,stroke:#c8a04a,color:#c8a04a');

  for (var k = 0; k < entries.length; k++) {
    var ent = entries[k];
    var nId = kmNodeId(ent.path);
    var cls = { entities: 'entity', infrastructure: 'infra', patterns: 'pattern', features: 'feature' }[ent.meta.type];
    if (cls) lines.push('  class ' + nId + ' ' + cls);
  }

  return lines.join('\n');
}

function kmNodeId(path) {
  // Convert file path to valid Mermaid node ID
  return 'n_' + path.replace(/[^a-zA-Z0-9]/g, '_');
}

function kmAttachGraphClicks(viewport, entries) {
  var nodes = viewport.querySelectorAll('.node');
  for (var i = 0; i < nodes.length; i++) {
    (function(node) {
      node.style.cursor = 'pointer';
      node.addEventListener('click', function() {
        var nodeId = node.id;
        // Find matching entry
        for (var j = 0; j < entries.length; j++) {
          if (kmNodeId(entries[j].path) === nodeId) {
            // Switch to card view and scroll to that entry
            kmActiveView = 'cards';
            var toggle = document.getElementById('km-view-toggle');
            if (toggle) toggle.textContent = 'Graph View';
            kmRefreshContent(document.getElementById('km-content-area'));
            // After render, find and expand the card
            setTimeout(function() {
              var card = document.querySelector('.km-card[data-path="' + entries[j].path + '"]');
              if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                kmExpandCard(card, entries[j]);
              }
            }, 100);
            break;
          }
        }
      });
    })(nodes[i]);
  }
}

// ─── Confirmation dialog ──────────────────────────────────────

function kmConfirm(message, onConfirm) {
  var overlay = document.createElement('div');
  overlay.className = 'km-confirm-overlay';
  overlay.innerHTML =
    '<div class="km-confirm-box">' +
      '<p>' + esc(message) + '</p>' +
      '<div class="km-edit-actions">' +
        '<button class="km-btn km-btn-danger km-confirm-yes">Yes</button>' +
        '<button class="km-btn km-confirm-no">Cancel</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector('.km-confirm-yes').addEventListener('click', function() {
    document.body.removeChild(overlay);
    onConfirm();
  });
  overlay.querySelector('.km-confirm-no').addEventListener('click', function() {
    document.body.removeChild(overlay);
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) document.body.removeChild(overlay);
  });
}

// ─── Panel lifecycle ──────────────────────────────────────────

function cleanupKnowledgeMap(panel) {
  // Reset state for fresh render
  knowledgeCache = null;
}

function openKnowledgeMapPanel() {
  kmActiveView = 'cards';
  kmActiveFilters = { search: '', type: 'all', confidence: 'all' };
  kmShowNewForm = false;
  knowledgeCache = null;
  openPanelTab('knowledge-map-main', {
    panel: 'knowledge-map',
    title: 'Knowledge Map',
    data: null,
  });
}
