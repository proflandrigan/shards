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
  for (var i = 0; i < agentList.length; i++) {
    var agent = agentList[i];
    var info = AGENTS[agent.name] || { color: '#666', label: agent.name };
    var card = document.createElement('div');
    card.className = 'agent-card';
    card.innerHTML =
      '<span class="agent-card-dot" style="background:' + info.color + '"></span>' +
      '<span class="agent-card-name">' + esc(info.label) + '</span>' +
      '<span class="agent-card-desc">' + esc(info.desc || agent.description || '') + '</span>';
    card.addEventListener('click', (function(name) { return function() { startChat(name); }; })(agent.name));
    picker.appendChild(card);
  }
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

async function startChat(agentName) {
  try {
    var res = await authFetch('/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentName }),
    });
    var data = await res.json();
    if (data.error) {
      addSystemNotice(data.error);
      return;
    }

    chatSessionId = data.sessionId;
    chatAgent = agentName;
    chatMessages = [];
    chatResponding = false;

    showChatView();
    document.getElementById('messages').innerHTML = '';
    hasMessages = false;

    activateAgent(agentName);

    // Make sure chat pane is visible
    if (!splitMode) {
      activeTabId = 'chat';
      renderWsTabs();
      showActiveContent();
    }

    document.getElementById('chat-input').focus();
  } catch (err) {}
}

async function sendChatMessage() {
  var input = document.getElementById('chat-input');
  var message = input.value.trim();
  if (!message || chatResponding) return;

  input.value = '';

  // Client-side /clear — no server round-trip needed
  if (message.toLowerCase() === '/clear') {
    document.getElementById('messages').innerHTML = '';
    chatMessages = [];
    hasMessages = false;
    return;
  }

  try {
    var res = await authFetch('/chat/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, sessionId: chatSessionId }),
    });
    var data = await res.json();

    // Update client state for agent switches
    if (data.switched && data.agent) {
      chatSessionId = data.sessionId;
      chatAgent = data.agent;
      chatMessages = [];
    } else if (data.compacted && data.sessionId) {
      chatSessionId = data.sessionId;
    }
  } catch (err) {}
}

async function stopChat() {
  try {
    await authFetch('/chat/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: chatSessionId }) });
  } catch(e) {}
  endChatSession();
}

function endChatSession() {
  chatSessionId = null;
  chatAgent = null;
  chatResponding = false;
  pendingBubble = null;
  tokenBuffer = '';

  setChatInputEnabled(true);
  showAgentPicker();
}

function setChatInputEnabled(enabled) {
  var input = document.getElementById('chat-input');
  var btn = document.getElementById('chat-send-btn');
  input.disabled = !enabled;
  btn.disabled = !enabled;
  chatResponding = !enabled;
}

// ═══════════════════════════════════════════════════════════════
// Streaming token display
// ═══════════════════════════════════════════════════════════════

function ensurePendingBubble() {
  if (pendingBubble) return;

  var container = document.getElementById('messages');
  if (!hasMessages) { container.innerHTML = ''; hasMessages = true; }

  var info = AGENTS[chatAgent] || { color: '#666', label: chatAgent || 'Agent' };
  var div = document.createElement('div');
  div.className = 'message assistant';
  div.innerHTML =
    '<div class="message-meta">' +
    '<span class="meta-dot" style="background:' + info.color + '"></span>' +
    esc(info.label) +
    '</div>' +
    '<div class="message-bubble" style="border-left-color:' + info.color + '"></div>';
  container.appendChild(div);
  pendingBubble = div.querySelector('.message-bubble');
  container.scrollTop = container.scrollHeight;
}

function appendToken(text) {
  tokenBuffer += text;
  if (!tokenFlushPending) {
    tokenFlushPending = true;
    requestAnimationFrame(flushTokens);
  }
}

function flushTokens() {
  tokenFlushPending = false;
  if (!pendingBubble || !tokenBuffer) return;
  pendingBubble.appendChild(document.createTextNode(tokenBuffer));
  tokenBuffer = '';
  var container = document.getElementById('messages');
  container.scrollTop = container.scrollHeight;
}

function finalizePendingBubble(markdownContent) {
  flushTokens();
  if (pendingBubble) {
    pendingBubble.innerHTML = renderMarkdown(markdownContent);
    pendingBubble = null;
  }
  tokenBuffer = '';
  var container = document.getElementById('messages');
  container.scrollTop = container.scrollHeight;
}

function addToolIndicator(toolName) {
  var container = document.getElementById('messages');
  if (!hasMessages) { container.innerHTML = ''; hasMessages = true; }
  var div = document.createElement('div');
  div.className = 'tool-indicator';
  div.innerHTML = '<span class="tool-name">' + esc(toolName) + '</span>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// Conversation panel
// ═══════════════════════════════════════════════════════════════

function addSystemNotice(text, opts) {
  var container = document.getElementById('messages');
  if (!hasMessages) { container.innerHTML = ''; hasMessages = true; }
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
  var container = document.getElementById('messages');
  if (!hasMessages) { container.innerHTML = ''; hasMessages = true; }

  var info = AGENTS[agent] || { color: '#666', label: agent || 'Unknown' };
  var div = document.createElement('div');
  div.className = 'message ' + (role === 'user' ? 'user' : 'assistant');

  if (role === 'user') {
    div.innerHTML =
      '<div class="message-meta">You</div>' +
      '<div class="message-bubble">' + esc(content) + '</div>';
  } else {
    div.innerHTML =
      '<div class="message-meta">' +
      '<span class="meta-dot" style="background:' + info.color + '"></span>' +
      esc(info.label) +
      '</div>' +
      '<div class="message-bubble" style="border-left-color:' + info.color + '">' + renderMarkdown(content) + '</div>';
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function rebuildMessages(msgArray) {
  var container = document.getElementById('messages');
  container.innerHTML = '';
  hasMessages = false;
  if (msgArray.length === 0) {
    container.innerHTML = '<div class="empty-state">Select an agent to start chatting</div>';
    return;
  }
  for (var i = 0; i < msgArray.length; i++) {
    addMessageDirect(msgArray[i].role, msgArray[i].content, msgArray[i].agent);
  }
}
