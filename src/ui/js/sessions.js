// ═══════════════════════════════════════════════════════════════
// Sessions sidebar panel
//
// Lists every session recorded in .shards/sessions/INDEX.json (active,
// ended, abandoned). Distinct from the timeline panel — that one shows
// live activity for in-memory sessions; this one is the durable history
// browser. Click a row to resume; click End Chat in the header to end
// the currently active session.
// ═══════════════════════════════════════════════════════════════

var sessionsIndexCache = { sessions: [], fetchedAt: 0 };
var sessionsFilter = { status: null }; // null = all

var SESSIONS_STATUS_LABEL = {
  active: 'live',
  stalled: 'stalled',
  ended: 'ended',
  abandoned: 'abandoned',
};

function fetchSessionsIndex() {
  return authFetch('/sessions/index').then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function(data) {
    sessionsIndexCache = { sessions: data.sessions || [], fetchedAt: Date.now() };
    return sessionsIndexCache;
  });
}

function formatSessionTime(iso) {
  if (!iso) return '';
  try {
    if (typeof formatRelativeTime === 'function') return formatRelativeTime(iso);
    var d = new Date(iso);
    return d.toLocaleString();
  } catch (e) {
    return '';
  }
}

function groupSessionsByProject(rows) {
  var groups = {};
  var order = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = r.projectDir || r.projectName || '__none__';
    if (!groups[key]) {
      groups[key] = { label: r.projectDir || r.projectName || null, rows: [] };
      order.push(key);
    }
    groups[key].rows.push(r);
  }
  return { order: order, groups: groups };
}

function renderSessionRow(row) {
  var info = (typeof AGENTS !== 'undefined' && AGENTS[row.agent])
    ? AGENTS[row.agent]
    : { color: '#666', label: row.agent || 'unknown' };

  // The disk record's status field can disagree with what the server reports
  // as live in-memory. The annotated `active` boolean is authoritative for
  // live state. A disk-active row with no live process (e.g., server restarted
  // before the sweep window elapsed) is rendered as "stalled" so the user can
  // tell it apart from a truly live chat — it's still resumable.
  var statusKey;
  if (row.active) {
    statusKey = 'active';
  } else if (row.status === 'active') {
    statusKey = 'stalled';
  } else {
    statusKey = row.status;
  }
  var statusLabel = SESSIONS_STATUS_LABEL[statusKey] || statusKey || '';
  var statusClass = row.active ? 'live' : (statusKey || 'ended');

  var meta = [];
  if (typeof row.phase === 'number') meta.push('<span class="phase-chip">phase ' + row.phase + '</span>');
  meta.push(formatSessionTime(row.lastActivityAt || row.createdAt));
  if (row.messageCount) meta.push(row.messageCount + ' msg');

  return (
    '<div class="session-row ' + esc(statusClass) + '" data-sid="' + esc(row.sessionId) + '">' +
      '<div class="session-row-top">' +
        '<span class="session-agent-dot" style="background:' + info.color + '"></span>' +
        '<span class="session-agent-label">' + esc(info.label || row.agent || '') + '</span>' +
        '<span class="session-status-pill ' + esc(statusClass) + '">' + esc(statusLabel) + '</span>' +
      '</div>' +
      '<div class="session-row-meta">' + meta.join(' · ') + '</div>' +
      (row.lastUserPrompt
        ? '<div class="session-row-prompt">' + esc(row.lastUserPrompt) + '</div>'
        : '') +
    '</div>'
  );
}

