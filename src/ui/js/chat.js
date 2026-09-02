// ═══════════════════════════════════════════════════════════════
// Image attachments (paste / drag-and-drop)
// ═══════════════════════════════════════════════════════════════

var ATTACHMENT_MAX_COUNT = 5;
var ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;  // 5MB decoded
var ATTACHMENT_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function _attachmentSession() {
  // Attachments live on the active session so they don't bleed across tabs.
  // Fall back to a global staging slot when no session has been started yet
  // (e.g., user pastes into the agent-picker search box) — currently unused
  // since the picker doesn't accept paste, but guards against null deref.
  var s = (typeof getActiveSession === 'function') ? getActiveSession() : null;
  if (s && !s.pendingAttachments) s.pendingAttachments = [];
  return s;
}

function _formatBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderAttachmentChips() {
  var wrap = document.getElementById('chat-attachments');
  if (!wrap) return;
  var session = _attachmentSession();
  var items = (session && session.pendingAttachments) ? session.pendingAttachments : [];

  if (items.length === 0) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }

  wrap.style.display = 'flex';
  wrap.innerHTML = '';
  for (var i = 0; i < items.length; i++) {
    var a = items[i];
    var chip = document.createElement('div');
    chip.className = 'attachment-chip';
    chip.innerHTML =
      '<img class="attachment-chip-thumb" src="' + a.previewUrl + '" alt="' + esc(a.name || 'image') + '">' +
      '<div class="attachment-chip-meta">' +
        '<span class="attachment-chip-name">' + esc(a.name || 'pasted image') + '</span>' +
        '<span class="attachment-chip-size">' + _formatBytes(a.sizeBytes) + '</span>' +
      '</div>' +
      '<button class="attachment-chip-remove" title="Remove" data-id="' + a.id + '">&times;</button>';
    chip.querySelector('.attachment-chip-remove').addEventListener('click', (function(id) {
      return function() { removeAttachment(id); };
    })(a.id));
    wrap.appendChild(chip);
  }
}

function removeAttachment(id) {
  var session = _attachmentSession();
  if (!session) return;
  session.pendingAttachments = (session.pendingAttachments || []).filter(function(a) { return a.id !== id; });
  renderAttachmentChips();
}

function clearAttachments() {
  var session = _attachmentSession();
  if (!session) return;
  session.pendingAttachments = [];
  renderAttachmentChips();
}

function _addAttachmentFromFile(file) {
  var session = _attachmentSession();
  if (!session) {
    addSystemNotice('Start a chat session before attaching images.');
    return;
  }
  if (!file || !file.type || ATTACHMENT_ALLOWED_MIME.indexOf(file.type) === -1) {
    addSystemNotice('Only JPEG, PNG, GIF, and WebP images are supported.');
    return;
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    addSystemNotice('Image exceeds the 5MB limit.');
    return;
  }
  if ((session.pendingAttachments || []).length >= ATTACHMENT_MAX_COUNT) {
    addSystemNotice('Attachment limit reached (' + ATTACHMENT_MAX_COUNT + ').');
    return;
  }
  var reader = new FileReader();
  reader.onload = function(ev) {
    var dataUrl = ev.target.result || '';
    var commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) {
      addSystemNotice('Failed to read pasted image.');
      return;
    }
    var dataBase64 = dataUrl.slice(commaIdx + 1);
    var entry = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      mediaType: file.type,
      dataBase64: dataBase64,
      sizeBytes: file.size,
      name: file.name || ('pasted-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + (file.type.split('/')[1] || 'png')),
      previewUrl: dataUrl,
    };
    if (!session.pendingAttachments) session.pendingAttachments = [];
    session.pendingAttachments.push(entry);
    renderAttachmentChips();
  };
  reader.onerror = function() {
    addSystemNotice('Failed to read pasted image.');
  };
  reader.readAsDataURL(file);
}

function handleChatInputPaste(e) {
  var items = (e.clipboardData && e.clipboardData.items) || [];
  var imageFiles = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.kind === 'file' && it.type && it.type.indexOf('image/') === 0) {
      var f = it.getAsFile();
      if (f) imageFiles.push(f);
    }
  }
  if (imageFiles.length === 0) return;  // let the browser handle text paste normally
  e.preventDefault();
  for (var j = 0; j < imageFiles.length; j++) {
    _addAttachmentFromFile(imageFiles[j]);
  }
}

function handleChatInputDragOver(e) {
  if (!e.dataTransfer || !e.dataTransfer.types) return;
  if (Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') === -1) return;
  e.preventDefault();
  var wrap = document.getElementById('chat-attachments');
  if (wrap) wrap.classList.add('drag-over');
}

function handleChatInputDragLeave() {
  var wrap = document.getElementById('chat-attachments');
  if (wrap) wrap.classList.remove('drag-over');
}

function handleChatInputDrop(e) {
  if (!e.dataTransfer) return;
  var files = e.dataTransfer.files || [];
  var imageFiles = [];
  for (var i = 0; i < files.length; i++) {
    if (files[i].type && files[i].type.indexOf('image/') === 0) imageFiles.push(files[i]);
  }
  if (imageFiles.length === 0) return;
  e.preventDefault();
  var wrap = document.getElementById('chat-attachments');
  if (wrap) wrap.classList.remove('drag-over');
  for (var k = 0; k < imageFiles.length; k++) {
    _addAttachmentFromFile(imageFiles[k]);
  }
}

// ═══════════════════════════════════════════════════════════════
// Permission mode cycling (Shift+Tab)
// ═══════════════════════════════════════════════════════════════

var PERMISSION_MODES = [
  { key: 'acceptEdits', label: 'Accept Edits', shortLabel: 'Edits', color: '#4CAF50', desc: 'Read and edit files' },
  { key: 'plan',        label: 'Plan',         shortLabel: 'Plan',  color: '#2196F3', desc: 'Explore and plan, no edits' },
];

var currentPermissionMode = 'acceptEdits';

function cyclePermissionMode(direction) {
  var idx = PERMISSION_MODES.findIndex(function(m) { return m.key === currentPermissionMode; });
  if (idx === -1) idx = 0;
  idx = (idx + (direction || 1) + PERMISSION_MODES.length) % PERMISSION_MODES.length;
  var newMode = PERMISSION_MODES[idx].key;
  if (newMode === currentPermissionMode) return;
  currentPermissionMode = newMode;
  renderModeIndicator();
  applyModeToSession();
}

function renderModeIndicator() {
  var btn = document.getElementById('mode-indicator');
  if (!btn) return;
  var mode = PERMISSION_MODES.find(function(m) { return m.key === currentPermissionMode; });
  if (!mode) return;
  btn.textContent = mode.label;
  btn.style.borderColor = mode.color;
  btn.style.color = mode.color;
  btn.title = mode.desc + ' (Shift+Tab to cycle)';
  btn.className = 'mode-' + mode.key;
  // Pulse animation on change
  btn.classList.remove('mode-flash');
  void btn.offsetWidth; // reflow
  btn.classList.add('mode-flash');
}

function applyModeToSession() {
  var session = getActiveSession();
  if (!session || !activeSessionId) return;
  // Post mode change to server — restarts session with new permission mode
  authFetch('/chat/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: activeSessionId, mode: currentPermissionMode }),
  }).then(function(res) { return res.json(); }).then(function(data) {
    if (data.switched && data.sessionId) {
      replaceSessionInTab(activeSessionId, data.sessionId, data.agent);
    }
  }).catch(function() {
    addSystemNotice('Failed to switch permission mode — server unreachable.');
  });
}

// ═══════════════════════════════════════════════════════════════
// Agent picker
// ═══════════════════════════════════════════════════════════════

