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
    attentionReason: null,
    createdAt: Date.now(),
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
  };
  chatSessions[sid] = state;
  sessionOrder.push(sid);
  return state;
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
}
