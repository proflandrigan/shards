// ═══════════════════════════════════════════════════════════════
// SSE connection
// ═══════════════════════════════════════════════════════════════

function isChatEvent(type) {
  return type && (type.indexOf('chat-') === 0 || type === 'agent-consulting' || type === 'permission-request' || type === 'permission-resolved');
}

function handleSSEEvent(e) {
  var data;
  try { data = JSON.parse(e.data); } catch(err) { return; }

  if (data.type === 'connected') return;

  if (isChatEvent(data.type)) {
    var session = getSessionState(data.sessionId);
    // For events without sessionId, fall back to active session
    if (!session && !data.sessionId) {
      session = getActiveSession();
    }
    if (!session) {
      // Unknown session — ignore (e.g., chat-ended for already-removed session)
      return;
    }
    var isActive = (session.sessionId === activeSessionId);
    handleChatEventForSession(data, session, isActive);
  } else {
    handleGlobalEvent(data);
  }
}

function handleGlobalEvent(data) {
  switch (data.type) {
    case 'user-message':
    case 'agent-message':
    case 'agent-activated':
    case 'agent-changed':
    case 'event-log':
      break;

    case 'agent-consulting':
      // Handled as chat event via isChatEvent
      break;

    case 'artifact-updated':
      handleArtifactUpdate(data.path, data.content, data.sessionFile);
      // Also update the file in other sessions' workspaces (state only)
      for (var artSid in chatSessions) {
        if (artSid === activeSessionId) continue;
        var sessFiles = chatSessions[artSid].openFiles;
        if (data.path in sessFiles) {
          var sf = sessFiles[data.path];
          if (!sf.modified && !sf.editMode) {
            sf.content = data.content;
            sf.originalContent = data.content;
            sf.tabularData = null;
            sf.notebookData = null;
          }
        }
      }
      break;

    case 'file-touched': {
      // Route to the correct session's touched-files set
      var ftSess = data.sessionId ? getSessionState(data.sessionId) : getActiveSession();
      if (ftSess) {
        ftSess.sessionTouchedFiles.add(data.path);
      } else {
        sessionTouchedFiles.add(data.path);
      }
      // Only refresh explorer UI when it's the active session's file
      if (!data.sessionId || data.sessionId === activeSessionId) {
        if (explorerViewMode === 'tree') renderTree();
        else if (currentBrowseDir) browseDir(currentBrowseDir);
        if (typeof renderSessionFiles === 'function') renderSessionFiles();
      }
      break;
    }

    case 'session-end': {
      // Clear only the ending session's touched-files set
      var seSess = data.sessionId ? getSessionState(data.sessionId) : getActiveSession();
      if (seSess) {
        seSess.sessionTouchedFiles = new Set();
        if (seSess.sessionId === activeSessionId) sessionTouchedFiles = seSess.sessionTouchedFiles;
      } else {
        sessionTouchedFiles.clear();
      }
      break;
    }

    // ─── Agent-pushed panel events ────────────────────────────────────
    case 'ui-panel':
      openPanelTab(data.panelId, data);
      break;

    case 'ui-panel-close':
      if (data.panelId) closePanelTab(data.panelId);
      break;

    case 'ui-panel-update':
      updatePanelData(data.panelId, data.data);
      break;
  }
}