async function loadAgentPicker() {
  var picker = document.getElementById('agent-picker');
  picker.classList.add('visible');

  if (!agentList) {
    try {
      var res = await authFetch('/agents');
      agentList = await res.json();
    } catch(e) {
      picker.innerHTML = '<div class="empty-state">Failed to load agents</div>';
      return;
    }
  }

  picker.innerHTML = '';

  // Search input
  var searchWrap = document.createElement('div');
  searchWrap.className = 'agent-picker-search-wrap';
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'agent-picker-search';
  searchInput.placeholder = 'What do you need help with?';
  searchWrap.appendChild(searchInput);
  picker.appendChild(searchWrap);

  // Syn hero card (pinned, unaffected by search)
  var synAgent = agentList.find(function(a) { return a.name === 'syn'; });
  if (synAgent) {
    var synInfo = { color: synAgent.color || '#FFD700', label: synAgent.label || 'Syn (Orchestrator)' };
    var hero = document.createElement('div');
    hero.className = 'agent-card agent-card-hero';
    hero.innerHTML =
      '<span class="agent-card-dot" style="background:' + synInfo.color + '"></span>' +
      '<div class="agent-card-hero-body">' +
        '<span class="agent-card-name">' + esc(synInfo.label) + '</span>' +
        '<span class="agent-card-hero-tagline">Describe what you need above and press Enter — Syn will route you to the right specialist.</span>' +
      '</div>';
    hero.addEventListener('click', function() { startNewSession('syn'); });
    picker.appendChild(hero);

    // Plain chat entry (no agent)
    var plainChatCard = document.createElement('div');
    plainChatCard.className = 'agent-card agent-card-plain';
    plainChatCard.innerHTML =
      '<span class="agent-card-dot" style="background:#3860c0"></span>' +
      '<span class="agent-card-name">Plain Chat</span>' +
      '<span class="agent-card-desc">A blank Claude Code session with no agent persona</span>';
    plainChatCard.addEventListener('click', function() { startNewSession(null); });
    picker.appendChild(plainChatCard);
  }

  // Non-Syn agents grouped by category
  var CATEGORY_ORDER = ['data', 'analytics', 'mlai', 'review'];
  var CATEGORY_LABELS = { data: 'DATA', analytics: 'ANALYTICS', mlai: 'ML / AI', review: 'REVIEW' };

  var grouped = {};
  CATEGORY_ORDER.forEach(function(cat) { grouped[cat] = []; });
  for (var i = 0; i < agentList.length; i++) {
    var agent = agentList[i];
    if (agent.name === 'syn') continue;
    var cat = agent.category || 'review';
    if (grouped[cat]) grouped[cat].push(agent);
  }

  CATEGORY_ORDER.forEach(function(cat) {
    var agents = grouped[cat];
    if (!agents || !agents.length) return;

    var header = document.createElement('div');
    header.className = 'agent-picker-section-header';
    header.textContent = CATEGORY_LABELS[cat];
    picker.appendChild(header);

    agents.forEach(function(agent) {
      var card = document.createElement('div');
      card.className = 'agent-card';
      card.innerHTML =
        '<span class="agent-card-dot" style="background:' + (agent.color || '#3860c0') + '"></span>' +
        '<span class="agent-card-name">' + esc(agent.label || agent.name) + '</span>' +
        '<span class="agent-card-desc">' + esc(agent.description || '') + '</span>';
      card.addEventListener('click', (function(name) { return function() { startNewSession(name); }; })(agent.name));
      picker.appendChild(card);
    });
  });

  // Prompt → Syn auto-start
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var q = searchInput.value.trim();
      startNewSession('syn', q || undefined);
    }
  });

  setTimeout(function() { searchInput.focus(); }, 50);
}

function showAgentPicker() {
  document.getElementById('messages').style.display = 'none';
  document.getElementById('chat-input-area').classList.remove('visible');
  loadAgentPicker();
}

function showChatView() {
  document.getElementById('agent-picker').classList.remove('visible');
  document.getElementById('messages').style.display = 'flex';
  document.getElementById('chat-input-area').classList.add('visible');
}

// ═══════════════════════════════════════════════════════════════
// Chat session control
// ═══════════════════════════════════════════════════════════════

async function startNewSession(agentName, initialMessage, options) {
  options = options || {};
  try {
    var body = { agent: agentName || null, permissionMode: currentPermissionMode };
    if (initialMessage) body.initialMessage = initialMessage;
    if (options.resumeSessionId) body.resumeSessionId = options.resumeSessionId;
    if (options.model) body.model = options.model;
    var res = await authFetch('/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = await res.json();
    if (data.error) {
      addSystemNotice(data.error);
      return;
    }

    // Save current session (chat DOM + workspace)
    var oldSession = getActiveSession();
    if (oldSession) {
      var messagesEl = document.getElementById('messages');
      oldSession.scrollTop = messagesEl.scrollTop;
      var frag = document.createDocumentFragment();
      while (messagesEl.firstChild) {
        frag.appendChild(messagesEl.firstChild);
      }
      oldSession.domFragment = frag;
      saveSessionWorkspace(oldSession);
    }

    // Dispose DOM-bound instances before swapping workspace
    disposeMonacoInstance();
    disposeNotebookCellMonaco();
    destroyTabulator();

    var session = createSessionState(data.sessionId, agentName);
    activeSessionId = data.sessionId;
    loadSessionWorkspace(session);

    showChatView();
    document.getElementById('messages').innerHTML = '';
    session.hasMessages = false;

    activateAgent(agentName);
    renderSessionTabs();

    // Render fresh workspace (no files yet)
    renderWsTabs();
    showActiveContent();

    var chatInput = document.getElementById('chat-input');
    chatInput.focus();
  } catch (err) {
    addSystemNotice('Failed to start session — server unreachable.');
  }
}

async function sendChatMessage() {
  var session = getActiveSession();
  var input = document.getElementById('chat-input');
  var message = input.value.trim();
  var attachments = (session && session.pendingAttachments) ? session.pendingAttachments.slice() : [];
  if ((!message && attachments.length === 0) || !session || session.chatResponding) return;

  input.value = '';
  input.style.height = 'auto';

  // Slash commands take the text path and ignore attachments (drop them silently)
  var lower = message.toLowerCase();
  var isSlash = (lower === '/clear' || lower === '/config' || lower === '/mode' || lower === '/exit');

  // Client-side /clear — no server round-trip needed
  if (lower === '/clear') {
    document.getElementById('messages').innerHTML = '';
    session.messages = [];
    session.hasMessages = false;
    clearSelectionContext();
    clearAttachments();
    return;
  }

  // Client-side /config — open settings panel, no server round-trip
  if (lower === '/config') {
    toggleSettings();
    clearAttachments();
    return;
  }

  // Client-side /mode — cycle permission mode
  if (lower === '/mode') {
    cyclePermissionMode(1);
    clearAttachments();
    return;
  }

  // Client-side /exit — stop session and close tab
  if (lower === '/exit') {
    if (session && activeSessionId) {
      closeSessionTab(activeSessionId);
    }
    clearAttachments();
    return;
  }

  if (isSlash) return;

  // Augment message with selection context if present
  var fullMessage = formatSelectionContextForMessage(message);
  clearSelectionContext();

  // Prepend pinned context (fetches file contents for pinned files)
  fullMessage = await formatPinnedContextForMessage(fullMessage);

  // Clear staged attachments locally now that we've captured them for this send
  if (attachments.length > 0) {
    session.pendingAttachments = [];
    renderAttachmentChips();
  }

  // Wire format sent to the server: only id/mediaType/dataBase64 are required
  // server-side. previewUrl/name/sizeBytes ride along for the transcript so the
  // chat history can render thumbnails on reload.
  var wireAttachments = attachments.map(function(a) {
    return {
      mediaType: a.mediaType,
      dataBase64: a.dataBase64,
      name: a.name,
      sizeBytes: a.sizeBytes,
    };
  });

  try {
    var res = await authFetch('/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: fullMessage,
        sessionId: activeSessionId,
        attachments: wireAttachments,
      }),
    });
    var data = await res.json();

    // Update client state for agent switches
    if (data.switched && data.agent) {
      replaceSessionInTab(activeSessionId, data.sessionId, data.agent);
    }
  } catch (err) {
    addSystemNotice('Message failed to send — server unreachable.');
  }
}

