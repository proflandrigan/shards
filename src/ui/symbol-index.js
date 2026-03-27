'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// ─── Symbol Index Engine ─────────────────────────────────────────────────────
// Builds and maintains an in-memory symbol index using ctags (with regex fallback).

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.shards', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache', 'dist', 'build']);
const SUPPORTED_EXTS = new Set(['.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs', '.java', '.rb', '.c', '.cpp', '.h', '.hpp', '.cs', '.php', '.swift', '.kt', '.r', '.R', '.sql', '.sh', '.bash']);

let symbolsByName = new Map();   // name -> SymbolEntry[]
let symbolsByFile = new Map();   // relPath -> SymbolEntry[]
let ctagsAvailable = false;
let indexedAt = null;
let projectDir = null;
let watcher = null;
let watchDebounce = new Map();   // relPath -> timeout

// ─── Reference cache for hover enrichment ───────────────────────────────────
let referenceCache = new Map();  // name -> { refs: {count, byFile}, callers, callees, builtAt }
let fileToRefNames = new Map();  // file -> Set<name> — reverse map for cache invalidation
let cacheBuilding = false;
let cacheQueue = [];             // names queued for background cache build

// ─── Ctags detection ─────────────────────────────────────────────────────────

function detectCtags() {
  try {
    execSync('ctags --version', { timeout: 3000, stdio: 'pipe' });
    ctagsAvailable = true;
  } catch {
    ctagsAvailable = false;
  }
  return ctagsAvailable;
}

// ─── Ctags-based indexing ────────────────────────────────────────────────────

function parseCtagsJson(output) {
  const entries = [];
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    try {
      const tag = JSON.parse(line);
      if (!tag.name || !tag.path) continue;
      entries.push({
        name: tag.name,
        kind: mapCtagsKind(tag.kind),
        file: tag.path,
        line: tag.line || 0,
        pattern: tag.pattern || '',
        scope: tag.scope || null,
        scopeKind: tag.scopeKind || null,
        signature: tag.signature || null,
      });
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

function mapCtagsKind(kind) {
  if (!kind) return 'symbol';
  const map = {
    f: 'function', F: 'function', function: 'function',
    c: 'class', class: 'class',
    m: 'method', method: 'method', member: 'method',
    v: 'variable', variable: 'variable',
    p: 'property', property: 'property',
    i: 'interface', interface: 'interface',
    e: 'enum', enum: 'enum',
    t: 'type', typedef: 'type', type: 'type',
    s: 'struct', struct: 'struct',
    n: 'namespace', namespace: 'namespace', module: 'module',
    d: 'macro', macro: 'macro', define: 'macro',
    C: 'constant', constant: 'constant',
  };
  return map[kind] || kind;
}

function runCtagsOnProject(dir) {
  try {
    const args = [
      '--output-format=json',
      '--fields=+nKS',
      '--extras=-{anonymous}',
      '-R',
      '--exclude=node_modules',
      '--exclude=.git',
      '--exclude=__pycache__',
      '--exclude=.venv',
      '--exclude=venv',
      '--exclude=.shards',
      '--exclude=dist',
      '--exclude=build',
      '--exclude=.tox',
      '.',
    ];
    const output = execFileSync('ctags', args, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 50 * 1024 * 1024,
    });
    return parseCtagsJson(output);
  } catch (err) {
    return null;
  }
}

function runCtagsOnFile(dir, relPath) {
  try {
    const absPath = path.join(dir, relPath);
    if (!fs.existsSync(absPath)) return [];
    const args = ['--output-format=json', '--fields=+nKS', '--extras=-{anonymous}', absPath];
    const output = execFileSync('ctags', args, {
      cwd: dir,
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
    });
    // ctags outputs absolute paths when given absolute input; normalize to relative
    const entries = parseCtagsJson(output);
    for (const e of entries) {
      e.file = path.relative(dir, e.file);
    }
    return entries;
  } catch {
    return [];
  }
}

// ─── Regex-based fallback indexing ───────────────────────────────────────────

const REGEX_PATTERNS = {
  '.py': [
    { regex: /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm, kind: 'function', sigGroup: 2 },
    { regex: /^class\s+(\w+)(?:\s*\(([^)]*)\))?/gm, kind: 'class', sigGroup: 2 },
    { regex: /^(\w+)\s*=\s*/gm, kind: 'variable' },
  ],
  '.js': [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/gm, kind: 'function', sigGroup: 2 },
    { regex: /^(?:export\s+)?class\s+(\w+)/gm, kind: 'class' },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/gm, kind: 'variable' },
    { regex: /(\w+)\s*[:=]\s*(?:async\s+)?function\s*\(([^)]*)\)/gm, kind: 'function', sigGroup: 2 },
    { regex: /(\w+)\s*\(([^)]*)\)\s*\{/gm, kind: 'function', sigGroup: 2 },
  ],
  '.ts': null,  // same as .js
  '.tsx': null,
  '.jsx': null,
  '.go': [
    { regex: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(([^)]*)\)/gm, kind: 'function', sigGroup: 2 },
    { regex: /^type\s+(\w+)\s+struct/gm, kind: 'struct' },
    { regex: /^type\s+(\w+)\s+interface/gm, kind: 'interface' },
  ],
  '.rs': [
    { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/gm, kind: 'function', sigGroup: 2 },
    { regex: /^(?:pub\s+)?struct\s+(\w+)/gm, kind: 'struct' },
    { regex: /^(?:pub\s+)?enum\s+(\w+)/gm, kind: 'enum' },
    { regex: /^(?:pub\s+)?trait\s+(\w+)/gm, kind: 'interface' },
  ],
  '.java': [
    { regex: /(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(([^)]*)\)/gm, kind: 'method', sigGroup: 2 },
    { regex: /(?:public\s+)?class\s+(\w+)/gm, kind: 'class' },
    { regex: /(?:public\s+)?interface\s+(\w+)/gm, kind: 'interface' },
  ],
  '.rb': [
    { regex: /^\s*def\s+(\w+)(?:\(([^)]*)\))?/gm, kind: 'function', sigGroup: 2 },
    { regex: /^\s*class\s+(\w+)/gm, kind: 'class' },
    { regex: /^\s*module\s+(\w+)/gm, kind: 'module' },
  ],
  '.sql': [
    { regex: /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(\w+)\s*\(([^)]*)\)/gim, kind: 'function', sigGroup: 2 },
    { regex: /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gim, kind: 'class' },
  ],
};

