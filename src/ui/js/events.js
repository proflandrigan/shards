// ═══════════════════════════════════════════════════════════════
// SSE connection
// ═══════════════════════════════════════════════════════════════

function isChatEvent(type) {
  return type && (type.indexOf('chat-') === 0 || type === 'agent-consulting' || type === 'permission-request' || type === 'permission-resolved');
}

// R2/R3 — small helpers for deriving tab subline + timeline entries.
function basenameOf(p) {
  if (!p) return '';
  var s = String(p).replace(/\\/g, '/');
  var i = s.lastIndexOf('/');
  return i >= 0 ? s.slice(i + 1) : s;
}

function setSessionSignal(session, kind, label) {
  if (!session) return;
  session.lastSignal = { kind: kind, label: label, ts: Date.now() };
  session.lastActivityAt = Date.now();
}

// Format the streamed tool input into a short, human-readable label for the
// activity timeline + tab subline. Returns just the tool name when the input
// is missing or has no useful field for that tool.
function formatToolDetail(name, input) {
  if (!name) return 'tool';
  if (!input || typeof input !== 'object') return name;
  var detail = '';
  switch (name) {
    case 'Read':
      if (input.file_path) detail = basenameOf(input.file_path);
      break;
    case 'Edit':
      if (input.file_path) detail = basenameOf(input.file_path);
      break;
    case 'Write':
      if (input.file_path) detail = basenameOf(input.file_path);
      break;
    case 'NotebookEdit':
      if (input.notebook_path) detail = basenameOf(input.notebook_path);
      break;
    case 'Bash':
      detail = input.description || (input.command || '').replace(/\s+/g, ' ').slice(0, 60);
      break;
    case 'Grep':
      if (input.pattern) {
        detail = '"' + String(input.pattern).slice(0, 40) + '"';
        if (input.path) detail += ' in ' + basenameOf(input.path);
      }
      break;
    case 'Glob':
      if (input.pattern) detail = String(input.pattern).slice(0, 60);
      break;
    case 'Task':
      if (input.subagent_type) return 'Consulting ' + input.subagent_type;
      if (input.description) return 'Task: ' + String(input.description).slice(0, 60);
      break;
    case 'WebFetch':
      if (input.url) {
        try { detail = new URL(input.url).hostname; }
        catch (e) { detail = String(input.url).slice(0, 60); }
      }
      break;
    case 'WebSearch':
      if (input.query) detail = '"' + String(input.query).slice(0, 50) + '"';
      break;
    case 'TodoWrite':
      if (Array.isArray(input.todos)) detail = input.todos.length + ' items';
      break;
    default:
      // First string-valued field wins for unknown tools — better than nothing.
      for (var k in input) {
        if (!Object.prototype.hasOwnProperty.call(input, k)) continue;
        if (typeof input[k] === 'string' && input[k]) {
          detail = String(input[k]).slice(0, 60);
          break;
        }
      }
  }
  return detail ? name + ': ' + detail : name;
}

