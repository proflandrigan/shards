// ═══════════════════════════════════════════════════════════════
// Shared mutable state
// ═══════════════════════════════════════════════════════════════

// P1: Auth token injected by server via <meta> tag
var SHARDS_TOKEN = (function() {
  var meta = document.querySelector('meta[name="shards-token"]');
  return meta ? meta.getAttribute('content') : '';
})();

// P1: Authenticated fetch wrapper
function authFetch(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  if (SHARDS_TOKEN) {
    opts.headers['Authorization'] = 'Bearer ' + SHARDS_TOKEN;
  }
  return fetch(url, opts);
}

var currentAgent = null;
var monacoLoaded = false;
var monacoFailed = false;
var monacoLoadPromise = null;
var activeMonacoInstance = null;
var fileRenderGen = 0;
var activeNotebookCellMonaco = null;
var activeNotebookCellIdx = null;
var activeCellIdx = null;
var currentBrowseDir = null;
var explorerViewMode = localStorage.getItem('shards-explorer-view') || 'tree';
var activeSidebarView = localStorage.getItem('shards-sidebar-view') || 'explorer';
var treeExpanded = {};
var treeChildren = {};
var treeLoading = {};
var treeRootPath = null;
var activeTabulatorInstance = null;
var activeTabularColumns = null;
var sessionTouchedFiles = new Set(); // pointer to active session's set
var agentList = null;

// Per-session workspace state — globals act as pointers to active session's data.
// saveSessionWorkspace() / loadSessionWorkspace() swap these on session switch.
var openFiles = {};
var openPanels = {};
var fileTabOrder = [];
var panelTabOrder = [];
var activeTabId = 'chat';
var splitMode = false;
var currentFileInPane = null;
var selectionContext = null;
var pinnedItems = [];  // pointer to active session's pinned items

// ═══════════════════════════════════════════════════════════════
// Multi-session state
// ═══════════════════════════════════════════════════════════════

var chatSessions = {};       // sessionId -> ChatSessionState
var activeSessionId = null;  // currently viewed session tab
var sessionOrder = [];       // ordered array of session IDs

// Browser tab title notification state
var _titleFlashInterval = null;
var _originalTitle = 'Shards UI';

function createSessionState(sid, agent) {
  var state = {
    sessionId: sid,
    agent: agent,
    title: null,
    messages: [],
    pendingBubble: null,
    tokenBuffer: '',
    tokenFlushPending: false,
    chatResponding: false,
    hasMessages: false,
    chatTransitioning: false,
    thinkingIndicatorEl: null,
    consultingIndicatorEl: null,
    workingIndicatorEl: null,
    scrollTop: 0,
    domFragment: null,
    domDirty: false,
    unread: false,
    needsAttention: false,
    pendingPermissions: [],
    // Image attachments staged for the next send. Each entry:
    //   { id, mediaType, dataBase64, sizeBytes, name, previewUrl }
    pendingAttachments: [],
    attentionReason: null,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    // Project context — derived server-side from first matching file-touched
    // path under analysis/, studies/, models/, etc. Populated via session-context event.
    projectName: null,
    projectDir: null,
    // R2 — last action surface for tab subline
    // Shape: { kind: 'tool'|'file'|'consult'|'gate'|'error'|'idle', label, ts }
    lastSignal: null,
    // R3 — bounded timeline (last ~30 events) for sidebar Activity panel
    // Each entry: { ts, kind, label, meta }
    timeline: [],
    // Workspace state (each session owns its own file tabs, panels, split mode)
    sessionTouchedFiles: new Set(),
    openFiles: {},
    fileTabOrder: [],
    activeTabId: 'chat',
    splitMode: false,
    currentFileInPane: null,
    openPanels: {},
    panelTabOrder: [],
    pinnedItems: [],  // Pinboard: array of { type, path, name, text?, startLine?, endLine? }
    totalCost: 0,       // cumulative USD cost for this session
    totalDuration: 0,   // cumulative ms for this session
    // Buffered tool inputs streaming via chat-tool-input-delta. Keyed by content
    // block index: { id, name, inputBuffer }. Cleared on chat-block-stop after
    // we finalize the timeline entry with a richer label.
    pendingToolCalls: {},
    // Cached truncated first-prompt snippet for tab labels. Lazily filled the
    // first time we need it; reset to null on chat-clear-messages.
    _promptSnippet: null,
  };
  chatSessions[sid] = state;
  sessionOrder.push(sid);
  pushTimeline(state, 'start', agent, null);
  return state;
}