// Alias entries
REGEX_PATTERNS['.ts'] = REGEX_PATTERNS['.js'];
REGEX_PATTERNS['.tsx'] = REGEX_PATTERNS['.js'];
REGEX_PATTERNS['.jsx'] = REGEX_PATTERNS['.js'];

function regexIndexFile(dir, relPath) {
  const ext = path.extname(relPath).toLowerCase();
  const patterns = REGEX_PATTERNS[ext];
  if (!patterns) return [];

  let content;
  try {
    const absPath = path.join(dir, relPath);
    const stat = fs.statSync(absPath);
    if (stat.size > 2 * 1024 * 1024) return []; // skip large files
    content = fs.readFileSync(absPath, 'utf8');
  } catch {
    return [];
  }

  const entries = [];
  const lines = content.split('\n');

  for (const pat of patterns) {
    pat.regex.lastIndex = 0;
    let match;
    while ((match = pat.regex.exec(content)) !== null) {
      const name = match[1];
      if (!name || name.length < 2) continue;

      // Calculate line number
      const offset = match.index;
      let lineNum = 1;
      for (let i = 0; i < offset && i < content.length; i++) {
        if (content[i] === '\n') lineNum++;
      }

      const sig = pat.sigGroup ? (match[pat.sigGroup] || '') : null;

      entries.push({
        name,
        kind: pat.kind,
        file: relPath,
        line: lineNum,
        pattern: lines[lineNum - 1] || '',
        scope: null,
        scopeKind: null,
        signature: sig ? `(${sig})` : null,
      });
    }
  }

  // Deduplicate entries with same name+line (multiple patterns can match the same symbol)
  const seen = new Set();
  return entries.filter(e => {
    const key = `${e.name}:${e.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function regexIndexProject(dir) {
  const entries = [];
  function walk(currentDir, relDir) {
    let items;
    try { items = fs.readdirSync(currentDir); } catch { return; }
    for (const item of items) {
      if (SKIP_DIRS.has(item)) continue;
      const fullPath = path.join(currentDir, item);
      const relPath = relDir ? `${relDir}/${item}` : item;
      let stat;
      try { stat = fs.statSync(fullPath); } catch { continue; }
      if (stat.isDirectory()) {
        walk(fullPath, relPath);
      } else if (stat.isFile() && SUPPORTED_EXTS.has(path.extname(item).toLowerCase())) {
        const fileEntries = regexIndexFile(dir, relPath);
        entries.push(...fileEntries);
      }
    }
  }
  walk(dir, '');
  return entries;
}

// ─── Index management ────────────────────────────────────────────────────────

function insertEntries(entries) {
  for (const entry of entries) {
    // By name
    if (!symbolsByName.has(entry.name)) {
      symbolsByName.set(entry.name, []);
    }
    symbolsByName.get(entry.name).push(entry);

    // By file
    if (!symbolsByFile.has(entry.file)) {
      symbolsByFile.set(entry.file, []);
    }
    symbolsByFile.get(entry.file).push(entry);
  }
}

function removeFileEntries(relPath) {
  const entries = symbolsByFile.get(relPath);
  if (!entries) return;

  // Remove from symbolsByName
  for (const entry of entries) {
    const nameEntries = symbolsByName.get(entry.name);
    if (nameEntries) {
      const filtered = nameEntries.filter(e => e.file !== relPath);
      if (filtered.length > 0) {
        symbolsByName.set(entry.name, filtered);
      } else {
        symbolsByName.delete(entry.name);
      }
    }
  }

  symbolsByFile.delete(relPath);
}

function buildIndex(dir, logFn) {
  projectDir = dir;
  const log = logFn || (() => {});

  detectCtags();
  symbolsByName = new Map();
  symbolsByFile = new Map();

  let entries;
  if (ctagsAvailable) {
    entries = runCtagsOnProject(dir);
    if (!entries) {
      // ctags failed, fall back
      log('ctags execution failed, falling back to regex indexer');
      entries = regexIndexProject(dir);
    } else {
      log(`ctags indexed ${entries.length} symbols`);
    }
  } else {
    log('ctags not found — using regex fallback (install universal-ctags for full features)');
    entries = regexIndexProject(dir);
    log(`regex indexed ${entries.length} symbols`);
  }

  insertEntries(entries);
  indexedAt = new Date().toISOString();
}

function updateFileIndex(dir, relPath) {
  if (!SUPPORTED_EXTS.has(path.extname(relPath).toLowerCase())) return;

  // Invalidate reference cache entries affected by this file change
  invalidateCacheForFile(relPath, dir);

  removeFileEntries(relPath);

  let entries;
  if (ctagsAvailable) {
    entries = runCtagsOnFile(dir, relPath);
    if (!entries || entries.length === 0) {
      entries = regexIndexFile(dir, relPath);
    }
  } else {
    entries = regexIndexFile(dir, relPath);
  }

  insertEntries(entries);
}

// ─── Query functions ─────────────────────────────────────────────────────────

function getDefinitions(name, contextFile) {
  const entries = symbolsByName.get(name) || [];
  if (entries.length === 0) return [];

  // Rank by proximity to context file
  const contextDir = contextFile ? path.dirname(contextFile) : '';
  const contextExt = contextFile ? path.extname(contextFile) : '';

  // Prefer non-variable definitions, but fall back to variables if that's all we have
  const nonVariables = entries.filter(e => e.kind !== 'variable');
  const candidates = nonVariables.length > 0 ? nonVariables : entries;

  return candidates
    .sort((a, b) => {
      // Same file first
      const aFile = a.file === contextFile ? 0 : 1;
      const bFile = b.file === contextFile ? 0 : 1;
      if (aFile !== bFile) return aFile - bFile;

      // Same directory
      const aDir = path.dirname(a.file) === contextDir ? 0 : 1;
      const bDir = path.dirname(b.file) === contextDir ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;

      // Same extension
      const aExt = path.extname(a.file) === contextExt ? 0 : 1;
      const bExt = path.extname(b.file) === contextExt ? 0 : 1;
      if (aExt !== bExt) return aExt - bExt;

      // Prefer functions/classes over variables
      const kindRank = { 'function': 0, 'method': 0, 'class': 1, 'struct': 1, 'interface': 1, 'type': 2 };
      const aKind = kindRank[a.kind] ?? 3;
      const bKind = kindRank[b.kind] ?? 3;
      return aKind - bKind;
    })
    .slice(0, 20);
}

function getReferences(name, dir) {
  if (!name || name.length < 2) return [];

  // Use grep for textual references
  const includeFlags = [];
  for (const ext of SUPPORTED_EXTS) {
    includeFlags.push(`--include=*${ext}`);
  }

  try {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const args = ['-rn', ...includeFlags, '--max-count=200', `\\b${escapedName}\\b`, '.'];
    const output = execFileSync('grep', args, {
      cwd: dir, encoding: 'utf8', timeout: 5000, maxBuffer: 5 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
    });

    const results = [];
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
      if (match) {
        const [, file, lineNum, text] = match;
        // Skip files in skip dirs
        if (SKIP_DIRS.has(file.split('/')[0])) continue;
        results.push({ file, line: parseInt(lineNum, 10), text: text.trim() });
      }
    }
    return results.slice(0, 200);
  } catch {
    // grep returns exit code 1 when no matches — that's fine
    return [];
  }
}

function getCompletions(prefix, contextFile) {
  if (!prefix || prefix.length < 1) return [];

  const lowerPrefix = prefix.toLowerCase();
  const results = [];
  const contextDir = contextFile ? path.dirname(contextFile) : '';

  for (const [name, entries] of symbolsByName) {
    if (name.toLowerCase().startsWith(lowerPrefix)) {
      // Pick the best entry for this name (slice to avoid mutating the index)
      const best = entries.slice().sort((a, b) => {
        if (a.file === contextFile && b.file !== contextFile) return -1;
        if (b.file === contextFile && a.file !== contextFile) return 1;
        if (path.dirname(a.file) === contextDir) return -1;
        if (path.dirname(b.file) === contextDir) return 1;
        return 0;
      })[0];

      results.push({
        name: best.name,
        kind: best.kind,
        detail: best.signature || '',
        file: best.file,
        line: best.line,
      });
    }
  }

  // Sort: exact prefix match first, then shorter names, then alphabetical
  results.sort((a, b) => {
    const aExact = a.name.startsWith(prefix) ? 0 : 1;
    const bExact = b.name.startsWith(prefix) ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, 50);
}

function getHoverInfo(name, contextFile, line) {
  const entries = symbolsByName.get(name);
  if (!entries || entries.length === 0) return null;

  // Best match: same file + closest line
  let best = null;
  let bestScore = Infinity;

  for (const entry of entries) {
    let score = 1000;
    if (entry.file === contextFile) {
      score = Math.abs(entry.line - (line || 0));
    } else if (contextFile && path.dirname(entry.file) === path.dirname(contextFile)) {
      score = 500;
    }
    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  return best;
}

function getStatus() {
  let symbolCount = 0;
  for (const entries of symbolsByName.values()) {
    symbolCount += entries.length;
  }
  return {
    indexed: indexedAt !== null,
    symbolCount,
    fileCount: symbolsByFile.size,
    ctagsAvailable,
    lastIndexed: indexedAt,
  };
}

// ─── File watcher ────────────────────────────────────────────────────────────

function startWatcher(dir, logFn) {
  if (watcher) return;
  const log = logFn || (() => {});

  try {
    watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Normalize path separators
      const relPath = filename.replace(/\\/g, '/');

      // Skip non-supported files and skip dirs
      const parts = relPath.split('/');
      for (const part of parts) {
        if (SKIP_DIRS.has(part)) return;
      }
      if (!SUPPORTED_EXTS.has(path.extname(relPath).toLowerCase())) return;

      // Debounce per file
      if (watchDebounce.has(relPath)) {
        clearTimeout(watchDebounce.get(relPath));
      }
      watchDebounce.set(relPath, setTimeout(() => {
        watchDebounce.delete(relPath);
        updateFileIndex(dir, relPath);
      }, 500));
    });

    watcher.on('error', (err) => {
      log(`File watcher error: ${err.message}`);
    });
  } catch (err) {
    log(`Could not start file watcher: ${err.message}`);
  }
}

function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  for (const timeout of watchDebounce.values()) {
    clearTimeout(timeout);
  }
  watchDebounce.clear();
}

// ─── Reference cache & lineage ───────────────────────────────────────────────

const CALLABLE_KINDS = new Set(['function', 'method', 'class', 'struct', 'interface', 'macro']);

function getCallersFromRefs(refs) {
  // For each reference, find the enclosing function/method in that file
  const callers = new Map(); // key -> caller entry (deduplicated)
  for (const ref of refs) {
    const fileSymbols = symbolsByFile.get(ref.file);
    if (!fileSymbols) continue;

    // Find the closest symbol defined before this reference line
    let enclosing = null;
    for (const sym of fileSymbols) {
      if (!CALLABLE_KINDS.has(sym.kind)) continue;
      if (sym.line <= ref.line) {
        if (!enclosing || sym.line > enclosing.line) {
          enclosing = sym;
        }
      }
    }
    if (enclosing) {
      const key = `${enclosing.name}:${enclosing.file}:${enclosing.line}`;
      if (!callers.has(key)) {
        callers.set(key, { name: enclosing.name, kind: enclosing.kind, file: enclosing.file, line: enclosing.line });
      }
    }
  }
  return Array.from(callers.values());
}

function getCalleesFromBody(entry) {
  if (!projectDir) return [];
  const fileSymbols = symbolsByFile.get(entry.file);
  if (!fileSymbols) return [];

  // Find the function body boundaries: from entry.line to next symbol's line in same file
  const sortedSyms = fileSymbols.slice().sort((a, b) => a.line - b.line);
  let bodyEnd = Infinity;
  for (const sym of sortedSyms) {
    if (sym.line > entry.line && sym !== entry) {
      bodyEnd = sym.line - 1;
      break;
    }
  }

  // Read the function body from disk
  let bodyText;
  try {
    const absPath = path.join(projectDir, entry.file);
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split('\n');
    const startLine = entry.line; // 1-indexed; skip the def line itself
    const endLine = Math.min(bodyEnd, lines.length);
    bodyText = lines.slice(startLine, endLine).join(' ');
  } catch {
    return [];
  }

  if (!bodyText) return [];

  // Tokenize body into words and intersect with known symbols
  const words = new Set(bodyText.match(/\b[a-zA-Z_]\w{2,}\b/g) || []);
  const callees = [];
  const seen = new Set();

  for (const word of words) {
    if (word === entry.name) continue; // skip self-references
    if (seen.has(word)) continue;

    const candidates = symbolsByName.get(word);
    if (!candidates) continue;

    // Only include callable kinds
    const callable = candidates.find(c => CALLABLE_KINDS.has(c.kind));
    if (callable) {
      seen.add(word);
      callees.push({ name: callable.name, kind: callable.kind, file: callable.file, line: callable.line });
    }
  }

  return callees.slice(0, 10);
}

function buildRefEntry(name, dir) {
  const refs = getReferences(name, dir);

  // Summarize references by file
  const byFileMap = new Map();
  for (const ref of refs) {
    if (!byFileMap.has(ref.file)) byFileMap.set(ref.file, []);
    byFileMap.get(ref.file).push(ref.line);
  }
  const byFile = Array.from(byFileMap.entries())
    .map(([file, lines]) => ({ file, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  // Track reverse mapping for cache invalidation
  for (const ref of refs) {
    if (!fileToRefNames.has(ref.file)) fileToRefNames.set(ref.file, new Set());
    fileToRefNames.get(ref.file).add(name);
  }

  // Find callers from reference locations
  const callers = getCallersFromRefs(refs);

  // Find callees from function body
  const entries = symbolsByName.get(name) || [];
  const defEntry = entries.find(e => CALLABLE_KINDS.has(e.kind)) || entries[0];
  const callees = defEntry ? getCalleesFromBody(defEntry) : [];

  const cacheEntry = {
    refs: {
      count: refs.length,
      byFile: byFile.slice(0, 5),
      truncated: byFile.length > 5,
    },
    callers: callers.slice(0, 5),
    callees: callees.slice(0, 5),
    builtAt: Date.now(),
  };

  referenceCache.set(name, cacheEntry);
  return cacheEntry;
}

function buildCacheAsync(dir, logFn) {
  const log = logFn || (() => {});
  if (cacheBuilding) return;

  referenceCache.clear();
  fileToRefNames.clear();
  cacheBuilding = true;

  // Queue all callable symbols for background cache build
  cacheQueue = [];
  for (const [name, entries] of symbolsByName) {
    if (entries.some(e => CALLABLE_KINDS.has(e.kind))) {
      cacheQueue.push(name);
    }
  }

  const total = cacheQueue.length;
  log(`Building reference cache for ${total} symbols...`);

  function processBatch() {
    const batchSize = 10;
    let processed = 0;
    while (processed < batchSize && cacheQueue.length > 0) {
      const name = cacheQueue.shift();
      try {
        buildRefEntry(name, dir);
      } catch {
        // skip failures
      }
      processed++;
    }

    if (cacheQueue.length > 0) {
      setImmediate(processBatch);
    } else {
      cacheBuilding = false;
      log(`Reference cache built: ${referenceCache.size} entries`);
    }
  }

  setImmediate(processBatch);
}

function invalidateCacheForFile(relPath, dir) {
  // Invalidate symbols defined in this file
  const fileSymbols = symbolsByFile.get(relPath) || [];
  const toRebuild = new Set();
  for (const sym of fileSymbols) {
    if (referenceCache.has(sym.name)) {
      referenceCache.delete(sym.name);
      toRebuild.add(sym.name);
    }
  }

  // Invalidate symbols that had references in this file
  const refNames = fileToRefNames.get(relPath);
  if (refNames) {
    for (const name of refNames) {
      if (referenceCache.has(name)) {
        referenceCache.delete(name);
        toRebuild.add(name);
      }
    }
    fileToRefNames.delete(relPath);
  }

  // Queue invalidated symbols for background rebuild
  if (toRebuild.size > 0 && dir) {
    for (const name of toRebuild) {
      cacheQueue.push(name);
    }
    if (!cacheBuilding) {
      cacheBuilding = true;
      setImmediate(function rebuildBatch() {
        let processed = 0;
        while (processed < 10 && cacheQueue.length > 0) {
          const name = cacheQueue.shift();
          try { buildRefEntry(name, dir); } catch { /* skip */ }
          processed++;
        }
        if (cacheQueue.length > 0) {
          setImmediate(rebuildBatch);
        } else {
          cacheBuilding = false;
        }
      });
    }
  }
}

function getHoverEnriched(name, contextFile, line) {
  const info = getHoverInfo(name, contextFile, line);
  if (!info) return null;

  const cached = referenceCache.get(name);
  if (cached) {
    return {
      ...info,
      references: cached.refs,
      callers: cached.callers,
      callees: cached.callees,
      enrichAvailable: true,
    };
  }

  return { ...info, enrichAvailable: false };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  buildIndex,
  updateFileIndex,
  getDefinitions,
  getReferences,
  getCompletions,
  getHoverInfo,
  getHoverEnriched,
  buildCacheAsync,
  getStatus,
  startWatcher,
  stopWatcher,
  detectCtags,
};
