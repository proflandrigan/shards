// ═══════════════════════════════════════════════════════════════
// Markdown renderer (marked.js v4 + custom code highlighting)
// ═══════════════════════════════════════════════════════════════

(function initMarked() {
  var renderer = new marked.Renderer();

  renderer.code = function(code, lang) {
    var highlighted = highlightCode(esc(code), lang || '');
    return '<pre><code>' + highlighted + '</code></pre>';
  };

  marked.setOptions({
    gfm: true,
    breaks: false,
    renderer: renderer
  });
})();

function renderMarkdown(md) {
  if (!md) return '';
  return marked.parse(md);
}

// ═══════════════════════════════════════════════════════════════
// Syntax highlighting
// ═══════════════════════════════════════════════════════════════

function highlightCode(escapedCode, lang) {
  if (!lang) return escapedCode;
  switch (lang.toLowerCase()) {
    case 'python': case 'py': return hlPython(escapedCode);
    case 'sql': return hlSQL(escapedCode);
    case 'javascript': case 'js': case 'typescript': case 'ts': return hlJS(escapedCode);
    case 'json': return hlJSON(escapedCode);
    case 'yaml': case 'yml': return hlYAML(escapedCode);
    default: return escapedCode;
  }
}

function hlPython(code) {
  var kws = 'def|class|import|from|return|if|elif|else|for|while|in|not|and|or|with|as|try|except|finally|raise|pass|break|continue|lambda|yield|global|nonlocal|del|assert|True|False|None|async|await|is|print';
  return code
    .replace(/(#[^\n]*)/g, '<span class="cmt">$1</span>')
    .replace(/("""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'|"[^"\\]*(?:\\.[^"\\]*)*"|\'[^\'\\]*(?:\\.[^\'\\]*)*\')/g, '<span class="str">$1</span>')
    .replace(new RegExp('\\b(' + kws + ')\\b', 'g'), '<span class="kw">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
}

function hlSQL(code) {
  var kws = 'SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|ADD|COLUMN|INDEX|VIEW|WITH|AS|AND|OR|NOT|IN|IS|NULL|LIKE|BETWEEN|EXISTS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|UNION|ALL|OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|COALESCE|CAST|DATE|TIMESTAMP';
  return code
    .replace(/(--[^\n]*)/g, '<span class="cmt">$1</span>')
    .replace(/('(?:[^'\\]|\\.)*')/g, '<span class="str">$1</span>')
    .replace(new RegExp('\\b(' + kws + ')\\b', 'gi'), function(m) { return '<span class="kw">' + m.toUpperCase() + '</span>'; })
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
}

function hlJS(code) {
  var kws = 'const|let|var|function|return|if|else|for|while|do|class|extends|import|export|default|from|new|this|typeof|instanceof|in|of|try|catch|finally|throw|async|await|true|false|null|undefined|break|continue|switch|case|delete|void|yield|interface|type|enum|static|get|set';
  return code
    .replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>')
    .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, '<span class="str">$1</span>')
    .replace(new RegExp('\\b(' + kws + ')\\b', 'g'), '<span class="kw">$1</span>')
    .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
}

function hlJSON(code) {
  return code
    .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, '<span class="attr">$1</span>$2')
    .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="str">$1</span>')
    .replace(/:\s*(\d+\.?\d*(?:[eE][+-]?\d+)?)/g, ': <span class="num">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="kw">$1</span>');
}

function hlYAML(code) {
  return code.split('\n').map(function(line) {
    if (/^\s*#/.test(line)) return '<span class="cmt">' + line + '</span>';
    var m = line.match(/^(\s*\S[^:]*:)(.*)/);
    if (m) return '<span class="attr">' + m[1] + '</span><span class="str">' + m[2] + '</span>';
    return line;
  }).join('\n');
}
