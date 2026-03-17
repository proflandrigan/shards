// ═══════════════════════════════════════════════════════════════
// Markdown renderer
// ═══════════════════════════════════════════════════════════════

function renderMarkdown(md) {
  if (!md) return '';
  var lines = md.split('\n');
  var out = [];
  var inCode = false, codeLang = '', codeAcc = [];
  var inList = false, listType = '';

  function closeList() {
    if (inList) { out.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
  }

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    if (line.startsWith('```')) {
      if (inCode) {
        var highlighted = highlightCode(esc(codeAcc.join('\n')), codeLang);
        out.push('<pre><code>' + highlighted + '</code></pre>');
        codeAcc = []; codeLang = ''; inCode = false;
      } else {
        closeList();
        codeLang = line.slice(3).trim();
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeAcc.push(line); continue; }

    var isListLine = /^[-*]\s/.test(line) || /^\d+\.\s/.test(line);
    if (inList && !isListLine) closeList();

    if (line.trim() === '') { closeList(); out.push('<br>'); continue; }

    var m;
    if ((m = line.match(/^(#{1,6})\s(.+)/))) {
      closeList();
      var lvl = m[1].length;
      out.push('<h' + lvl + '>' + inlinemd(m[2]) + '</h' + lvl + '>');
      continue;
    }
    if (/^---+$/.test(line.trim())) { closeList(); out.push('<hr>'); continue; }
    if (line.startsWith('> ')) { closeList(); out.push('<blockquote>' + inlinemd(line.slice(2)) + '</blockquote>'); continue; }

    if ((m = line.match(/^[-*]\s(.+)/))) {
      if (!inList || listType !== 'ul') { closeList(); out.push('<ul>'); inList = true; listType = 'ul'; }
      out.push('<li>' + inlinemd(m[1]) + '</li>');
      continue;
    }
    if ((m = line.match(/^\d+\.\s(.+)/))) {
      if (!inList || listType !== 'ol') { closeList(); out.push('<ol>'); inList = true; listType = 'ol'; }
      out.push('<li>' + inlinemd(m[1]) + '</li>');
      continue;
    }

    out.push('<p>' + inlinemd(line) + '</p>');
  }

  closeList();
  if (inCode) out.push('<pre><code>' + esc(codeAcc.join('\n')) + '</code></pre>');
  return out.join('');
}

function inlinemd(text) {
  text = esc(text);
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return text;
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
