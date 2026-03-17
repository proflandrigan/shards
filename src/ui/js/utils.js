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

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
