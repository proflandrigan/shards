// ═══════════════════════════════════════════════════════════════
// Code Intelligence — Monaco language providers
// ═══════════════════════════════════════════════════════════════

var codeIntelReady = false;

var CODE_INTEL_LANGS = ['python', 'javascript', 'typescript', 'go', 'rust', 'java', 'ruby', 'php', 'c', 'cpp'];

// ─── Kind → Monaco CompletionItemKind mapping ────────────────────────────────

function kindToMonacoKind(kind) {
  if (!window.monaco) return 0;
  var map = {
    'function': monaco.languages.CompletionItemKind.Function,
    'method': monaco.languages.CompletionItemKind.Method,
    'class': monaco.languages.CompletionItemKind.Class,
    'variable': monaco.languages.CompletionItemKind.Variable,
    'property': monaco.languages.CompletionItemKind.Property,
    'interface': monaco.languages.CompletionItemKind.Interface,
    'enum': monaco.languages.CompletionItemKind.Enum,
    'struct': monaco.languages.CompletionItemKind.Struct,
    'type': monaco.languages.CompletionItemKind.TypeParameter,
    'module': monaco.languages.CompletionItemKind.Module,
    'namespace': monaco.languages.CompletionItemKind.Module,
    'constant': monaco.languages.CompletionItemKind.Constant,
    'macro': monaco.languages.CompletionItemKind.Keyword,
  };
  return map[kind] || monaco.languages.CompletionItemKind.Text;
}

// ─── Kind → Monaco SymbolKind mapping ────────────────────────────────────────

function kindToMonacoSymbolKind(kind) {
  if (!window.monaco) return 0;
  var map = {
    'function': monaco.languages.SymbolKind.Function,
    'method': monaco.languages.SymbolKind.Method,
    'class': monaco.languages.SymbolKind.Class,
    'variable': monaco.languages.SymbolKind.Variable,
    'property': monaco.languages.SymbolKind.Property,
    'interface': monaco.languages.SymbolKind.Interface,
    'enum': monaco.languages.SymbolKind.Enum,
    'struct': monaco.languages.SymbolKind.Struct,
    'type': monaco.languages.SymbolKind.TypeParameter,
    'module': monaco.languages.SymbolKind.Module,
    'namespace': monaco.languages.SymbolKind.Namespace,
    'constant': monaco.languages.SymbolKind.Constant,
  };
  return map[kind] || monaco.languages.SymbolKind.Variable;
}

// ─── Kind badge for UI ───────────────────────────────────────────────────────

function kindBadge(kind) {
  var map = {
    'function': 'fn', 'method': 'fn', 'class': 'cls', 'struct': 'str',
    'interface': 'ifc', 'variable': 'var', 'property': 'prop', 'enum': 'enum',
    'type': 'type', 'module': 'mod', 'namespace': 'ns', 'constant': 'const', 'macro': 'mac',
  };
  return map[kind] || kind;
}

function kindBadgeClass(kind) {
  if (kind === 'function' || kind === 'method') return 'ci-badge-fn';
  if (kind === 'class' || kind === 'struct' || kind === 'interface') return 'ci-badge-cls';
  if (kind === 'variable' || kind === 'property' || kind === 'constant') return 'ci-badge-var';
  return 'ci-badge-other';
}

// ─── Navigate to definition ──────────────────────────────────────────────────

function navigateToDefinition(file, line) {
  openFileFromExplorer(file).then(function() {
    // Wait for Monaco to mount
    setTimeout(function() {
      if (activeMonacoInstance) {
        activeMonacoInstance.revealLineInCenter(line);
        activeMonacoInstance.setPosition({ lineNumber: line, column: 1 });
        activeMonacoInstance.focus();
      }
    }, 150);
  });
}

// ─── Register all providers ──────────────────────────────────────────────────