// R3 — append an event to a session's bounded timeline. Caps history at 30
// entries to bound memory; older entries fall off the front.
var TIMELINE_MAX = 30;
function pushTimeline(session, kind, label, meta) {
  if (!session) return;
  if (!session.timeline) session.timeline = [];
  session.timeline.push({
    ts: Date.now(),
    kind: kind,
    label: label,
    meta: meta || null,
  });
  if (session.timeline.length > TIMELINE_MAX) {
    session.timeline.splice(0, session.timeline.length - TIMELINE_MAX);
  }
}

// Find a tool timeline entry by its tool-use id and patch its label/meta in
// place. No-ops if the entry has already rotated off the cap. Returns true on
// success so callers can fall back to pushing a fresh entry.
function updateToolTimelineEntry(session, id, patch) {
  if (!session || !session.timeline || !id) return false;
  for (var i = session.timeline.length - 1; i >= 0; i--) {
    var e = session.timeline[i];
    if (e.kind === 'tool' && e.meta && e.meta.id === id) {
      if (patch.label != null) e.label = patch.label;
      if (patch.meta) {
        e.meta = Object.assign({}, e.meta, patch.meta);
      }
      e.ts = Date.now();
      return true;
    }
  }
  return false;
}

function removeSessionState(sid) {
  delete chatSessions[sid];
  var idx = sessionOrder.indexOf(sid);
  if (idx !== -1) sessionOrder.splice(idx, 1);
}

function getActiveSession() {
  return activeSessionId ? (chatSessions[activeSessionId] || null) : null;
}

function getSessionState(sid) {
  return chatSessions[sid] || null;
}

// Save current workspace globals into the given session object
function saveSessionWorkspace(session) {
  if (!session) return;
  session.sessionTouchedFiles = sessionTouchedFiles;
  session.openFiles = openFiles;
  session.fileTabOrder = fileTabOrder;
  session.activeTabId = activeTabId;
  session.splitMode = splitMode;
  session.currentFileInPane = currentFileInPane;
  session.openPanels = openPanels;
  session.panelTabOrder = panelTabOrder;
  session.pinnedItems = pinnedItems;
}

// ═══════════════════════════════════════════════════════════════
// Gate state subscription (SSE primary, polling fallback)
// ═══════════════════════════════════════════════════════════════
//
// The server pushes gate-state / gate-block / auto-state events on
// /gate-state-stream whenever .shards/gates/state.json,
// .shards/gates/violations.jsonl, or .shards/auto/state.json change. Replaces
// the legacy 2s poll which lagged real gate transitions and caused the
// Confirm-button-on-wrong-gate render bug. On SSE error we fall back to a
// 10s poll as resilience (server restart, network blip).

var gateState = { open: false, history: [] };
var gateMode = { enforce: true, checkpointEnforce: true, autoVerify: true };
var _gateEventSource = null;
var _gatePoller = null;
var _gateReconnectTimer = null;

function _onGateStateUpdate(state) {
  gateState = state || { open: false, history: [] };
  if (typeof renderGatePill === 'function') {
    renderGatePill(gateState);
  }
}

function _onGateBlock(evt) {
  if (typeof renderGateBlockBanner === 'function') {
    renderGateBlockBanner(evt);
  }
}

function _onGateModeLoaded(mode) {
  gateMode = mode || gateMode;
  if (typeof renderGateModeBanner === 'function') {
    renderGateModeBanner(gateMode);
  }
}