async function stopChat() {
  if (!activeSessionId) return;
  var sid = activeSessionId;
  try {
    await authFetch('/chat/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sid }),
    });
  } catch(e) {
    console.warn('[shards] stop request failed:', e);
  }
  endSessionTab(sid);
}

function endSessionTab(sessionId) {
  var wasActive = (activeSessionId === sessionId);
  removeSessionState(sessionId);

  if (wasActive) {
    // Dispose DOM-bound instances
    disposeMonacoInstance();
    disposeNotebookCellMonaco();
    destroyTabulator();

    if (sessionOrder.length > 0) {
      // Switch to adjacent session (handles workspace load + renderSessionTabs)
      var targetSid = sessionOrder[sessionOrder.length - 1];
      activeSessionId = targetSid;
      loadSessionWorkspace(chatSessions[targetSid]);

      // Restore chat
      var newSession = chatSessions[targetSid];
      var messagesEl = document.getElementById('messages');
      messagesEl.innerHTML = '';
      if (newSession.domFragment) {
        messagesEl.appendChild(newSession.domFragment);
        newSession.domFragment = null;
        messagesEl.scrollTop = newSession.scrollTop;
      } else {
        newSession.hasMessages = false;
        rebuildMessages(newSession.messages);
      }
      showChatView();
      activateAgent(newSession.agent);
      setChatInputEnabled(!newSession.chatResponding);
      applySplitLayout();
      renderWsTabs();
      showActiveContent();
      renderSessionTabs();
      return;
    }

    // No sessions left — reset workspace to defaults
    activeSessionId = null;
    loadSessionWorkspace(null);
    setChatInputEnabled(true);
    applySplitLayout();
    renderWsTabs();
    showActiveContent();
    showAgentPicker();
  }

  renderSessionTabs();
}

async function closeSessionTab(sessionId) {
  try {
    await authFetch('/chat/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId }),
    });
  } catch(e) {
    console.warn('[shards] close session request failed:', e);
  }
  endSessionTab(sessionId);
}

function replaceSessionInTab(oldSessionId, newSessionId, agent) {
  var oldSession = getSessionState(oldSessionId);
  var title = oldSession ? oldSession.title : null;

  // Preserve workspace from old session
  var preservedWorkspace = null;
  if (oldSession) {
    preservedWorkspace = {
      openFiles: oldSession.openFiles,
      fileTabOrder: oldSession.fileTabOrder,
      activeTabId: oldSession.activeTabId,
      splitMode: oldSession.splitMode,
      currentFileInPane: oldSession.currentFileInPane,
      openPanels: oldSession.openPanels,
      panelTabOrder: oldSession.panelTabOrder,
    };
  }

  // Remove old session from map (but preserve position in order)
  delete chatSessions[oldSessionId];
  var idx = sessionOrder.indexOf(oldSessionId);

  // Create new session state
  var newSession = createSessionState(newSessionId, agent);
  newSession.title = title;

  // Restore workspace into new session
  if (preservedWorkspace) {
    newSession.openFiles = preservedWorkspace.openFiles;
    newSession.fileTabOrder = preservedWorkspace.fileTabOrder;
    newSession.activeTabId = preservedWorkspace.activeTabId;
    newSession.splitMode = preservedWorkspace.splitMode;
    newSession.currentFileInPane = preservedWorkspace.currentFileInPane;
    newSession.openPanels = preservedWorkspace.openPanels;
    newSession.panelTabOrder = preservedWorkspace.panelTabOrder;
  }

  // Fix position: createSessionState pushes to end, move to old position
  if (idx !== -1) {
    var endIdx = sessionOrder.indexOf(newSessionId);
    if (endIdx !== -1) sessionOrder.splice(endIdx, 1);
    var oldIdx = sessionOrder.indexOf(oldSessionId);
    if (oldIdx !== -1) {
      sessionOrder.splice(oldIdx, 1, newSessionId);
    } else {
      sessionOrder.splice(idx, 0, newSessionId);
    }
  }

  if (activeSessionId === oldSessionId) {
    activeSessionId = newSessionId;
    // Reload workspace globals from new session
    loadSessionWorkspace(newSession);
  }

  // Reset UI for active session
  if (activeSessionId === newSessionId) {
    document.getElementById('messages').innerHTML = '';
    newSession.hasMessages = false;
    activateAgent(agent);
  }

  renderSessionTabs();
}

function setChatInputEnabled(enabled) {
  var input = document.getElementById('chat-input');
  var btn = document.getElementById('chat-send-btn');
  input.disabled = !enabled;
  btn.disabled = !enabled;
  var session = getActiveSession();
  if (session) session.chatResponding = !enabled;
  if (enabled) {
    removeWorkingIndicator();
  } else {
    showWorkingIndicator();
  }
}

// ═══════════════════════════════════════════════════════════════
// Session tab bar
// ═══════════════════════════════════════════════════════════════