function registerCodeIntelProviders() {
  if (codeIntelReady) return;
  if (!window.monaco) return;
  codeIntelReady = true;

  // ─── Definition Provider ─────────────────────────────────────────

  for (var i = 0; i < CODE_INTEL_LANGS.length; i++) {
    (function(lang) {
      monaco.languages.registerDefinitionProvider(lang, {
        provideDefinition: function(model, position, token) {
          var word = model.getWordAtPosition(position);
          if (!word) return null;

          var currentFile = getCurrentFileKey() || '';

          return authFetch('/symbols/definition?name=' + encodeURIComponent(word.word) + '&file=' + encodeURIComponent(currentFile) + '&line=' + position.lineNumber)
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (!data.definitions || data.definitions.length === 0) return null;

              return data.definitions.map(function(def) {
                return {
                  uri: monaco.Uri.parse('file:///' + def.file),
                  range: new monaco.Range(def.line, 1, def.line, 1),
                };
              });
            })
            .catch(function() { return null; });
        },
      });

      // ─── Reference Provider ────────────────────────────────────────

      monaco.languages.registerReferenceProvider(lang, {
        provideReferences: function(model, position, context, token) {
          var word = model.getWordAtPosition(position);
          if (!word) return null;

          var currentFile = getCurrentFileKey() || '';

          return authFetch('/symbols/references?name=' + encodeURIComponent(word.word) + '&file=' + encodeURIComponent(currentFile))
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (!data.references || data.references.length === 0) return null;

              return data.references.map(function(ref) {
                return {
                  uri: monaco.Uri.parse('file:///' + ref.file),
                  range: new monaco.Range(ref.line, 1, ref.line, 1),
                };
              });
            })
            .catch(function() { return null; });
        },
      });

      // ─── Hover Provider ────────────────────────────────────────────

      monaco.languages.registerHoverProvider(lang, {
        provideHover: function(model, position, token) {
          var word = model.getWordAtPosition(position);
          if (!word) return null;

          var currentFile = getCurrentFileKey() || '';

          return authFetch('/symbols/hover?name=' + encodeURIComponent(word.word) + '&file=' + encodeURIComponent(currentFile) + '&line=' + position.lineNumber)
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (!data || data.found === false || !data.name) return null;

              var sig = data.signature ? data.name + data.signature : data.name;
              var contents = [];

              // Show kind + signature in a code block
              contents.push({
                value: '```\n(' + data.kind + ') ' + sig + '\n```',
              });

              // Show source location
              if (data.file) {
                contents.push({
                  value: '*' + data.file + ':' + data.line + '*',
                });
              }

              // Show scope if available
              if (data.scope) {
                contents.push({
                  value: 'Scope: `' + data.scope + '`',
                });
              }

              return {
                range: new monaco.Range(
                  position.lineNumber, word.startColumn,
                  position.lineNumber, word.endColumn
                ),
                contents: contents,
              };
            })
            .catch(function() { return null; });
        },
      });

      // ─── Completion Provider ───────────────────────────────────────

      monaco.languages.registerCompletionItemProvider(lang, {
        triggerCharacters: ['.', '_'],
        provideCompletionItems: function(model, position, context, token) {
          var word = model.getWordUntilPosition(position);
          var prefix = word.word;
          if (!prefix || prefix.length < 2) return { suggestions: [] };

          var currentFile = getCurrentFileKey() || '';

          return authFetch('/symbols/completions?prefix=' + encodeURIComponent(prefix) + '&file=' + encodeURIComponent(currentFile))
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (!data.completions) return { suggestions: [] };

              var range = new monaco.Range(
                position.lineNumber, word.startColumn,
                position.lineNumber, word.endColumn
              );

              return {
                suggestions: data.completions.map(function(comp, idx) {
                  return {
                    label: comp.name,
                    kind: kindToMonacoKind(comp.kind),
                    detail: (comp.kind || '') + (comp.detail ? ' ' + comp.detail : ''),
                    documentation: comp.file ? 'Defined in ' + comp.file + ':' + comp.line : '',
                    insertText: comp.name,
                    range: range,
                    sortText: String(idx).padStart(4, '0'),
                  };
                }),
              };
            })
            .catch(function() { return { suggestions: [] }; });
        },
      });
    })(CODE_INTEL_LANGS[i]);
  }

  // ─── Editor opener for go-to-definition navigation ─────────────

  try {
    monaco.editor.registerEditorOpener({
      openCodeEditor: function(source, resource, selectionOrPosition) {
        // resource.path is like /path/to/file — extract relative path
        var filePath = resource.path;
        if (filePath.startsWith('/')) filePath = filePath.substring(1);

        var line = 1;
        if (selectionOrPosition) {
          line = selectionOrPosition.startLineNumber || selectionOrPosition.lineNumber || 1;
        }

        navigateToDefinition(filePath, line);
        return true; // we handled it
      },
    });
  } catch (e) {
    // registerEditorOpener may not be available in all Monaco builds
    // Fallback: override the go-to-definition action
  }
}

// ─── Standalone actions (for command palette) ────────────────────────────────

function triggerGoToDefinition() {
  if (activeMonacoInstance) {
    try {
      activeMonacoInstance.getAction('editor.action.revealDefinition').run();
    } catch {}
  }
}

function triggerFindReferences() {
  if (activeMonacoInstance) {
    try {
      activeMonacoInstance.getAction('editor.action.referenceSearch.trigger').run();
    } catch {}
  }
}

function triggerPeekDefinition() {
  if (activeMonacoInstance) {
    try {
      activeMonacoInstance.getAction('editor.action.peekDefinition').run();
    } catch {}
  }
}

function openSymbolSearch() {
  var overlay = document.getElementById('quick-open-overlay');
  overlay.classList.add('visible');
  var input = document.getElementById('quick-open-input');
  input.value = '@';
  input.focus();
  // Move cursor to end
  input.setSelectionRange(1, 1);
  quickOpenIdx = -1;
  renderQuickOpenResults('@');
}
