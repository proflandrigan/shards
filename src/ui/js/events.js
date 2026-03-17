// ═══════════════════════════════════════════════════════════════
// SSE connection
// ═══════════════════════════════════════════════════════════════

function handleSSEEvent(e) {
  var data;
  try { data = JSON.parse(e.data); } catch(err) { return; }

  switch (data.type) {
    case 'connected': break;

    case 'user-message':
    case 'agent-message':
      break;

    case 'agent-activated':
      break;

    case 'agent-changed':
      break;

    case 'agent-consulting':
      break;

    case 'artifact-updated':
      handleArtifactUpdate(data.path, data.content, data.sessionFile);
      break;

    case 'file-touched':
      sessionTouchedFiles.add(data.path);
      break;

    case 'event-log':
      break;

    case 'session-end':
      sessionTouchedFiles.clear();
      break;

    // ─── Chat events ─────────────────────────────────────────
    case 'chat-started':
      break;

    case 'chat-user-message':
      chatMessages.push({ role: 'user', content: data.content, agent: data.agent });
      addMessageDirect('user', data.content, data.agent);
      setChatInputEnabled(false);
      break;

    case 'chat-token':
      ensurePendingBubble();
      appendToken(data.text);
      break;

    case 'chat-tool-use':
      if (pendingBubble && tokenBuffer) flushTokens();
      addToolIndicator(data.tool);
      break;

    case 'chat-tool-input-delta':
      break;

    case 'chat-block-stop':
      break;

    case 'chat-message':
      chatMessages.push({ role: 'assistant', content: data.content, agent: data.agent });
      if (pendingBubble) {
        finalizePendingBubble(data.content);
      } else {
        addMessageDirect('assistant', data.content, data.agent);
      }
      break;

    case 'chat-turn-end':
      setChatInputEnabled(true);
      document.getElementById('chat-input').focus();
      break;

    case 'chat-init':
      break;

    case 'chat-error':
      addSystemNotice(data.error || 'An error occurred');
      setChatInputEnabled(true);
      break;

    case 'chat-stderr': {
      // Check for auth/login related messages
      var txt = (data.text || '').toLowerCase();
      if (txt.includes('login') || txt.includes('auth') || txt.includes('api key') || txt.includes('not logged in') || txt.includes('credential')) {
        addSystemNotice('Claude CLI is not authenticated. Run "claude login" in your terminal first, then try again.');
      }
      break;
    }

    case 'chat-ended':
      if (data.code && data.code !== 0) {
        addSystemNotice('Session ended unexpectedly (exit code ' + data.code + '). If Claude CLI is not logged in, run "claude login" in your terminal.');
      }
      endChatSession();
      break;
  }
}

function connect() {
  var indicator = document.getElementById('conn-indicator');
  var text = document.getElementById('conn-text');
  var es = new EventSource('/events');

  es.onopen = function() {
    indicator.className = 'conn-indicator connected';
    text.textContent = 'Connected';
  };
  es.onmessage = handleSSEEvent;
  es.onerror = function() {
    indicator.className = 'conn-indicator disconnected';
    text.textContent = 'Reconnecting...';
    es.close();
    setTimeout(connect, 3000);
  };
}