// R1 — short relative-time string for tooltips ("12s", "4m", "2h")
function formatRelativeTime(ts) {
  if (!ts) return '';
  var diff = Math.max(0, Date.now() - ts);
  var s = Math.floor(diff / 1000);
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

// R2 — derive the per-tab subline ("now doing") text.
// Priority: needsAttention reason > responding state > lastSignal > idle.
function deriveTabSubline(session) {
  if (!session) return '';
  if (session.needsAttention) {
    if (session.attentionReason === 'gate') return 'gate reached';
    if (session.attentionReason === 'permission') return 'permission required';
    if (session.attentionReason === 'error') return 'error';
    if (session.attentionReason === 'turn-end') return 'awaiting input';
  }
  var sig = session.lastSignal;
  if (session.chatResponding) {
    if (sig && sig.kind === 'tool') return '→ ' + sig.label;
    if (sig && sig.kind === 'consult') return '↘ consulting ' + sig.label;
    return 'responding…';
  }
  if (sig) {
    if (sig.kind === 'gate') return '⏸ ' + sig.label;
    if (sig.kind === 'tool') return '→ ' + sig.label;
    if (sig.kind === 'file') return '✎ ' + sig.label;
    if (sig.kind === 'consult') return '↘ ' + sig.label;
    if (sig.kind === 'error') return '⚠ ' + sig.label;
  }
  if (session.lastActivityAt) return 'idle · ' + formatRelativeTime(session.lastActivityAt);
  return '';
}

// Truncate a free-form prompt to a short snippet suitable for a tab label.
// Collapses whitespace, drops trailing punctuation before ellipsis, caps at
// ~32 chars. Returns '' when the input has no usable text.
function buildPromptSnippet(text, max) {
  if (typeof text !== 'string') return '';
  var s = text.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  var cap = max || 32;
  if (s.length <= cap) return s;
  var slice = s.slice(0, cap).replace(/[\s.,;:!?\-—]+$/, '');
  return slice + '…';
}

// Pull the first user prompt from a session and cache the snippet on the
// session object. Returns '' if no user message has been received yet.
function deriveFirstPromptSnippet(session) {
  if (!session) return '';
  if (session._promptSnippet != null) return session._promptSnippet;
  if (!session.messages || !session.messages.length) return '';
  for (var i = 0; i < session.messages.length; i++) {
    var m = session.messages[i];
    if (m && m.role === 'user' && typeof m.content === 'string') {
      var snippet = buildPromptSnippet(m.content, 32);
      session._promptSnippet = snippet;
      return snippet;
    }
  }
  return '';
}

// Always-on tab context: prefer auto-detected project name, fall back to a
// truncated first-prompt snippet (quoted), then to a same-agent ordinal #N
// only when disambiguation is actually needed.
function deriveTabContext(session, agentCounts, ordinal) {
  if (!session) return '';
  if (session.projectName) return session.projectName;
  var snippet = deriveFirstPromptSnippet(session);
  if (snippet) return '"' + snippet + '"';
  if (agentCounts && agentCounts[session.agent] > 1) return '#' + ordinal;
  return '';
}

function renderSessionTabs() {
  var bar = document.getElementById('header-session-bar');
  if (!bar) return;

  bar.innerHTML = '';

  // Pre-pass: count sessions per agent so we know whether to disambiguate.
  var agentCounts = {};
  for (var p = 0; p < sessionOrder.length; p++) {
    var ps = chatSessions[sessionOrder[p]];
    if (ps) agentCounts[ps.agent] = (agentCounts[ps.agent] || 0) + 1;
  }
  var agentOrdinals = {};

  for (var i = 0; i < sessionOrder.length; i++) {
    var sid = sessionOrder[i];
    var session = chatSessions[sid];
    if (!session) continue;

    var info = AGENTS[session.agent] || { color: '#666', label: session.agent };
    agentOrdinals[session.agent] = (agentOrdinals[session.agent] || 0) + 1;
    var ordinal = agentOrdinals[session.agent];
    var suffix = deriveTabContext(session, agentCounts, ordinal);
    var subline = deriveTabSubline(session);

    var tab = document.createElement('div');
    var tabClass = 'session-tab';
    if (sid === activeSessionId) tabClass += ' active';
    if (session.needsAttention) tabClass += ' needs-attention';
    else if (session.unread) tabClass += ' unread';
    if (session.chatResponding) tabClass += ' responding';
    if (subline) tabClass += ' has-subline';
    tab.className = tabClass;
    tab.style.setProperty('--tab-color', info.color);

    var titleText = session.title || info.label;
    var suffixHtml = suffix
      ? '<span class="session-tab-suffix">· ' + esc(suffix) + '</span>'
      : '';
    var sublineHtml = subline
      ? '<span class="session-tab-subline">' + esc(subline) + '</span>'
      : '';

    tab.innerHTML =
      '<div class="session-tab-row">' +
        '<span class="session-tab-dot" style="background:' + info.color + '"></span>' +
        '<span class="session-tab-title">' + esc(titleText) + '</span>' +
        suffixHtml +
        '<span class="session-tab-close" title="Close session">&times;</span>' +
      '</div>' +
      sublineHtml;

    // R1 — rich hover tooltip aggregating activity + cost
    var tipLines = [titleText + (suffix ? ' · ' + suffix : '')];
    var firstPromptFull = '';
    if (session.messages && session.messages.length) {
      for (var mi = 0; mi < session.messages.length; mi++) {
        var fm = session.messages[mi];
        if (fm && fm.role === 'user' && typeof fm.content === 'string') {
          firstPromptFull = fm.content.replace(/\s+/g, ' ').trim();
          if (firstPromptFull.length > 160) firstPromptFull = firstPromptFull.slice(0, 160) + '…';
          break;
        }
      }
    }
    if (firstPromptFull) tipLines.push('Prompt: ' + firstPromptFull);
    if (session.lastSignal) tipLines.push('Last: ' + session.lastSignal.label);
    if (session.lastActivityAt) tipLines.push('Active ' + formatRelativeTime(session.lastActivityAt) + ' ago');
    if (session.totalCost) tipLines.push('Cost: $' + Number(session.totalCost).toFixed(4));
    tab.title = tipLines.join('\n');

    tab.addEventListener('click', (function(id) {
      return function(e) {
        if (e.target.classList.contains('session-tab-close')) return;
        switchSession(id);
      };
    })(sid));

    tab.querySelector('.session-tab-close').addEventListener('click', (function(id) {
      return function(e) {
        e.stopPropagation();
        closeSessionTab(id);
      };
    })(sid));

    // Double-click title to rename
    tab.querySelector('.session-tab-title').addEventListener('dblclick', (function(id, el) {
      return function(e) {
        e.stopPropagation();
        startTabRename(id, el);
      };
    })(sid, tab.querySelector('.session-tab-title')));

    bar.appendChild(tab);
  }

  // Always show the "+ New Chat" button
  var newBtn = document.createElement('button');
  newBtn.id = 'new-session-btn';
  newBtn.title = 'New chat';
  newBtn.textContent = sessionOrder.length > 0 ? '+' : '+ New Chat';
  newBtn.addEventListener('click', function() {
    showAgentPicker();
  });
  bar.appendChild(newBtn);
}

// ═══════════════════════════════════════════════════════════════
// Session switching
// ═══════════════════════════════════════════════════════════════

function switchSession(sessionId) {
  if (sessionId === activeSessionId) {
    // If we're on the agent picker, switch back to chat view
    var picker = document.getElementById('agent-picker');
    if (picker.classList.contains('visible')) {
      showChatView();
    }
    return;
  }

  var oldSession = getActiveSession();
  var newSession = getSessionState(sessionId);
  if (!newSession) return;

  var messagesEl = document.getElementById('messages');

  // Save current session (chat DOM + workspace)
  if (oldSession) {
    oldSession.scrollTop = messagesEl.scrollTop;
    var frag = document.createDocumentFragment();
    while (messagesEl.firstChild) {
      frag.appendChild(messagesEl.firstChild);
    }
    oldSession.domFragment = frag;
    saveSessionWorkspace(oldSession);
  }

  // Clear selection context and dispose DOM-bound instances before swapping workspace
  clearSelectionContext();
  disposeMonacoInstance();
  disposeNotebookCellMonaco();
  destroyTabulator();

  // Switch active session and load its workspace
  activeSessionId = sessionId;
  loadSessionWorkspace(newSession);

  // Restore target session chat DOM
  messagesEl.innerHTML = '';
  if (newSession.domDirty || !newSession.domFragment) {
    // Rebuild from messages
    newSession.hasMessages = false;
    if (newSession.messages.length === 0) {
      messagesEl.innerHTML = '<div class="empty-state">Waiting for response...</div>';
    } else {
      for (var i = 0; i < newSession.messages.length; i++) {
        addMessageDirect(newSession.messages[i].role, newSession.messages[i].content, newSession.messages[i].agent, true, newSession.messages[i].attachments);
      }
    }
    newSession.domDirty = false;
    newSession.domFragment = null;
    newSession.pendingBubble = null;
    newSession.thinkingIndicatorEl = null;
    newSession.consultingIndicatorEl = null;
  } else {
    // Restore from fragment
    messagesEl.appendChild(newSession.domFragment);
    newSession.domFragment = null;
    messagesEl.scrollTop = newSession.scrollTop;
  }

  // Show chat view (in case we were on agent picker)
  showChatView();
  activateAgent(newSession.agent);
  setChatInputEnabled(!newSession.chatResponding);
  newSession.unread = false;
  newSession.needsAttention = false;
  newSession.attentionReason = null;

  // Render any queued permission cards
  var queued = newSession.pendingPermissions;
  if (queued.length > 0) {
    for (var qi = 0; qi < queued.length; qi++) {
      var perm = queued[qi];
      renderPermissionCard(perm.id, perm.tool, perm.command, perm.sessionId);
    }
    newSession.pendingPermissions = [];
  }

  updateTitleNotification();
  renderSessionTabs();
  renderAttachmentChips();

  // Rebuild workspace layout for this session
  applySplitLayout();
  renderWsTabs();
  showActiveContent();
}

function cycleSessionTab(dir) {
  if (sessionOrder.length < 2) return;
  var idx = sessionOrder.indexOf(activeSessionId);
  if (idx === -1) return;
  var newIdx = (idx + dir + sessionOrder.length) % sessionOrder.length;
  switchSession(sessionOrder[newIdx]);
}

// ═══════════════════════════════════════════════════════════════
// Tab rename
// ═══════════════════════════════════════════════════════════════

function startTabRename(sessionId, titleEl) {
  var session = getSessionState(sessionId);
  if (!session) return;

  var info = AGENTS[session.agent] || { label: session.agent };
  var currentTitle = session.title || info.label;

  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'session-tab-rename-input';
  input.value = currentTitle;

  titleEl.textContent = '';
  titleEl.appendChild(input);
  input.focus();
  input.select();

  var cancelled = false;

  function finish() {
    if (cancelled) {
      renderSessionTabs();
      return;
    }
    var newTitle = input.value.trim();
    if (newTitle && newTitle !== info.label) {
      session.title = newTitle;
      authFetch('/chat/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, title: newTitle }),
      }).catch(function() {
        console.warn('[shards] tab rename failed to persist');
      });
    } else {
      session.title = null;
    }
    renderSessionTabs();
  }

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelled = true; input.blur(); }
  });
}