function handleChatEventForSession(data, session, isActive) {
  switch (data.type) {
    case 'chat-started':
      break;

    case 'chat-user-message':
      session.messages.push({ role: 'user', content: data.content, agent: data.agent });
      if (isActive) {
        addMessageDirect('user', data.content, data.agent);
        setChatInputEnabled(false);
        showThinkingIndicator();
      } else {
        session.chatResponding = true;
        session.domDirty = true;
      }
      break;

    case 'chat-token':
      if (isActive) {
        removeThinkingIndicator();
        ensurePendingBubble();
        appendToken(data.text);
      }
      // Skip token rendering for inactive sessions
      break;

    case 'chat-tool-use':
      if (isActive) {
        removeThinkingIndicator();
        if (session.pendingBubble && session.tokenBuffer) flushTokens();
        if (data.tool === 'Task') showConsultingIndicator();
        addToolIndicator(data.tool);
      }
      break;

    case 'chat-tool-input-delta':
      break;

    case 'chat-block-stop':
      if (isActive && session.chatResponding && !session.thinkingIndicatorEl && !session.workingIndicatorEl) {
        showThinkingIndicator();
      }
      break;

    case 'chat-message':
      session.messages.push({ role: 'assistant', content: data.content, agent: data.agent });
      if (isActive) {
        if (session.pendingBubble) {
          finalizePendingBubble(data.content);
        } else {
          addMessageDirect('assistant', data.content, data.agent);
        }
      } else {
        session.domDirty = true;
        session.unread = true;
        renderSessionTabs();
        updateTitleNotification();
      }
      break;

    case 'chat-turn-end':
      session.chatResponding = false;
      if (isActive) {
        removeThinkingIndicator();
        setChatInputEnabled(true);
        document.getElementById('chat-input').focus();
      } else {
        session.needsAttention = true;
        session.attentionReason = 'turn-end';
        renderSessionTabs();
        showNotificationToast(session, 'Waiting for input');
        updateTitleNotification();
      }
      break;

    case 'chat-init':
      break;

    case 'chat-error':
      session.chatResponding = false;
      if (isActive) {
        removeThinkingIndicator();
        addSystemNotice(data.error || 'An error occurred');
        setChatInputEnabled(true);
      } else {
        session.needsAttention = true;
        session.attentionReason = 'error';
        session.domDirty = true;
        renderSessionTabs();
        showNotificationToast(session, 'Error occurred');
        updateTitleNotification();
      }
      break;

    case 'chat-stderr': {
      if (!isActive) break;
      var txt = (data.text || '').toLowerCase();
      var authPhrases = ['not logged in', 'authentication required', 'invalid api key', 'api key expired', 'please login', 'please log in', 'run claude login', 'unauthorized', 'auth token'];
      var isAuth = false;
      for (var ap = 0; ap < authPhrases.length; ap++) {
        if (txt.includes(authPhrases[ap])) { isAuth = true; break; }
      }
      if (isAuth) {
        addSystemNotice('Claude CLI auth error: ' + (data.text || 'unknown') + '\n\nRun "claude login" in your terminal, then try again.');
      }
      break;
    }

    case 'chat-agent-switching':
      session.chatTransitioning = true;
      if (isActive) {
        // Reset streaming state
        session.pendingBubble = null;
        session.tokenBuffer = '';
        session.messages = [];
        session.hasMessages = false;
        document.getElementById('messages').innerHTML = '';
        addSystemNotice('Switching to ' + (AGENTS[data.to] ? AGENTS[data.to].label : data.to) + '...');
        session.agent = data.to;
        activateAgent(data.to);
        setChatInputEnabled(false);
        renderSessionTabs();
      } else {
        session.messages = [];
        session.agent = data.to;
        session.domDirty = true;
      }
      break;

    case 'chat-system-notice':
      if (isActive) {
        addSystemNotice(data.text);
      }
      break;

    case 'chat-clear-messages':
      session.messages = [];
      if (isActive) {
        document.getElementById('messages').innerHTML = '';
        session.hasMessages = false;
      } else {
        session.domDirty = true;
      }
      break;

    case 'chat-ended':
      // Ignore chat-ended during compact or agent switch
      if (session.chatTransitioning) {
        session.chatTransitioning = false;
        break;
      }
      if (data.code && data.code !== 0 && isActive) {
        addSystemNotice('Session ended unexpectedly (exit code ' + data.code + '). If Claude CLI is not logged in, run "claude login" in your terminal.');
      }
      endSessionTab(session.sessionId);
      break;

    case 'agent-consulting':
      if (isActive) {
        updateConsultingIndicator(data.agent);
      }
      break;

    case 'permission-request':
      if (isActive) {
        renderPermissionCard(data.id, data.tool, data.command, data.sessionId);
      } else {
        session.pendingPermissions.push({
          id: data.id,
          tool: data.tool,
          command: data.command,
          sessionId: data.sessionId
        });
        session.needsAttention = true;
        session.attentionReason = 'permission';
        renderSessionTabs();
        showNotificationToast(session, 'Permission required');
        updateTitleNotification();
      }
      break;

    case 'permission-resolved':
      if (isActive) {
        resolvePermissionCard(data.id, data.decision);
      } else {
        // Remove from pending queue (resolved externally, e.g. via CLI)
        var pq = session.pendingPermissions;
        for (var pi = pq.length - 1; pi >= 0; pi--) {
          if (pq[pi].id === data.id) {
            pq.splice(pi, 1);
            break;
          }
        }
        if (pq.length === 0 && session.chatResponding) {
          session.needsAttention = false;
          session.attentionReason = null;
          renderSessionTabs();
          updateTitleNotification();
        }
      }
      break;
  }
}

function connect() {
  var indicator = document.getElementById('conn-indicator');
  var text = document.getElementById('conn-text');
  // P1: Include auth token as query param (EventSource can't set headers)
  var sseUrl = '/events?token=' + encodeURIComponent(SHARDS_TOKEN);
  var es = new EventSource(sseUrl);

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
