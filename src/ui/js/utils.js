// ═══════════════════════════════════════════════════════════════
// Utility
// ═══════════════════════════════════════════════════════════════

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

var LANG_MAP = {
  py: 'python', python: 'python',
  sql: 'sql',
  js: 'javascript', javascript: 'javascript',
  ts: 'typescript', typescript: 'typescript',
  json: 'json',
  yaml: 'yaml', yml: 'yaml',
  sh: 'shell', bash: 'shell',
  html: 'html', htm: 'html',
  css: 'css',
  rb: 'ruby', ruby: 'ruby',
  go: 'go',
  rs: 'rust', rust: 'rust',
  java: 'java',
  r: 'r',
  md: 'markdown', markdown: 'markdown',
};

function getLang(filePath) {
  var ext = filePath.split('.').pop().toLowerCase();
  return LANG_MAP[ext] || '';
}

// Monaco language ID for Monaco editor (slightly different from display lang)
function getMonacoLang(filePath) {
  var ext = filePath.split('.').pop().toLowerCase();
  var map = {
    py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', html: 'html', htm: 'html', css: 'css',
    rb: 'ruby', go: 'go', rs: 'rust', java: 'java', r: 'r',
    sh: 'shell', bash: 'shell', xml: 'xml', c: 'c', cpp: 'cpp', h: 'c',
    cs: 'csharp', php: 'php', swift: 'swift', kt: 'kotlin',
  };
  return map[ext] || 'plaintext';
}

var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
var PDF_EXTS = ['pdf'];

function isImageFile(filePath) {
  var ext = filePath.split('.').pop().toLowerCase();
  return IMAGE_EXTS.indexOf(ext) !== -1;
}

function isPdfFile(filePath) {
  var ext = filePath.split('.').pop().toLowerCase();
  return PDF_EXTS.indexOf(ext) !== -1;
}

function isMediaFile(filePath) {
  return isImageFile(filePath) || isPdfFile(filePath);
}

function getRawFileUrl(absPath) {
  return '/browse/file/raw?path=' + encodeURIComponent(absPath) + '&token=' + encodeURIComponent(SHARDS_TOKEN);
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ═══════════════════════════════════════════════════════════════
// Copy path utilities
// ═══════════════════════════════════════════════════════════════

function toRelPath(absPath) {
  if (treeRootPath && absPath.indexOf(treeRootPath) === 0) {
    return absPath.slice(treeRootPath.length + 1);
  }
  return absPath;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() {
    showCopyToast(text);
  }).catch(function() {
    // Fallback for older browsers / non-HTTPS
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopyToast(text);
  });
}

function showCopyToast(text) {
  var existing = document.querySelector('.copy-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = 'Copied: ' + text;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 1300);
}

function copyCurrentFilePath() {
  var key = getCurrentFileKey();
  if (!key || key === 'chat') return;
  copyToClipboard(key);
  var btn = document.getElementById('copy-path-btn');
  if (btn) {
    btn.classList.add('copied');
    setTimeout(function() { btn.classList.remove('copied'); }, 1000);
  }
}

// ═══════════════════════════════════════════════════════════════
// Code block & message copy helpers
// ═══════════════════════════════════════════════════════════════

function copyCodeBlock(btn) {
  var code = btn.parentElement.querySelector('code');
  if (code) copyToClipboard(code.textContent);
}

function copyMessageContent(btn) {
  var msg = btn.closest('.message');
  if (!msg) return;
  var bubble = msg.querySelector('.message-bubble');
  if (!bubble) return;
  var raw = bubble.getAttribute('data-raw-md');
  copyToClipboard(raw || bubble.textContent);
}

// ═══════════════════════════════════════════════════════════════
// Context menu
// ═══════════════════════════════════════════════════════════════

var ctxMenuTarget = null;

function showCtxMenu(e, relPath) {
  e.preventDefault();
  e.stopPropagation();
  ctxMenuTarget = relPath;
  var menu = document.getElementById('ctx-menu');
  menu.classList.add('visible');
  // Position, keeping on screen
  var x = e.clientX;
  var y = e.clientY;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  // Adjust if off-screen
  requestAnimationFrame(function() {
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + 'px';
  });
}

function hideCtxMenu() {
  var menu = document.getElementById('ctx-menu');
  if (menu) menu.classList.remove('visible');
  ctxMenuTarget = null;
}

function initCtxMenu() {
  document.addEventListener('click', hideCtxMenu);
  document.addEventListener('contextmenu', function(e) {
    // Hide if clicking outside the menu
    var menu = document.getElementById('ctx-menu');
    if (menu && menu.classList.contains('visible') && !menu.contains(e.target)) {
      hideCtxMenu();
    }
  });
  document.getElementById('ctx-copy-path').addEventListener('click', function() {
    if (ctxMenuTarget) copyToClipboard(ctxMenuTarget);
    hideCtxMenu();
  });

  // Click on file-path-display copies path
  document.getElementById('file-path-display').addEventListener('click', function() {
    var key = getCurrentFileKey();
    if (key && key !== 'chat') copyCurrentFilePath();
  });
}