// ═══════════════════════════════════════════════════════════════
// Streaming token display
// ═══════════════════════════════════════════════════════════════

function ensurePendingBubble() {
  var session = getActiveSession();
  if (!session || session.pendingBubble) return;

  var container = document.getElementById('messages');
  if (!session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }

  var info = AGENTS[session.agent] || { color: '#666', label: session.agent || 'Agent' };
  var div = document.createElement('div');
  div.className = 'message assistant gathering';
  div.innerHTML =
    '<div class="message-meta">' +
    '<span class="meta-dot" style="background:' + info.color + '; color:' + info.color + '"></span>' +
    esc(info.label) +
    '</div>' +
    '<div class="message-bubble"></div>';
  container.appendChild(div);

  // Remove gathering class after animation completes
  setTimeout(function() { div.classList.remove('gathering'); }, 600);
  session.pendingBubble = div.querySelector('.message-bubble');
  container.scrollTop = container.scrollHeight;
}

function appendToken(text) {
  var session = getActiveSession();
  if (!session) return;
  session.tokenBuffer += text;
  if (!session.tokenFlushPending) {
    session.tokenFlushPending = true;
    requestAnimationFrame(flushTokens);
  }
}

function flushTokens() {
  var session = getActiveSession();
  if (!session) return;
  session.tokenFlushPending = false;
  if (!session.pendingBubble || !session.tokenBuffer) return;
  session.pendingBubble.appendChild(document.createTextNode(session.tokenBuffer));
  session.tokenBuffer = '';
  var container = document.getElementById('messages');
  container.scrollTop = container.scrollHeight;
}

function finalizePendingBubble(markdownContent) {
  var session = getActiveSession();
  if (!session) return;
  flushTokens();
  if (session.pendingBubble) {
    var displayContent = stripGateFence(markdownContent);
    var rendered = renderMarkdown(displayContent);
    session.pendingBubble.innerHTML = linkifyFilePaths(rendered);
    session.pendingBubble.setAttribute('data-raw-md', displayContent);
    // Assign message index for bookmarking
    var msgEl = session.pendingBubble.parentElement;
    var msgIdx = session.messages.length - 1;
    if (msgIdx < 0) msgIdx = 0;
    msgEl.setAttribute('data-msg-idx', msgIdx);
    // Add message-level actions (bookmark + copy)
    var starHtml = typeof bookmarkStarHtml === 'function' ? bookmarkStarHtml(msgIdx) : '';
    var actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = starHtml + '<button class="msg-copy-btn" onclick="copyMessageContent(this)">Copy</button>';
    msgEl.appendChild(actions);
    // Auto-collapse long messages
    if (session.pendingBubble.scrollHeight > 500) {
      session.pendingBubble.classList.add('collapsed');
      var showMore = document.createElement('button');
      showMore.className = 'show-more-btn';
      showMore.textContent = 'Show more';
      var bubble = session.pendingBubble;
      showMore.onclick = function() {
        bubble.classList.remove('collapsed');
        showMore.remove();
      };
      session.pendingBubble.parentElement.insertBefore(showMore, actions);
    }
    // Detect gate pattern and inject confirmation buttons
    if (isGateMessage(markdownContent)) {
      injectGateButtons(session.pendingBubble.parentElement);
    }
    session.pendingBubble = null;
  }
  session.tokenBuffer = '';
  var container = document.getElementById('messages');
  container.scrollTop = container.scrollHeight;
}

// ─── Gate confirmation detection and buttons ────────────────────────────────

function stripGateFence(content) {
  if (!content) return content;
  return content.replace(/::GATE::[\s\S]*?::ENDGATE::\s*/g, '');
}

function isGateMessage(content) {
  if (!content) return false;
  // Require a real ::GATE:: ... ::ENDGATE:: fence — the same syntax parsed
  // authoritatively by tools/gate-hook/parser.js and emitted by agents per
  // src/agents/specific_instructions/shared/behavioral_rules.md. Substring
  // heuristics on words like "confirm" or "proceed" false-positive on agent
  // narration (e.g. "Confirmed — X is not present in Y").
  if (!/::GATE::[\s\S]*?::ENDGATE::/.test(content)) return false;
  // Suppress the Confirm/Request-Changes injection when enforcement is off
  // (SHARDS_GATE_ENFORCE=0) — the gate hook will never act on the response,
  // so showing the buttons as if they meant something is misleading. The
  // /gate-mode banner already tells the user gates are advisory.
  if (typeof gateMode !== 'undefined' && gateMode && gateMode.enforce === false) {
    return false;
  }
  // Prefer server state — only inject buttons when the gate hook has
  // actually opened a gate. With SSE in place gateState lands ~immediately;
  // the fallback (10s polling) can still leave a transient window where
  // gateState is stale, so we fall back to trusting the fence.
  if (typeof gateState !== 'undefined' && gateState) {
    return gateState.open === true;
  }
  return true;
}

function injectGateButtons(messageEl) {
  if (!messageEl) return;
  // Don't double-inject
  if (messageEl.querySelector('.gate-actions')) return;

  var actions = document.createElement('div');
  actions.className = 'gate-actions';
  actions.innerHTML =
    '<span class="gate-label">Gate confirmation</span>' +
    '<button class="gate-btn gate-btn-confirm">Confirm</button>' +
    '<button class="gate-btn gate-btn-changes">Request Changes</button>';

  actions.querySelector('.gate-btn-confirm').addEventListener('click', function() {
    var input = document.getElementById('chat-input');
    input.value = 'Confirmed. Proceed.';
    sendChatMessage();
    actions.classList.add('gate-resolved');
    setTimeout(function() { actions.remove(); }, 500);
  });

  actions.querySelector('.gate-btn-changes').addEventListener('click', function() {
    var input = document.getElementById('chat-input');
    input.value = 'I\'d like to change: ';
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    actions.classList.add('gate-resolved');
    setTimeout(function() { actions.remove(); }, 300);
  });

  messageEl.appendChild(actions);
}

// ─── File path auto-linking ──────────────────────────────────────────────────

function linkifyFilePaths(html) {
  // Regex for common file extensions in data projects
  var pathRegex = /\b([a-zA-Z0-9_\-\./]+\.(?:md|sql|py|ipynb|json|jsonl|csv|tsv|yml|yaml|txt|js|ts|html|css|png|jpg|pdf))\b/g;

  return html.replace(pathRegex, function(match) {
    // Avoid linking if it's already inside an <a>, <code>, or <pre> tag (basic heuristic)
    // This is hard in regex on HTML, but we can check if it looks like a URL or is very short
    if (match.startsWith('http') || match.length < 4) return match;

    return '<span class="file-link" onclick="openFile(\'' + match + '\')" title="Open ' + match + '">' + match + '</span>';
  });
}

