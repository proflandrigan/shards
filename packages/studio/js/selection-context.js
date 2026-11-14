// ═══════════════════════════════════════════════════════════════
// Selection context — captures file viewer selections for chat
// ═══════════════════════════════════════════════════════════════

function getSelectionFromMonaco() {
  var editor = activeMonacoInstance || activeNotebookCellMonaco;
  if (!editor) return null;
  var sel = editor.getSelection();
  if (!sel || sel.isEmpty()) return null;
  var text = editor.getModel().getValueInRange(sel);
  if (!text.trim()) return null;
  var source = (editor === activeNotebookCellMonaco) ? 'notebook' : 'monaco';
  return {
    text: text,
    startLine: sel.startLineNumber,
    endLine: sel.endLineNumber,
    source: source,
  };
}

function getSelectionFromTextarea() {
  var ta = document.getElementById('code-edit');
  if (!ta || !ta.classList.contains('visible')) return null;
  if (ta.selectionStart === ta.selectionEnd) return null;
  var text = ta.value.substring(ta.selectionStart, ta.selectionEnd);
  if (!text.trim()) return null;
  var before = ta.value.substring(0, ta.selectionStart);
  var startLine = (before.match(/\n/g) || []).length + 1;
  var endLine = startLine + (text.match(/\n/g) || []).length;
  return { text: text, startLine: startLine, endLine: endLine, source: 'textarea' };
}

function getSelectionFromCodeView() {
  var sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;
  var codeView = document.getElementById('code-view');
  if (!codeView || codeView.style.display === 'none') return null;
  if (!codeView.contains(sel.anchorNode) || !codeView.contains(sel.focusNode)) return null;
  var text = sel.toString();
  if (!text.trim()) return null;
  var fullText = codeView.textContent;
  var selStart = fullText.indexOf(text);
  var startLine = null;
  var endLine = null;
  if (selStart !== -1) {
    startLine = (fullText.substring(0, selStart).match(/\n/g) || []).length + 1;
    endLine = startLine + (text.match(/\n/g) || []).length;
  }
  return { text: text, startLine: startLine, endLine: endLine, source: 'codeview' };
}

function getSelectionFromMarkdown() {
  var sel = window.getSelection();
  if (!sel || sel.isCollapsed) return null;
  var renderedView = document.getElementById('file-rendered-view');
  if (!renderedView || !renderedView.classList.contains('visible')) return null;
  if (!renderedView.contains(sel.anchorNode) || !renderedView.contains(sel.focusNode)) return null;
  var text = sel.toString();
  if (!text.trim()) return null;
  return { text: text, startLine: null, endLine: null, source: 'markdown' };
}

function captureSelectionContext() {
  var filePath = getCurrentFileKey();
  if (!filePath || filePath === 'chat') return null;

  var sel = getSelectionFromMonaco()
         || getSelectionFromTextarea()
         || getSelectionFromCodeView()
         || getSelectionFromMarkdown();

  if (!sel) return null;

  return {
    filePath: filePath,
    startLine: sel.startLine,
    endLine: sel.endLine,
    text: sel.text,
    source: sel.source,
  };
}

function setSelectionContext(ctx) {
  selectionContext = ctx;
  renderSelectionContextIndicator();
}

function clearSelectionContext() {
  selectionContext = null;
  renderSelectionContextIndicator();
}

function renderSelectionContextIndicator() {
  var el = document.getElementById('selection-context-indicator');
  if (!el) return;
  if (!selectionContext) {
    el.classList.remove('visible');
    el.innerHTML = '';
    return;
  }
  var ctx = selectionContext;
  var fileName = ctx.filePath.split('/').pop();
  var lineInfo = '';
  if (ctx.startLine !== null) {
    lineInfo = ctx.startLine === ctx.endLine
      ? ' L' + ctx.startLine
      : ' L' + ctx.startLine + '-' + ctx.endLine;
  }
  var preview = ctx.text.trim();
  if (preview.length > 80) preview = preview.substring(0, 77) + '...';
  preview = preview.replace(/\n/g, ' ');

  el.innerHTML =
    '<span class="sel-ctx-label">Selection:</span>' +
    '<span class="sel-ctx-file">' + esc(fileName + lineInfo) + '</span>' +
    '<span class="sel-ctx-preview">' + esc(preview) + '</span>' +
    '<button class="sel-ctx-dismiss" onclick="clearSelectionContext()" title="Remove selection context">&times;</button>';
  el.classList.add('visible');
}

function formatSelectionContextForMessage(userMessage) {
  if (!selectionContext) return userMessage;
  var ctx = selectionContext;
  var fileRef = 'File: ' + ctx.filePath;
  if (ctx.startLine !== null) {
    fileRef += ctx.startLine === ctx.endLine
      ? ' (line ' + ctx.startLine + ')'
      : ' (lines ' + ctx.startLine + '-' + ctx.endLine + ')';
  }
  return '--- Selected Code ---\n' + fileRef + '\n```\n' + ctx.text + '\n```\n---\n\n' + userMessage;
}
