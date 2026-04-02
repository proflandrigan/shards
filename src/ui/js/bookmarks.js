// ═══════════════════════════════════════════════════════════════
// Message Bookmarking
// ═══════════════════════════════════════════════════════════════

var BOOKMARKS_STORAGE_KEY = 'shards-bookmarks';

function loadBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_STORAGE_KEY) || '[]');
  } catch(e) {
    return [];
  }
}

function saveBookmarks(bookmarks) {
  localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
}

function getBookmarkId(sessionId, msgIdx) {
  return sessionId + ':' + msgIdx;
}

function isBookmarked(sessionId, msgIdx) {
  var bookmarks = loadBookmarks();
  var id = getBookmarkId(sessionId, msgIdx);
  for (var i = 0; i < bookmarks.length; i++) {
    if (bookmarks[i].id === id) return true;
  }
  return false;
}

function toggleBookmark(sessionId, msgIdx, role, agent, rawContent) {
  var bookmarks = loadBookmarks();
  var id = getBookmarkId(sessionId, msgIdx);
  var existing = -1;
  for (var i = 0; i < bookmarks.length; i++) {
    if (bookmarks[i].id === id) { existing = i; break; }
  }

  if (existing !== -1) {
    bookmarks.splice(existing, 1);
  } else {
    // Build a short preview from raw content
    var preview = (rawContent || '').replace(/[#*`_~\[\]]/g, '').trim();
    if (preview.length > 80) preview = preview.slice(0, 80) + '...';

    var info = AGENTS[agent] || { label: agent || 'Unknown' };
    var session = getSessionState(sessionId);
    var sessionTitle = (session && session.title) || info.label || 'Chat';

    bookmarks.push({
      id: id,
      sessionId: sessionId,
      msgIdx: msgIdx,
      role: role,
      agent: agent,
      preview: preview,
      sessionTitle: sessionTitle,
      timestamp: Date.now()
    });
  }

  saveBookmarks(bookmarks);
  updateBookmarkStarState(sessionId, msgIdx);
  renderBookmarksSidebar();
}

function updateBookmarkStarState(sessionId, msgIdx) {
  var starred = isBookmarked(sessionId, msgIdx);
  var messages = document.querySelectorAll('#messages .message');
  for (var i = 0; i < messages.length; i++) {
    var idx = messages[i].getAttribute('data-msg-idx');
    if (idx !== null && parseInt(idx) === msgIdx) {
      var star = messages[i].querySelector('.bookmark-star');
      if (star) {
        star.classList.toggle('bookmarked', starred);
        star.title = starred ? 'Remove bookmark' : 'Bookmark this message';
      }
      break;
    }
  }
}

function updateAllBookmarkStars() {
  if (!activeSessionId) return;
  var messages = document.querySelectorAll('#messages .message');
  for (var i = 0; i < messages.length; i++) {
    var idx = messages[i].getAttribute('data-msg-idx');
    if (idx !== null) {
      var starred = isBookmarked(activeSessionId, parseInt(idx));
      var star = messages[i].querySelector('.bookmark-star');
      if (star) star.classList.toggle('bookmarked', starred);
    }
  }
}

function renderBookmarksSidebar() {
  var list = document.getElementById('bookmarks-list');
  var emptyEl = document.getElementById('bookmarks-empty');
  var countEl = document.getElementById('bookmarks-count');
  if (!list) return;

  var bookmarks = loadBookmarks();

  // Update badge on activity bar button
  updateBookmarksBadge(bookmarks.length);

  // Update count in header
  if (countEl) countEl.textContent = bookmarks.length > 0 ? bookmarks.length : '';

  if (bookmarks.length === 0) {
    list.innerHTML = '';
    if (emptyEl) emptyEl.classList.add('visible');
    return;
  }

  if (emptyEl) emptyEl.classList.remove('visible');
  list.innerHTML = '';

  // Show newest first
  var sorted = bookmarks.slice().reverse();
  for (var i = 0; i < sorted.length; i++) {
    var bm = sorted[i];
    var info = AGENTS[bm.agent] || { color: '#666', label: bm.agent || 'Unknown' };
    var color = bm.role === 'user' ? '#4a4a68' : (info.color || '#666');

    var entry = document.createElement('div');
    entry.className = 'bookmark-entry';
    entry.title = bm.preview;
    entry.innerHTML =
      '<span class="bookmark-entry-dot" style="background:' + color + '"></span>' +
      '<span class="bookmark-entry-text">' +
        '<span class="bookmark-entry-session">' + esc(bm.sessionTitle) + '</span>' +
        '<span class="bookmark-entry-preview">' + esc(bm.preview) + '</span>' +
      '</span>' +
      '<button class="bookmark-entry-remove" title="Remove bookmark">&times;</button>';

    entry.addEventListener('click', (function(bmRef) {
      return function(e) {
        if (e.target.classList.contains('bookmark-entry-remove')) return;
        scrollToBookmark(bmRef.sessionId, bmRef.msgIdx);
      };
    })(bm));

    entry.querySelector('.bookmark-entry-remove').addEventListener('click', (function(bmRef) {
      return function(e) {
        e.stopPropagation();
        toggleBookmark(bmRef.sessionId, bmRef.msgIdx);
      };
    })(bm));

    list.appendChild(entry);
  }
}

function updateBookmarksBadge(count) {
  var btn = document.getElementById('activity-bookmarks');
  if (!btn) return;
  var badge = btn.querySelector('.badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'badge';
      btn.appendChild(badge);
    }
    badge.textContent = count;
  } else if (badge) {
    badge.remove();
  }
}

function scrollToBookmark(sessionId, msgIdx) {
  // Switch to the session if needed
  if (activeSessionId !== sessionId) {
    if (chatSessions[sessionId]) {
      switchSession(sessionId);
    } else {
      return; // session no longer exists
    }
  }

  // Make sure chat tab is active
  if (activeTabId !== 'chat') switchTab('chat');

  // Find and scroll to the message
  setTimeout(function() {
    var messages = document.querySelectorAll('#messages .message');
    for (var i = 0; i < messages.length; i++) {
      var idx = messages[i].getAttribute('data-msg-idx');
      if (idx !== null && parseInt(idx) === msgIdx) {
        messages[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash highlight
        messages[i].classList.add('bookmark-highlight');
        setTimeout(function() {
          messages[i].classList.remove('bookmark-highlight');
        }, 1500);
        break;
      }
    }
  }, 100);
}

// Create bookmark star button HTML
function bookmarkStarHtml(msgIdx) {
  return '<button class="bookmark-star" data-msg-idx="' + msgIdx + '" title="Bookmark this message" onclick="onBookmarkStarClick(this)">&#9734;</button>';
}

function onBookmarkStarClick(btn) {
  var msgEl = btn.closest('.message');
  if (!msgEl || !activeSessionId) return;
  var msgIdx = parseInt(msgEl.getAttribute('data-msg-idx'));
  if (isNaN(msgIdx)) return;

  var role = msgEl.classList.contains('user') ? 'user' : 'assistant';
  var bubble = msgEl.querySelector('.message-bubble');
  var rawContent = '';
  if (bubble) {
    rawContent = bubble.getAttribute('data-raw-md') || bubble.textContent;
  }

  var session = getActiveSession();
  var agent = session ? session.agent : null;

  toggleBookmark(activeSessionId, msgIdx, role, agent, rawContent);
}

// Initialize bookmarks sidebar on load
function initBookmarks() {
  renderBookmarksSidebar();
}