function openFile(path) {
  // We call the explorer's open function which handles fetching and rendering
  if (typeof openFileFromExplorer === 'function') {
    openFileFromExplorer(path);
  }
}

function addToolIndicator(toolName) {
  var session = getActiveSession();
  var container = document.getElementById('messages');
  if (session && !session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }

  // Group consecutive tool calls
  var last = container.lastElementChild;
  if (last && last.classList.contains('tool-group')) {
    var items = last.querySelector('.tool-group-items');
    var div = document.createElement('div');
    div.className = 'tool-indicator';
    div.innerHTML = '<span class="tool-name">' + esc(toolName) + '</span>';
    items.appendChild(div);
    // Update header count and tool list
    var allTools = items.querySelectorAll('.tool-name');
    var names = [];
    for (var i = 0; i < allTools.length; i++) {
      var n = allTools[i].textContent;
      if (names.indexOf(n) === -1) names.push(n);
    }
    last.querySelector('.tool-group-header').innerHTML =
      '<span class="tool-group-chevron">&#9654;</span> Used ' + allTools.length + ' tool' + (allTools.length > 1 ? 's' : '') + ': ' + names.join(', ');
    container.scrollTop = container.scrollHeight;
    return;
  }

  var group = document.createElement('div');
  group.className = 'tool-group';
  group.innerHTML =
    '<div class="tool-group-header" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
    '<span class="tool-group-chevron">&#9654;</span> Used 1 tool: ' + esc(toolName) +
    '</div>' +
    '<div class="tool-group-items">' +
    '<div class="tool-indicator"><span class="tool-name">' + esc(toolName) + '</span></div>' +
    '</div>';
  container.appendChild(group);
  container.scrollTop = container.scrollHeight;
}

function showThinkingIndicator() {
  removeThinkingIndicator();
  var session = getActiveSession();
  var container = document.getElementById('messages');
  if (session && !session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }
  var info = AGENTS[session ? session.agent : null] || { color: '#4a4a80' };
  var div = document.createElement('div');
  div.className = 'thinking-indicator';
  div.innerHTML =
    '<div class="thinking-dot" style="background:' + info.color + '"></div>' +
    '<div class="thinking-dot" style="background:' + info.color + '"></div>' +
    '<div class="thinking-dot" style="background:' + info.color + '"></div>';
  container.appendChild(div);
  if (session) session.thinkingIndicatorEl = div;
  container.scrollTop = container.scrollHeight;
}

function removeThinkingIndicator() {
  var session = getActiveSession();
  if (session && session.thinkingIndicatorEl) {
    session.thinkingIndicatorEl.remove();
    session.thinkingIndicatorEl = null;
  }
}

function showWorkingIndicator() {
  removeWorkingIndicator();
  var session = getActiveSession();
  var info = AGENTS[session ? session.agent : null] || { color: '#4a4a80' };
  var inputArea = document.getElementById('chat-input-area');
  var div = document.createElement('div');
  div.className = 'working-indicator';
  div.innerHTML =
    '<span class="working-indicator-dot" style="background:' + info.color + '"></span>' +
    '<span class="working-indicator-text">Working...</span>';
  inputArea.appendChild(div);
  if (session) session.workingIndicatorEl = div;
}

function removeWorkingIndicator() {
  var session = getActiveSession();
  if (session && session.workingIndicatorEl) {
    session.workingIndicatorEl.remove();
    session.workingIndicatorEl = null;
  }
}

function showConsultingIndicator() {
  var session = getActiveSession();
  var container = document.getElementById('messages');
  if (session && !session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }
  var div = document.createElement('div');
  div.className = 'consulting-indicator';
  div.innerHTML =
    '<span class="consulting-glow-dot" style="background:#5050a0"></span>' +
    '<span class="consulting-label">Consulting agent...</span>';
  container.appendChild(div);
  if (session) session.consultingIndicatorEl = div;
  container.scrollTop = container.scrollHeight;
}