// Detects "::GATE::" markers in agent messages (the gate fence pattern from
// CLAUDE.md). Falls back to a softer "phase N gate" heuristic.
function extractGateLabel(content) {
  if (typeof content !== 'string') return null;
  var m = content.match(/::GATE::[^\n]*?id=([\w-]+)/);
  if (m) return m[1];
  m = content.match(/gate[\s:]+([\w-]+phase[\w-]+)/i);
  if (m) return m[1];
  return null;
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
        var fname = basenameOf(data.path);
        setSessionSignal(ftSess, 'file', fname);
        if (typeof pushTimeline === 'function') pushTimeline(ftSess, 'file', fname, { path: data.path });
        if (typeof renderSessionTabs === 'function') renderSessionTabs();
        if (typeof renderTimeline === 'function') renderTimeline();
      } else {
        sessionTouchedFiles.add(data.path);
      }
      // Only refresh explorer UI when it's the active session's file
      if (!data.sessionId || data.sessionId === activeSessionId) {
        if (explorerViewMode === 'tree') {
          invalidateTreeAncestors(data.path);
          renderTree();
        } else if (currentBrowseDir) browseDir(currentBrowseDir);
        if (typeof renderSessionFiles === 'function') renderSessionFiles();
      }
      // Debounced git status refresh
      if (typeof scheduleGitRefresh === 'function') scheduleGitRefresh();
      break;
    }

    // R4 — server detected the project slug for a session (first matching
    // file-touched under analysis/, studies/, services/, etc.)
    case 'session-context': {
      var ctxSess = data.sessionId ? getSessionState(data.sessionId) : null;
      if (ctxSess) {
        ctxSess.projectName = data.projectName || null;
        ctxSess.projectDir = data.projectDir || null;
        if (typeof renderSessionTabs === 'function') renderSessionTabs();
        if (typeof renderTimeline === 'function') renderTimeline();
      }
      break;
    }

    // event-log carries low-priority text describing a Bash invocation or
    // persona transfer. We use it only to enrich the timeline; the active
    // session's chat view doesn't need it (tool indicators already render).
    case 'event-log': {
      var elSess = data.sessionId ? getSessionState(data.sessionId) : getActiveSession();
      if (elSess && data.text) {
        // De-dup: if the most recent timeline entry already carries the same
        // (or richer) label from the streamed-input formatter, skip this push.
        // The client-side formatter is the source of truth for tool details.
        var skipDup = false;
        var tl = elSess.timeline;
        if (tl && tl.length) {
          var lastEntry = tl[tl.length - 1];
          if (lastEntry && lastEntry.kind === 'tool' && lastEntry.label) {
            var prefixMatch = data.text.split(':')[0];
            if (prefixMatch && lastEntry.label.indexOf(prefixMatch + ':') === 0) {
              skipDup = true;
            }
          }
        }
        if (data.text.indexOf('Bash:') === 0 && !skipDup) {
          setSessionSignal(elSess, 'tool', data.text);
        }
        if (!skipDup && typeof pushTimeline === 'function') {
          pushTimeline(elSess, 'log', data.text, null);
        }
        if (typeof renderSessionTabs === 'function') renderSessionTabs();
        if (typeof renderTimeline === 'function') renderTimeline();
      }
      break;
    }

    case 'agent-changed': {
      var acSess = data.sessionId ? getSessionState(data.sessionId) : getActiveSession();
      if (acSess) {
        var changeLabel = (data.from || '?') + ' → ' + (data.to || '?');
        if (typeof pushTimeline === 'function') pushTimeline(acSess, 'agent', changeLabel, { from: data.from, to: data.to });
        if (typeof renderTimeline === 'function') renderTimeline();
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
      if (typeof updateEndChatButton === 'function') updateEndChatButton();
      if (typeof refreshSessions === 'function') refreshSessions();
      break;

    case 'chat-user-message':
      session.messages.push({
        role: 'user',
        content: data.content,
        agent: data.agent,
        attachments: data.attachments || null,
      });
      // R2 — track responding state for both active and inactive sessions so the
      // tab subline can render "responding…". Was previously inactive-only.
      session.chatResponding = true;
      session.lastActivityAt = Date.now();
      if (isActive) {
        addMessageDirect('user', data.content, data.agent, false, data.attachments);
        setChatInputEnabled(false);
        showThinkingIndicator();
      } else {
        session.domDirty = true;
      }
      if (typeof renderSessionTabs === 'function') renderSessionTabs();
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
      setSessionSignal(session, 'tool', data.tool || 'tool');
      if (typeof pushTimeline === 'function') pushTimeline(session, 'tool', data.tool || 'tool', { id: data.id });
      // Record the call so input-delta / block-stop can finalize the entry
      // with a richer label once the streamed input is complete.
      if (data.id != null && data.index != null) {
        if (!session.pendingToolCalls) session.pendingToolCalls = {};
        session.pendingToolCalls[data.index] = {
          id: data.id,
          name: data.tool || 'tool',
          inputBuffer: '',
        };
      }
      if (typeof renderSessionTabs === 'function') renderSessionTabs();
      if (typeof renderTimeline === 'function') renderTimeline();
      break;

    case 'chat-tool-input-delta':
      if (data.index != null && session.pendingToolCalls) {
        var pendingDelta = session.pendingToolCalls[data.index];
        if (pendingDelta && typeof data.partial_json === 'string') {
          pendingDelta.inputBuffer += data.partial_json;
        }
      }
      break;

    case 'chat-block-stop':
      if (isActive && session.chatResponding && !session.thinkingIndicatorEl && !session.workingIndicatorEl) {
        showThinkingIndicator();
      }
      // If this block was a tool_use we've been buffering, parse the input,
      // format a richer label, and patch the existing timeline entry in place.
      if (data.index != null && session.pendingToolCalls) {
        var pendingStop = session.pendingToolCalls[data.index];
        if (pendingStop) {
          var parsedInput = null;
          try { parsedInput = JSON.parse(pendingStop.inputBuffer || '{}'); }
          catch (_e) { parsedInput = null; }
          var richLabel = formatToolDetail(pendingStop.name, parsedInput || {});
          if (richLabel && richLabel !== pendingStop.name) {
            if (typeof updateToolTimelineEntry === 'function') {
              updateToolTimelineEntry(session, pendingStop.id, { label: richLabel });
            }
            setSessionSignal(session, 'tool', richLabel);
            if (typeof renderSessionTabs === 'function') renderSessionTabs();
            if (typeof renderTimeline === 'function') renderTimeline();
          }
          delete session.pendingToolCalls[data.index];
        }
      }
      break;

    case 'chat-message':
      session.messages.push({ role: 'assistant', content: data.content, agent: data.agent });
      // R2/R3 — derive gate signal for both active and inactive sessions
      var gateLabel = extractGateLabel(data.content);
      if (gateLabel) {
        setSessionSignal(session, 'gate', 'gate ' + gateLabel);
        if (typeof pushTimeline === 'function') pushTimeline(session, 'gate', gateLabel, null);
      } else {
        // Note: don't overwrite a tool/file signal with "message" — chat-message
        // fires after every assistant turn and would clobber more useful state.
        session.lastActivityAt = Date.now();
      }
      if (isActive) {
        if (session.pendingBubble) {
          finalizePendingBubble(data.content);
        } else {
          addMessageDirect('assistant', data.content, data.agent);
        }
      } else {
        session.domDirty = true;
        session.unread = true;
        // Check for gate pattern to provide better notification later
        if (typeof isGateMessage === 'function' && isGateMessage(data.content)) {
          session.attentionReason = 'gate';
        }
        renderSessionTabs();
        updateTitleNotification();
      }
      if (typeof renderSessionTabs === 'function') renderSessionTabs();
      if (typeof renderTimeline === 'function') renderTimeline();
      break;

    case 'chat-turn-end':
      session.chatResponding = false;
      session.lastActivityAt = Date.now();
      if (data.cost != null) session.totalCost = (session.totalCost || 0) + data.cost;
      if (data.duration != null) session.totalDuration = (session.totalDuration || 0) + data.duration;
      if (typeof renderHud === 'function') renderHud();
      if (typeof renderSessionTabs === 'function') renderSessionTabs();
      if (typeof renderTimeline === 'function') renderTimeline();
      if (isActive) {
        removeThinkingIndicator();
        setChatInputEnabled(true);
        document.getElementById('chat-input').focus();
        // If tab is hidden, still show a notification for the active session
        if (document.visibilityState !== 'visible') {
          var reason = 'Ready for input';
          if (session.messages.length > 0) {
            var last = session.messages[session.messages.length - 1];
            if (last.role === 'assistant' && typeof isGateMessage === 'function' && isGateMessage(last.content)) {
              reason = 'Gate reached';
            }
          }
          showNotificationToast(session, reason);
        }
      } else {
        session.needsAttention = true;
        var reason = 'Waiting for input';
        if (session.attentionReason === 'gate') {
          reason = 'Gate reached';
        }
        session.attentionReason = 'turn-end';
        renderSessionTabs();
        showNotificationToast(session, reason);
        updateTitleNotification();
      }
      break;

    case 'chat-init':
      break;

    case 'chat-error':
      session.chatResponding = false;
      setSessionSignal(session, 'error', data.error || 'error');
      if (typeof pushTimeline === 'function') pushTimeline(session, 'error', data.error || 'error', null);
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
      if (typeof renderSessionTabs === 'function') renderSessionTabs();
      if (typeof renderTimeline === 'function') renderTimeline();
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
        session._promptSnippet = null;
        session.hasMessages = false;
        document.getElementById('messages').innerHTML = '';
        addSystemNotice('Switching to ' + (AGENTS[data.to] ? AGENTS[data.to].label : data.to) + '...');
        session.agent = data.to;
        activateAgent(data.to);
        setChatInputEnabled(false);
        renderSessionTabs();
      } else {
        session.messages = [];
        session._promptSnippet = null;
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
      session._promptSnippet = null;
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
      if (typeof pushTimeline === 'function') pushTimeline(session, 'end', 'session ended', null);
      if (data.code && data.code !== 0 && isActive) {
        addSystemNotice('Session ended unexpectedly (exit code ' + data.code + '). If Claude CLI is not logged in, run "claude login" in your terminal.');
      }
      if (typeof renderTimeline === 'function') renderTimeline();
      endSessionTab(session.sessionId);
      if (typeof updateEndChatButton === 'function') updateEndChatButton();
      if (typeof refreshSessions === 'function') refreshSessions();
      break;

    case 'agent-consulting':
      if (isActive) {
        updateConsultingIndicator(data.agent);
      }
      setSessionSignal(session, 'consult', data.agent || 'subagent');
      if (typeof pushTimeline === 'function') pushTimeline(session, 'consult', data.agent || 'subagent', null);
      if (typeof renderSessionTabs === 'function') renderSessionTabs();
      if (typeof renderTimeline === 'function') renderTimeline();
      break;

    case 'permission-request':
      if (isActive) {
        renderPermissionCard(data.id, data.tool, data.command, data.sessionId);
        // Also notify if tab hidden
        if (document.visibilityState !== 'visible') {
          showNotificationToast(session, 'Permission required');
        }
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
