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
var activeNotebookCellMonaco = null;
var activeNotebookCellIdx = null;
var activeCellIdx = null;
var currentBrowseDir = null;
var activeTabulatorInstance = null;
var activeTabularColumns = null;
var openFiles = {};
var sessionTouchedFiles = new Set();
var fileTabOrder = [];
var activeTabId = 'chat';
var splitMode = false;
var currentFileInPane = null;
var chatSessionId = null;
var chatAgent = null;
var chatResponding = false;
var chatMessages = [];
var pendingBubble = null;
var tokenBuffer = '';
var tokenFlushPending = false;
var hasMessages = false;
var agentList = null;
