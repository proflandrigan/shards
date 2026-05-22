// ═══════════════════════════════════════════════════════════════
// Session Activity timeline (R3)
//
// Sidebar panel that lists every running session with a vertical event
// timeline. Helps disambiguate concurrent sessions of the same agent type
// (e.g., two data-analyst sessions on different projects).
//
// All data is in-memory on the ChatSessionState — appended by events.js as
// hook events arrive. This module only renders.
// ═══════════════════════════════════════════════════════════════

var TIMELINE_KIND_GLYPH = {
  start: '▶',
  tool: '⚙',
  file: '✎',
  consult: '↘',
  gate: '⏸',
  error: '⚠',
  log: '·',
  agent: '⤵',
  end: '■',
};

function formatTimelineTs(ts) {
  if (!ts) return '';
  try {
    var d = new Date(ts);
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  } catch (e) {
    return '';
  }
}

function timelineSessionHeader(session) {
  var info = (typeof AGENTS !== 'undefined' && AGENTS[session.agent])
    ? AGENTS[session.agent]
    : { color: '#666', label: session.agent };
  var label = session.title || info.label;
  if (session.projectName) label += ' · ' + session.projectName;

  var statusText = '';
  var statusClass = '';
  if (session.needsAttention) {
    statusText = 'attention';
    statusClass = 'attention';
  } else if (session.chatResponding) {
    statusText = 'live';
    statusClass = 'live';
  } else if (session.lastActivityAt) {
    statusText = (typeof formatRelativeTime === 'function')
      ? (formatRelativeTime(session.lastActivityAt) + ' idle')
      : '';
  }

  return (
    '<div class="timeline-session-header" data-sid="' + esc(session.sessionId) + '">' +
      '<span class="timeline-session-dot" style="background:' + info.color + '"></span>' +
      '<span class="timeline-session-label">' + esc(label) + '</span>' +
      (statusText
        ? '<span class="timeline-session-status ' + statusClass + '">' + esc(statusText) + '</span>'
        : '') +
    '</div>'
  );
}

function timelineEntryRow(entry) {
  var glyph = TIMELINE_KIND_GLYPH[entry.kind] || '·';
  var ts = formatTimelineTs(entry.ts);
  return (
    '<div class="timeline-entry kind-' + esc(entry.kind) + '">' +
      '<span class="timeline-entry-time">' + esc(ts) + '</span>' +
      '<span class="timeline-entry-glyph">' + glyph + '</span>' +
      '<span class="timeline-entry-label">' + esc(entry.label || '') + '</span>' +
    '</div>'
  );
}

function renderTimeline() {
  var listEl = document.getElementById('timeline-list');
  var emptyEl = document.getElementById('timeline-empty');
  var countEl = document.getElementById('timeline-session-count');
  if (!listEl) return;

  // Only render when this view is the active sidebar — saves a lot of work
  // since events.js calls renderTimeline on every signal-bearing event.
  if (activeSidebarView !== 'timeline') return;

  var sids = (typeof sessionOrder !== 'undefined') ? sessionOrder : [];
  if (!sids.length) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.add('visible');
    if (countEl) countEl.textContent = '';
    return;
  }
  if (emptyEl) emptyEl.classList.remove('visible');
  if (countEl) countEl.textContent = sids.length + ' session' + (sids.length === 1 ? '' : 's');

  var html = '';
  for (var i = 0; i < sids.length; i++) {
    var sid = sids[i];
    var session = chatSessions[sid];
    if (!session) continue;

    var isActive = (sid === activeSessionId);
    html += '<div class="timeline-session' + (isActive ? ' active' : '') + '">';
    html += timelineSessionHeader(session);

    var timeline = session.timeline || [];
    if (timeline.length === 0) {
      html += '<div class="timeline-empty-row">no activity yet</div>';
    } else {
      // Newest first — easier to scan when watching parallel sessions
      var entries = timeline.slice().reverse();
      html += '<div class="timeline-entries">';
      for (var j = 0; j < entries.length; j++) {
        html += timelineEntryRow(entries[j]);
      }
      html += '</div>';
    }
    html += '</div>';
  }
  listEl.innerHTML = html;

  // Click a session header to switch active session
  var headers = listEl.querySelectorAll('.timeline-session-header');
  for (var h = 0; h < headers.length; h++) {
    headers[h].addEventListener('click', (function(sidVal) {
      return function() {
        if (typeof switchSession === 'function' && sidVal !== activeSessionId) {
          switchSession(sidVal);
        }
      };
    })(headers[h].getAttribute('data-sid')));
  }
}