function updateConsultingIndicator(agentKey) {
  var session = getActiveSession();
  var info = AGENTS[agentKey] || { color: '#6060a0', label: agentKey };
  if (session && session.consultingIndicatorEl) {
    session.consultingIndicatorEl.innerHTML =
      '<span class="consulting-glow-dot consulting-glow-dot--done" style="background:' + info.color + '"></span>' +
      '<span class="consulting-label"><strong style="color:' + info.color + '">' + esc(info.label) + '</strong> consulted</span>';
    session.consultingIndicatorEl = null;
  } else {
    var container = document.getElementById('messages');
    if (session && !session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }
    var div = document.createElement('div');
    div.className = 'consulting-indicator';
    div.innerHTML =
      '<span class="consulting-glow-dot consulting-glow-dot--done" style="background:' + info.color + '"></span>' +
      '<span class="consulting-label"><strong style="color:' + info.color + '">' + esc(info.label) + '</strong> consulted</span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }
}

// ═══════════════════════════════════════════════════════════════
// Conversation panel
// ═══════════════════════════════════════════════════════════════

function addSystemNotice(text, opts) {
  var session = getActiveSession();
  var container = document.getElementById('messages');
  if (session && !session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }
  var div = document.createElement('div');
  div.className = 'message system-notice';
  // Use markdown rendering if text contains markdown-like formatting, otherwise escape
  var isMarkdown = text.indexOf('**') !== -1 || text.indexOf('`') !== -1 || text.indexOf('\n') !== -1;
  var rendered = isMarkdown ? renderMarkdown(text) : esc(text);
  var color = (opts && opts.color) || '#e05050';
  var bgColor = (opts && opts.bg) || 'rgba(224,80,80,0.1)';
  var textColor = (opts && opts.textColor) || '#e08080';
  div.innerHTML = '<div class="message-bubble" style="border-left: 3px solid ' + color + '; background: ' + bgColor + '; color: ' + textColor + '; font-size: 13px; padding: 8px 12px;">' + rendered + '</div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addMessageDirect(role, content, agent, skipAnimation, attachments) {
  var session = getActiveSession();
  var container = document.getElementById('messages');
  if (session && !session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }

  // Determine message index for bookmarking (count of .message elements already in container)
  var msgIdx = container.querySelectorAll('.message').length;

  var info = AGENTS[agent] || { color: '#666', label: agent || 'Unknown' };
  var div = document.createElement('div');
  div.className = 'message ' + (role === 'user' ? 'user' : ('assistant' + (skipAnimation ? '' : ' gathering')));
  div.setAttribute('data-msg-idx', msgIdx);

  var starHtml = typeof bookmarkStarHtml === 'function' ? bookmarkStarHtml(msgIdx) : '';
  var bookmarkedClass = (activeSessionId && typeof isBookmarked === 'function' && isBookmarked(activeSessionId, msgIdx)) ? ' bookmarked' : '';

  if (role === 'user') {
    var attachmentsHtml = '';
    if (attachments && attachments.length) {
      attachmentsHtml = '<div class="message-attachments">';
      for (var ai = 0; ai < attachments.length; ai++) {
        var att = attachments[ai];
        if (!att || !att.dataBase64 || !att.mediaType) continue;
        var dataUrl = 'data:' + att.mediaType + ';base64,' + att.dataBase64;
        var altText = esc(att.name || 'attached image');
        attachmentsHtml +=
          '<img class="message-attachment-img" src="' + dataUrl + '" alt="' + altText + '" title="' + altText + '" onclick="window.open(this.src, \'_blank\')">';
      }
      attachmentsHtml += '</div>';
    }
    var textHtml = content ? linkifyFilePaths(esc(content)) : '';
    div.innerHTML =
      '<div class="message-meta">You</div>' +
      '<div class="message-bubble">' + attachmentsHtml + textHtml + '</div>' +
      '<div class="message-actions">' + starHtml + '</div>';
  } else {
    var displayContent = stripGateFence(content);
    div.innerHTML =
      '<div class="message-meta">' +
      '<span class="meta-dot" style="background:' + info.color + '; color:' + info.color + '"></span>' +
      esc(info.label) +
      '</div>' +
      '<div class="message-bubble" data-raw-md="' + esc(displayContent) + '">' + linkifyFilePaths(renderMarkdown(displayContent)) + '</div>' +
      '<div class="message-actions">' + starHtml + '<button class="msg-copy-btn" onclick="copyMessageContent(this)">Copy</button></div>';
  }

  // Apply bookmarked state to star
  if (bookmarkedClass) {
    var star = div.querySelector('.bookmark-star');
    if (star) star.classList.add('bookmarked');
  }

  container.appendChild(div);

  // Remove gathering class after animation completes
  if (role !== 'user' && !skipAnimation) {
    setTimeout(function() { div.classList.remove('gathering'); }, 600);
    // AI Engineer micro-glitch
    if (currentAgent === 'ai-engineer' && Math.random() < 0.3) {
      var bubble = div.querySelector('.message-bubble');
      if (bubble) {
        setTimeout(function() {
          bubble.classList.add('glitch-active');
          setTimeout(function() { bubble.classList.remove('glitch-active'); }, 300);
        }, 800 + Math.random() * 2000);
      }
    }
  }

  // Auto-collapse long assistant messages
  if (role !== 'user') {
    var bubble = div.querySelector('.message-bubble');
    if (bubble && bubble.scrollHeight > 500) {
      bubble.classList.add('collapsed');
      var showMore = document.createElement('button');
      showMore.className = 'show-more-btn';
      showMore.textContent = 'Show more';
      showMore.onclick = function() {
        bubble.classList.remove('collapsed');
        showMore.remove();
      };
      div.querySelector('.message-actions').before(showMore);
    }
    // Inject gate buttons if this is the last message and agent is waiting
    if (isGateMessage(content) && session && !session.chatResponding) {
      injectGateButtons(div);
    }
  }

  container.scrollTop = container.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// Slash command autocomplete
// ═══════════════════════════════════════════════════════════════

var slashSuggestionItems = [];
var slashSuggestionIdx = -1;

var SLASH_UTILITY_CMDS = [
  { cmd: 'compact', desc: 'Summarize conversation to free up context' },
  { cmd: 'clear',   desc: 'Clear the messages panel' },
  { cmd: 'help',    desc: 'Show available commands' },
  { cmd: 'stop',    desc: 'Stop the current session' },
  { cmd: 'init',    desc: 'Initialize a CLAUDE.md file' },
  { cmd: 'exit',    desc: 'End the current session' },
  { cmd: 'context', desc: 'Show current token usage' },
  { cmd: 'rewind',  desc: 'Restore to a previous point' },
  { cmd: 'config',  desc: 'Open settings panel' },
  { cmd: 'model',   desc: 'Change the active LLM model' },
  { cmd: 'effort',  desc: 'Set compute intensity (low/medium/high)' },
  { cmd: 'mode',    desc: 'Cycle permission mode (Shift+Tab)' },
];

function buildSlashCommands(prefix) {
  var all = SLASH_UTILITY_CMDS.slice();
  if (agentList) {
    for (var i = 0; i < agentList.length; i++) {
      var info = AGENTS[agentList[i].name] || {};
      all.push({ cmd: agentList[i].name, desc: info.label ? 'Switch to ' + info.label : (agentList[i].description || '') });
    }
  }
  if (prefix) {
    all = all.filter(function(c) { return c.cmd.indexOf(prefix) === 0; });
  }
  return all;
}

function updateSlashSuggestions() {
  var input = document.getElementById('chat-input');
  var val = input.value;
  var suggestions = document.getElementById('slash-suggestions');
  if (!val.startsWith('/') || val.indexOf(' ') !== -1) {
    hideSlashSuggestions();
    return;
  }
  var prefix = val.slice(1).toLowerCase();
  slashSuggestionItems = buildSlashCommands(prefix);
  if (slashSuggestionItems.length === 0) {
    hideSlashSuggestions();
    return;
  }
  slashSuggestionIdx = -1;
  renderSlashSuggestions(suggestions);
}

function renderSlashSuggestions(container) {
  container.innerHTML = '';
  for (var i = 0; i < slashSuggestionItems.length; i++) {
    var item = slashSuggestionItems[i];
    var div = document.createElement('div');
    div.className = 'slash-suggestion' + (i === slashSuggestionIdx ? ' active' : '');
    div.innerHTML =
      '<span class="slash-suggestion-cmd">/' + esc(item.cmd) + '</span>' +
      '<span class="slash-suggestion-desc">' + esc(item.desc) + '</span>';
    div.addEventListener('mousedown', (function(cmd) {
      return function(e) {
        e.preventDefault();
        applySlashSuggestion(cmd);
      };
    })(item.cmd));
    container.appendChild(div);
  }
  container.classList.add('visible');
}

function hideSlashSuggestions() {
  var suggestions = document.getElementById('slash-suggestions');
  if (suggestions) {
    suggestions.classList.remove('visible');
    suggestions.innerHTML = '';
  }
  slashSuggestionItems = [];
  slashSuggestionIdx = -1;
}

function applySlashSuggestion(cmd) {
  var input = document.getElementById('chat-input');
  // Commands that take no args — send immediately
  var noArgCmds = ['compact', 'clear', 'stop', 'help', 'init', 'exit', 'context', 'rewind', 'config', 'mode'];
  var isAgent = agentList && agentList.some(function(a) { return a.name === cmd; });
  if (noArgCmds.indexOf(cmd) !== -1 || isAgent) {
    input.value = '/' + cmd;
  } else {
    input.value = '/' + cmd + ' ';
  }
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  input.focus();
  hideSlashSuggestions();
}

function slashSuggestionKeydown(e) {
  var suggestions = document.getElementById('slash-suggestions');
  if (!suggestions || !suggestions.classList.contains('visible')) return false;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    slashSuggestionIdx = Math.min(slashSuggestionIdx + 1, slashSuggestionItems.length - 1);
    renderSlashSuggestions(suggestions);
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    slashSuggestionIdx = Math.max(slashSuggestionIdx - 1, -1);
    renderSlashSuggestions(suggestions);
    return true;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    if (slashSuggestionIdx >= 0 && slashSuggestionItems[slashSuggestionIdx]) {
      applySlashSuggestion(slashSuggestionItems[slashSuggestionIdx].cmd);
    } else if (slashSuggestionItems.length === 1) {
      applySlashSuggestion(slashSuggestionItems[0].cmd);
    }
    return true;
  }
  if (e.key === 'Enter' && slashSuggestionIdx >= 0) {
    e.preventDefault();
    applySlashSuggestion(slashSuggestionItems[slashSuggestionIdx].cmd);
    return true;
  }
  if (e.key === 'Escape') {
    hideSlashSuggestions();
    return true;
  }
  return false;
}

// Apply split/single layout CSS classes from the current splitMode global
function applySplitLayout() {
  var chatPane = document.getElementById('chat-pane');
  if (splitMode) {
    chatPane.classList.add('split-visible');
    chatPane.style.flex = '1';
    document.getElementById('file-pane').style.flex = '1';
  } else {
    chatPane.classList.remove('split-visible', 'collapsed');
    chatPane.style.flex = '';
    chatPane.style.width = '';
    document.getElementById('file-pane').style.flex = '';
  }
}

// ═══════════════════════════════════════════════════════════════
// Permission approval cards
// ═══════════════════════════════════════════════════════════════


function renderPermissionCard(id, tool, command, sessionId) {
  var session = getActiveSession();
  var container = document.getElementById('messages');
  if (session && !session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }

  var card = document.createElement('div');
  card.className = 'permission-card';
  card.setAttribute('data-permission-id', id);

  var displayCmd = esc(command || '');
  var isLong = command && command.length > 120;
  var truncated = isLong ? esc(command.slice(0, 120)) + '...' : displayCmd;

  card.innerHTML =
    '<div class="permission-header">' +
      '<span class="permission-lock">&#128274;</span>' +
      '<span class="permission-title">Permission Required</span>' +
    '</div>' +
    '<div class="permission-tool">' + esc(tool || 'Bash') + '</div>' +
    '<div class="permission-command">' +
      '<code class="permission-command-text">' + (isLong ? truncated : displayCmd) + '</code>' +
      (isLong ? '<button class="permission-show-more">show more</button>' : '') +
    '</div>' +
    '<div class="permission-actions">' +
      '<button class="permission-btn permission-btn-allow" data-action="allow">Allow Once</button>' +
      '<button class="permission-btn permission-btn-always" data-action="allow" data-persist="true">Always Allow</button>' +
      '<button class="permission-btn permission-btn-deny" data-action="deny">Deny</button>' +
      '<button class="permission-btn permission-btn-always-deny" data-action="deny" data-persist="true">Always Deny</button>' +
    '</div>';

  if (isLong) {
    var cmdEl = card.querySelector('.permission-command');
    cmdEl.setAttribute('data-full-cmd', command);
    card.querySelector('.permission-show-more').addEventListener('click', function() {
      cmdEl.querySelector('.permission-command-text').textContent = command;
      this.remove();
    });
  }

  // Use addEventListener instead of inline onclick to avoid escaping issues
  // with double quotes, backslashes, and newlines in command strings
  var btns = card.querySelectorAll('.permission-btn');
  for (var i = 0; i < btns.length; i++) {
    (function(btn) {
      btn.addEventListener('click', function() {
        submitPermission(id, btn.getAttribute('data-action'), btn.getAttribute('data-persist') === 'true', command);
      });
    })(btns[i]);
  }

  container.appendChild(card);
  container.scrollTop = container.scrollHeight;

}

function disablePermissionCard(id) {
  var card = document.querySelector('[data-permission-id="' + id + '"].permission-card');
  if (!card) return;
  var btns = card.querySelectorAll('.permission-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].disabled = true;
  }
}

function enablePermissionCard(id) {
  var card = document.querySelector('[data-permission-id="' + id + '"].permission-card');
  if (!card) return;
  var btns = card.querySelectorAll('.permission-btn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].disabled = false;
  }
}

async function submitPermission(id, decision, persist, command) {
  disablePermissionCard(id);
  try {
    await authFetch('/chat/permission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, decision: decision, persist: persist, command: command }),
    });
  } catch (err) {
    showPermissionCardError(id, 'Failed to submit. Try again.');
    enablePermissionCard(id);
  }
}