function renderSessions() {
  if (activeSidebarView !== 'sessions') return;
  var listEl = document.getElementById('sessions-list');
  var emptyEl = document.getElementById('sessions-empty');
  if (!listEl) return;

  var rows = sessionsIndexCache.sessions.slice();
  if (sessionsFilter.status) {
    rows = rows.filter(function(r) {
      if (sessionsFilter.status === 'active') return r.active;
      return r.status === sessionsFilter.status;
    });
  }

  if (rows.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  var grouped = groupSessionsByProject(rows);
  var html = '';
  for (var i = 0; i < grouped.order.length; i++) {
    var key = grouped.order[i];
    var g = grouped.groups[key];
    html += '<div class="sessions-project-group">';
    html += '<div class="sessions-project-label' + (g.label ? '' : ' no-project') + '">'
         + (g.label ? esc(g.label) : '(no project yet)')
         + '</div>';
    for (var j = 0; j < g.rows.length; j++) {
      html += renderSessionRow(g.rows[j]);
    }
    html += '</div>';
  }
  listEl.innerHTML = html;

  // Wire row clicks
  var rowsEls = listEl.querySelectorAll('.session-row');
  for (var k = 0; k < rowsEls.length; k++) {
    rowsEls[k].addEventListener('click', function(ev) {
      var sid = ev.currentTarget.getAttribute('data-sid');
      onSessionRowClick(sid);
    });
  }
}

function refreshSessions() {
  fetchSessionsIndex().then(renderSessions).catch(function() {
    // Network errors are common during reconnect — silent fail is acceptable
    // here since the panel will refresh on the next interval.
  });
}

function setSessionsFilter(status) {
  sessionsFilter.status = (sessionsFilter.status === status) ? null : status;
  var btns = document.querySelectorAll('.sessions-filter-btn');
  for (var i = 0; i < btns.length; i++) {
    var btn = btns[i];
    btn.classList.toggle('active', btn.getAttribute('data-status') === sessionsFilter.status);
  }
  renderSessions();
}

// ─── Resume flow ───────────────────────────────────────────

function onSessionRowClick(sessionId) {
  var row = null;
  for (var i = 0; i < sessionsIndexCache.sessions.length; i++) {
    if (sessionsIndexCache.sessions[i].sessionId === sessionId) {
      row = sessionsIndexCache.sessions[i];
      break;
    }
  }
  if (!row) return;

  // If this session is already live in the current UI, just switch to it.
  if (row.active && typeof chatSessions !== 'undefined' && chatSessions[sessionId]) {
    if (typeof switchSession === 'function') {
      switchSession(sessionId);
      return;
    }
  }

  showResumeModal(row);
}

function showResumeModal(row) {
  var modal = document.getElementById('resume-modal');
  if (!modal) return;
  document.getElementById('resume-modal-agent').textContent = row.agent || 'unknown';
  document.getElementById('resume-modal-project').textContent = row.projectDir || row.projectName || '(no project)';
  document.getElementById('resume-modal-phase').textContent = (typeof row.phase === 'number') ? ('phase ' + row.phase) : 'no phase recorded';
  document.getElementById('resume-modal-status').textContent = SESSIONS_STATUS_LABEL[row.status] || row.status || '';
  var preview = document.getElementById('resume-modal-prompt');
  if (row.lastUserPrompt) {
    preview.textContent = row.lastUserPrompt;
    preview.style.display = '';
  } else {
    preview.style.display = 'none';
  }
  modal.setAttribute('data-sid', row.sessionId);
  modal.setAttribute('data-agent', row.agent || '');
  modal.classList.add('visible');
}

function closeResumeModal() {
  var modal = document.getElementById('resume-modal');
  if (modal) modal.classList.remove('visible');
}

function confirmResume() {
  var modal = document.getElementById('resume-modal');
  if (!modal) return;
  var sid = modal.getAttribute('data-sid');
  var agent = modal.getAttribute('data-agent');
  closeResumeModal();
  if (typeof startNewSession === 'function') {
    startNewSession(agent, null, { resumeSessionId: sid });
  }
}

// ─── End Chat ──────────────────────────────────────────────

function updateEndChatButton() {
  var btn = document.getElementById('end-session-btn');
  if (!btn) return;
  var session = (typeof getActiveSession === 'function') ? getActiveSession() : null;
  btn.disabled = !session || !activeSessionId;
}

function endActiveSession() {
  if (!activeSessionId) return;
  if (!confirm('End this chat? You can resume it later from the Sessions panel.')) return;
  authFetch('/chat/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: activeSessionId }),
  }).then(function(r) {
    return r.json();
  }).then(function(data) {
    if (data && data.error) {
      addSystemNotice('End failed: ' + data.error);
      return;
    }
    refreshSessions();
  }).catch(function() {
    addSystemNotice('End failed — server unreachable.');
  });
}

// Refresh on a relaxed cadence — the events stream pushes updates the panel
// derives from, but the disk index is the source of truth so polling backs it
// up cheaply. The button keeps itself in sync at the same cadence so the
// End-Chat affordance doesn't lag a session-tab change.
setInterval(function() {
  if (activeSidebarView === 'sessions') refreshSessions();
  updateEndChatButton();
}, 5000);
