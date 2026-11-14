// ═══════════════════════════════════════════════════════════════
// Monaco Editor loader
// ═══════════════════════════════════════════════════════════════

function loadMonaco() {
  if (monacoLoadPromise) return monacoLoadPromise;
  monacoLoadPromise = new Promise(function(resolve, reject) {
    if (monacoLoaded) { resolve(window.monaco); return; }
    if (monacoFailed) { reject(new Error('Monaco load failed previously')); return; }

    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
    script.onload = function() {
      window.require.config({
        paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
      });
      window.require(['vs/editor/editor.main'], function() {
        monacoLoaded = true;
        defineShardsDarkTheme();
        if (typeof registerCodeIntelProviders === 'function') {
          registerCodeIntelProviders();
        }
        resolve(window.monaco);
      });
    };
    script.onerror = function() {
      monacoFailed = true;
      reject(new Error('Monaco CDN load failed'));
    };
    // Timeout fallback
    setTimeout(function() {
      if (!monacoLoaded) {
        monacoFailed = true;
        reject(new Error('Monaco load timeout'));
      }
    }, 15000);
    document.head.appendChild(script);
  });
  return monacoLoadPromise;
}

function defineShardsDarkTheme() {
  monaco.editor.defineTheme('shards-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'string', foreground: '98c379' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'comment', foreground: '4a5060', fontStyle: 'italic' },
      { token: 'type', foreground: '61afef' },
      { token: 'function', foreground: '61afef' },
      { token: 'variable', foreground: 'b0b0c4' },
      { token: 'operator', foreground: '56b6c2' },
      { token: 'delimiter', foreground: '808098' },
      { token: 'tag', foreground: 'e06c75' },
      { token: 'attribute.name', foreground: 'd19a66' },
      { token: 'attribute.value', foreground: '98c379' },
    ],
    colors: {
      'editor.background': '#0a0a16',
      'editor.foreground': '#b0b0c4',
      'editor.lineHighlightBackground': '#0e0e1e',
      'editor.selectionBackground': '#1a1a3a',
      'editorCursor.foreground': '#5080e0',
      'editorLineNumber.foreground': '#2a2a44',
      'editorLineNumber.activeForeground': '#4a4a68',
      'editor.inactiveSelectionBackground': '#141428',
      'editorIndentGuide.background': '#141420',
      'editorWhitespace.foreground': '#1a1a2c',
      'scrollbarSlider.background': '#1a1a2c80',
      'scrollbarSlider.hoverBackground': '#25254080',
    },
  });
  monaco.editor.defineTheme('shards-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '8b2fc9' },
      { token: 'string', foreground: '248a3d' },
      { token: 'number', foreground: 'b05000' },
      { token: 'comment', foreground: '8e8e93', fontStyle: 'italic' },
      { token: 'type', foreground: '2560c4' },
      { token: 'function', foreground: '2560c4' },
      { token: 'variable', foreground: '333333' },
      { token: 'operator', foreground: '1a7a7a' },
      { token: 'delimiter', foreground: '666666' },
      { token: 'tag', foreground: 'c23030' },
      { token: 'attribute.name', foreground: 'b05000' },
      { token: 'attribute.value', foreground: '248a3d' },
    ],
    colors: {
      'editor.background': '#f5f5f8',
      'editor.foreground': '#333333',
      'editor.lineHighlightBackground': '#f0f0f4',
      'editor.selectionBackground': '#c5cae9',
      'editorCursor.foreground': '#4a80e0',
      'editorLineNumber.foreground': '#bbbbbb',
      'editorLineNumber.activeForeground': '#888888',
      'editor.inactiveSelectionBackground': '#dde4f4',
      'editorIndentGuide.background': '#e0e0e0',
      'editorWhitespace.foreground': '#d0d0d0',
      'scrollbarSlider.background': '#cccccc80',
      'scrollbarSlider.hoverBackground': '#aaaaaa80',
    },
  });
}

function currentMonacoTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'shards-light' : 'shards-dark';
}

function disposeMonacoInstance() {
  if (activeMonacoInstance) {
    activeMonacoInstance.dispose();
    activeMonacoInstance = null;
  }
}

function disposeNotebookCellMonaco() {
  if (activeNotebookCellMonaco) {
    // Save current value before disposing
    var key = getCurrentFileKey();
    if (key && openFiles[key] && openFiles[key].notebookData && activeNotebookCellIdx !== null) {
      var cell = openFiles[key].notebookData.cells[activeNotebookCellIdx];
      if (cell) {
        cell.source = activeNotebookCellMonaco.getValue();
        if (cell.cell_type === 'markdown') {
          cell.editing = false;
          // Update DOM directly to show rendered markdown without a full re-render
          var inputEl = document.querySelector('[data-cell-input="' + activeNotebookCellIdx + '"]');
          if (inputEl) {
            inputEl.innerHTML = '<div class="file-rendered">' + renderMarkdown(cell.source) + '</div>';
          }
        }
      }
    }
    activeNotebookCellMonaco.dispose();
    activeNotebookCellMonaco = null;
    activeNotebookCellIdx = null;
  }
}

function createMonacoEditor(container, options) {
  return monaco.editor.create(container, {
    theme: currentMonacoTheme(),
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
    lineHeight: 20,
    renderLineHighlight: 'line',
    scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    padding: { top: 8, bottom: 8 },
    quickSuggestions: true,
    parameterHints: { enabled: true },
    gotoLocation: { multiple: 'peek', multipleDefinitions: 'peek', multipleReferences: 'peek' },
    ...options,
  });
}