function showPermissionCardError(id, msg) {
  var card = document.querySelector('[data-permission-id="' + id + '"].permission-card');
  if (!card) return;
  var existing = card.querySelector('.permission-error');
  if (existing) existing.remove();
  var errDiv = document.createElement('div');
  errDiv.className = 'permission-error';
  errDiv.textContent = msg;
  card.appendChild(errDiv);
}

function resolvePermissionCard(id, decision) {
  var card = document.querySelector('[data-permission-id="' + id + '"].permission-card');
  if (!card) return;

  // Replace card content with resolved state
  var isAllow = decision === 'allow';
  card.innerHTML =
    '<div class="permission-resolved ' + (isAllow ? 'allowed' : 'denied') + '">' +
      (isAllow ? '&#10003; Allowed' : '&#10007; Denied') +
    '</div>';

  // Fade out after 2s
  setTimeout(function() {
    card.classList.add('fade-out');
    setTimeout(function() { card.remove(); }, 500);
  }, 2000);
}

// ═══════════════════════════════════════════════════════════════
// Gate block banner (gate hook returned decision:block)
// ═══════════════════════════════════════════════════════════════
//
// Pushed by the server's /gate-state-stream SSE channel when a new entry
// appears in .shards/gates/violations.jsonl. Rendered as a chip above the
// most recent assistant message so the user can see *why* the turn was
// blocked (the agent's text alone doesn't reveal the hook's decision).

function renderGateBlockBanner(evt) {
  if (!evt) return;
  var container = document.getElementById('messages');
  if (!container) return;

  // Find the last assistant bubble in the active session.
  var bubbles = container.querySelectorAll('.message.assistant');
  var anchor = bubbles.length > 0 ? bubbles[bubbles.length - 1] : null;

  var banner = document.createElement('div');
  banner.className = 'gate-block-banner';
  var reason = evt.reason || 'Gate violation';
  var detail = [];
  if (evt.kind) detail.push(evt.kind);
  if (evt.gateId) detail.push('gate ' + evt.gateId);
  if (evt.phase) detail.push('phase ' + evt.phase);
  var detailStr = detail.length > 0 ? ' (' + detail.join(', ') + ')' : '';
  banner.innerHTML =
    '<span class="gate-block-icon">⛔</span>' +
    '<span class="gate-block-text"><strong>Blocked:</strong> ' +
      (typeof esc === 'function' ? esc(reason) : reason) +
      (typeof esc === 'function' ? esc(detailStr) : detailStr) +
    '</span>' +
    '<button class="gate-block-dismiss" type="button" aria-label="Dismiss">×</button>';

  banner.querySelector('.gate-block-dismiss').onclick = function() {
    banner.remove();
  };

  if (anchor && anchor.parentElement) {
    anchor.parentElement.insertBefore(banner, anchor);
  } else {
    container.appendChild(banner);
  }
  container.scrollTop = container.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// Gate mode disabled banner
// ═══════════════════════════════════════════════════════════════
//
// Surfaces SHARDS_GATE_ENFORCE=0 / SHARDS_CHECKPOINT_ENFORCE=0 /
// SHARDS_AUTO_VERIFY=0 to the user. Without this the Confirm/Request-Changes
// buttons render normally even though the hook will ignore the response,
// which is misleading (Bug M4 in the audit).

function renderGateModeBanner(mode) {
  if (!mode) return;
  var host = document.getElementById('chat-pane') ||
             document.getElementById('messages') ||
             document.body;
  if (!host) return;

  var existing = document.getElementById('gate-mode-banner');
  var flags = [];
  if (mode.enforce === false) flags.push('SHARDS_GATE_ENFORCE=0');
  if (mode.checkpointEnforce === false) flags.push('SHARDS_CHECKPOINT_ENFORCE=0');
  if (mode.autoVerify === false) flags.push('SHARDS_AUTO_VERIFY=0');

  if (flags.length === 0) {
    if (existing) existing.remove();
    return;
  }

  var msg;
  if (mode.enforce === false) {
    msg = '⚠ Gate enforcement disabled (' + flags.join(', ') + ') — gates are advisory only.';
  } else {
    msg = '⚠ Reduced gate enforcement (' + flags.join(', ') + ').';
  }

  if (existing) {
    existing.textContent = msg;
    return;
  }

  var banner = document.createElement('div');
  banner.id = 'gate-mode-banner';
  banner.className = 'gate-mode-banner';
  banner.textContent = msg;

  // Insert at the top of the chat pane so it's always visible.
  if (host.firstChild) {
    host.insertBefore(banner, host.firstChild);
  } else {
    host.appendChild(banner);
  }
}

function rebuildMessages(msgArray) {
  var session = getActiveSession();
  var container = document.getElementById('messages');
  container.innerHTML = '';
  if (session) session.hasMessages = false;
  if (msgArray.length === 0) {
    container.innerHTML = '<div class="empty-state">Select an agent to start chatting</div>';
    return;
  }
  for (var i = 0; i < msgArray.length; i++) {
    addMessageDirect(msgArray[i].role, msgArray[i].content, msgArray[i].agent, true, msgArray[i].attachments);
  }
}
