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

  // JFL hero card (pinned, unaffected by search)
  var jflAgent = agentList.find(function(a) { return a.name === 'jfl'; });
  if (jflAgent) {
    var jflInfo = AGENTS['jfl'] || { color: '#FFD700', label: 'JFL (Orchestrator)' };
    var hero = document.createElement('div');
    hero.className = 'agent-card agent-card-hero';
    hero.innerHTML =
      '<span class="agent-card-dot" style="background:' + jflInfo.color + '"></span>' +
      '<div class="agent-card-hero-body">' +
        '<span class="agent-card-name">' + esc(jflInfo.label) + '</span>' +
        '<span class="agent-card-hero-tagline">Describe what you need above and press Enter — JFL will route you to the right specialist.</span>' +
      '</div>';
    hero.addEventListener('click', function() { startNewSession('jfl'); });
    picker.appendChild(hero);
  }

  // Non-JFL agents grouped by category
  var CATEGORY_ORDER = ['data', 'mlai', 'review'];
  var CATEGORY_LABELS = { data: 'DATA', mlai: 'ML / AI', review: 'REVIEW' };

  var grouped = {};
  CATEGORY_ORDER.forEach(function(cat) { grouped[cat] = []; });
  for (var i = 0; i < agentList.length; i++) {
    var agent = agentList[i];
    if (agent.name === 'jfl') continue;
    var info = AGENTS[agent.name];
    if (!info) continue;
    var cat = info.category || 'review';
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
      var agentInfo = AGENTS[agent.name] || { color: '#666', label: agent.name };
      var card = document.createElement('div');
      card.className = 'agent-card';
      card.innerHTML =
        '<span class="agent-card-dot" style="background:' + agentInfo.color + '"></span>' +
        '<span class="agent-card-name">' + esc(agentInfo.label) + '</span>' +
        '<span class="agent-card-desc">' + esc(agentInfo.desc || agent.description || '') + '</span>';
      card.addEventListener('click', (function(name) { return function() { startNewSession(name); }; })(agent.name));
      picker.appendChild(card);
    });
  });

  // Prompt → JFL auto-start
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var q = searchInput.value.trim();
      startNewSession('jfl', q || undefined);
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

async function startNewSession(agentName, initialMessage) {
  try {
    var body = { agent: agentName };
    if (initialMessage) body.initialMessage = initialMessage;
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
  } catch (err) {}
}

async function sendChatMessage() {
  var session = getActiveSession();
  var input = document.getElementById('chat-input');
  var message = input.value.trim();
  if (!message || !session || session.chatResponding) return;

  input.value = '';
  input.style.height = 'auto';

  // Client-side /clear — no server round-trip needed
  if (message.toLowerCase() === '/clear') {
    document.getElementById('messages').innerHTML = '';
    session.messages = [];
    session.hasMessages = false;
    return;
  }

  try {
    var res = await authFetch('/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, sessionId: activeSessionId }),
    });
    var data = await res.json();

    // Update client state for agent switches
    if (data.switched && data.agent) {
      replaceSessionInTab(activeSessionId, data.sessionId, data.agent);
    }
  } catch (err) {}
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
  } catch(e) {}
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
  } catch(e) {}
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
}

// ═══════════════════════════════════════════════════════════════
// Session tab bar
// ═══════════════════════════════════════════════════════════════

function renderSessionTabs() {
  var bar = document.getElementById('header-session-bar');
  if (!bar) return;

  bar.innerHTML = '';

  for (var i = 0; i < sessionOrder.length; i++) {
    var sid = sessionOrder[i];
    var session = chatSessions[sid];
    if (!session) continue;

    var info = AGENTS[session.agent] || { color: '#666', label: session.agent };
    var tab = document.createElement('div');
    tab.className = 'session-tab' + (sid === activeSessionId ? ' active' : '') + (session.unread ? ' unread' : '');
    tab.style.setProperty('--tab-color', info.color);

    var titleText = session.title || info.label;
    tab.innerHTML =
      '<span class="session-tab-dot" style="background:' + info.color + '"></span>' +
      '<span class="session-tab-title">' + esc(titleText) + '</span>' +
      '<span class="session-tab-close" title="Close session">&times;</span>';

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

  // Dispose DOM-bound instances before swapping workspace
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
        addMessageDirect(newSession.messages[i].role, newSession.messages[i].content, newSession.messages[i].agent);
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
  renderSessionTabs();

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
      }).catch(function() {});
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
  div.className = 'message assistant';
  div.innerHTML =
    '<div class="message-meta">' +
    '<span class="meta-dot" style="background:' + info.color + '"></span>' +
    esc(info.label) +
    '</div>' +
    '<div class="message-bubble" style="border-left-color:' + info.color + '"></div>';
  container.appendChild(div);
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
    var rendered = renderMarkdown(markdownContent);
    session.pendingBubble.innerHTML = linkifyFilePaths(rendered);
    session.pendingBubble.setAttribute('data-raw-md', markdownContent);
    // Add message-level copy button
    var actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = '<button class="msg-copy-btn" onclick="copyMessageContent(this)">Copy</button>';
    session.pendingBubble.parentElement.appendChild(actions);
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
    session.pendingBubble = null;
  }
  session.tokenBuffer = '';
  var container = document.getElementById('messages');
  container.scrollTop = container.scrollHeight;
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

function addMessageDirect(role, content, agent) {
  var session = getActiveSession();
  var container = document.getElementById('messages');
  if (session && !session.hasMessages) { container.innerHTML = ''; session.hasMessages = true; }

  var info = AGENTS[agent] || { color: '#666', label: agent || 'Unknown' };
  var div = document.createElement('div');
  div.className = 'message ' + (role === 'user' ? 'user' : 'assistant');

  if (role === 'user') {
    div.innerHTML =
      '<div class="message-meta">You</div>' +
      '<div class="message-bubble">' + linkifyFilePaths(esc(content)) + '</div>';
  } else {
    div.innerHTML =
      '<div class="message-meta">' +
      '<span class="meta-dot" style="background:' + info.color + '"></span>' +
      esc(info.label) +
      '</div>' +
      '<div class="message-bubble" data-raw-md="' + esc(content).replace(/"/g, '&quot;') + '" style="border-left-color:' + info.color + '">' + linkifyFilePaths(renderMarkdown(content)) + '</div>' +
      '<div class="message-actions"><button class="msg-copy-btn" onclick="copyMessageContent(this)">Copy</button></div>';
  }

  container.appendChild(div);

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
  var noArgCmds = ['compact', 'clear', 'stop', 'help'];
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
    addMessageDirect(msgArray[i].role, msgArray[i].content, msgArray[i].agent);
  }
}
