// ═══════════════════════════════════════════════════════════════
// Shared mutable state
// ═══════════════════════════════════════════════════════════════

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