function _startGatePollingFallback() {
  if (_gatePoller) return;
  _gatePoller = setInterval(function() {
    authFetch('/gate-state')
      .then(function(r) { return r.json(); })
      .then(function(data) { _onGateStateUpdate(data); })
      .catch(function() {});
  }, 10000);
}

function _stopGatePollingFallback() {
  if (_gatePoller) { clearInterval(_gatePoller); _gatePoller = null; }
}

function startGatePoller() {
  // One-time fetches: initial gate-state + gate-mode. The SSE stream also
  // pushes an initial gate-state on connect, but the fetch races with the
  // EventSource open and we want whichever lands first to seed UI.
  authFetch('/gate-state')
    .then(function(r) { return r.json(); })
    .then(_onGateStateUpdate)
    .catch(function() {});
  authFetch('/gate-mode')
    .then(function(r) { return r.json(); })
    .then(_onGateModeLoaded)
    .catch(function() {});

  _openGateStream();
}

function _openGateStream() {
  if (_gateEventSource) return;
  // SSE EventSource can't set Authorization headers, so the server accepts
  // ?token=… as a fallback (same pattern as /events).
  var url = '/gate-state-stream?token=' + encodeURIComponent(SHARDS_TOKEN);
  try {
    _gateEventSource = new EventSource(url);
  } catch (e) {
    _startGatePollingFallback();
    return;
  }
  _gateEventSource.onopen = function() {
    _stopGatePollingFallback();
  };
  _gateEventSource.onmessage = function(ev) {
    var payload;
    try { payload = JSON.parse(ev.data); } catch (e) { return; }
    if (!payload || !payload.type) return;
    if (payload.type === 'connected') return;
    if (payload.type === 'gate-state') {
      _onGateStateUpdate(payload.state);
    } else if (payload.type === 'gate-block') {
      _onGateBlock(payload);
    } else if (payload.type === 'auto-state') {
      // Reserved for future auto-verify HUD; non-fatal if no renderer.
      if (typeof renderAutoStateBadge === 'function') renderAutoStateBadge(payload.state);
    }
  };
  _gateEventSource.onerror = function() {
    // EventSource auto-reconnects, but if the connection stays broken we
    // also engage the 10s poll so the UI doesn't get stuck on stale state.
    _startGatePollingFallback();
    // If the connection is fully closed (readyState === 2), schedule an
    // explicit reopen after a backoff window.
    if (_gateEventSource && _gateEventSource.readyState === 2) {
      try { _gateEventSource.close(); } catch (e) {}
      _gateEventSource = null;
      if (!_gateReconnectTimer) {
        _gateReconnectTimer = setTimeout(function() {
          _gateReconnectTimer = null;
          _openGateStream();
        }, 5000);
      }
    }
  };
}

function stopGatePoller() {
  _stopGatePollingFallback();
  if (_gateEventSource) {
    try { _gateEventSource.close(); } catch (e) {}
    _gateEventSource = null;
  }
  if (_gateReconnectTimer) {
    clearTimeout(_gateReconnectTimer);
    _gateReconnectTimer = null;
  }
}

// Load workspace globals from the given session object
function loadSessionWorkspace(session) {
  if (!session) {
    sessionTouchedFiles = new Set();
    openFiles = {};
    fileTabOrder = [];
    activeTabId = 'chat';
    splitMode = false;
    currentFileInPane = null;
    openPanels = {};
    panelTabOrder = [];
    pinnedItems = [];
    if (typeof renderPinboard === 'function') renderPinboard();
    return;
  }
  sessionTouchedFiles = session.sessionTouchedFiles;
  openFiles = session.openFiles;
  fileTabOrder = session.fileTabOrder;
  activeTabId = session.activeTabId;
  splitMode = session.splitMode;
  currentFileInPane = session.currentFileInPane;
  openPanels = session.openPanels;
  panelTabOrder = session.panelTabOrder;
  pinnedItems = session.pinnedItems || [];
  if (typeof renderPinboard === 'function') renderPinboard();
  if (typeof renderHud === 'function') renderHud();
}
