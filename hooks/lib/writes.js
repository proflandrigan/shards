'use strict';
// Conservative write detection for PreToolUse enforcement (E11.6). Best effort, no execution.
// writesOf(n) -> {write:boolean, paths:string[] (absolute), unknown:boolean}
//   write   : the call is (or looks like) a write/exec
//   paths   : target paths we could determine, resolved against cwd
//   unknown : looks like a write but at least one target could not be determined
//   exec    : runs code from a file / package script (counts only while a gate is pending)
const path = require('path');

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

function stripHeredocs(cmd) {
  return cmd.replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '$3');
}

// Tokenise into segments of {words, redirects}. Quote aware; no expansion.
function parse(cmd) {
  const segs = [];
  let words = []; let redirects = []; let cur = ''; let has = false; let pendingRedir = false;
  const pushWord = () => {
    if (!has) return;
    if (pendingRedir) { redirects.push(cur); pendingRedir = false; } else words.push(cur);
    cur = ''; has = false;
  };
  const endSeg = () => { pushWord(); pendingRedir = false; if (words.length || redirects.length) segs.push({ words, redirects }); words = []; redirects = []; };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'") { has = true; const j = cmd.indexOf("'", i + 1); const e = j < 0 ? cmd.length : j; cur += cmd.slice(i + 1, e); i = e; continue; }
    if (c === '"') {
      has = true; i++;
      while (i < cmd.length && cmd[i] !== '"') { if (cmd[i] === '\\' && i + 1 < cmd.length) i++; cur += cmd[i]; i++; }
      continue;
    }
    if (c === '\\' && i + 1 < cmd.length) { has = true; cur += cmd[++i]; continue; }
    if (c === '>' || (c === '&' && cmd[i + 1] === '>')) {
      if (c === '&') i++;
      if (has && /^\d+$/.test(cur) && c === '>') { cur = ''; has = false; } else pushWord();
      if (cmd[i + 1] === '&') { // fd duplication (2>&1, >&2): not a file write
        i++; while (/[\d-]/.test(cmd[i + 1] || '')) i++;
        continue;
      }
      if (cmd[i + 1] === '>' || cmd[i + 1] === '|') i++;
      pendingRedir = true; continue;
    }
    if (c === ';' || c === '\n' || c === '|' || c === '&') { endSeg(); if ((c === '|' || c === '&') && cmd[i + 1] === c) i++; continue; }
    if (/\s/.test(c)) { pushWord(); continue; }
    has = true; cur += c;
  }
  endSeg();
  return segs;
}

const SKIP_TARGET = /^\/dev\/(null|stderr|stdout|tty|fd\/\d+)$/;
const ALL_ARGS = new Set(['rm', 'touch', 'mkdir', 'rmdir', 'truncate', 'chmod', 'chown', 'chgrp', 'ln', 'install', 'mv', 'unlink', 'shred', 'patch']);
const GIT_WRITES = new Set(['apply', 'checkout', 'commit', 'reset', 'restore', 'clean', 'merge', 'rebase', 'stash', 'cherry-pick', 'pull', 'switch', 'am', 'revert', 'add', 'rm', 'mv',
  'clone', 'init', 'worktree', 'submodule', 'sparse-checkout']);
// git global options that take a separate value (`git -C dir checkout`).
const GIT_GLOBAL_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);
const WRAPPERS = new Set(['sudo', 'env', 'command', 'nohup', 'time', 'nice', 'exec', 'xargs', 'timeout', 'stdbuf', 'ionice', 'caffeinate',
  'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '(']);
const SCRIPT_WRITE = /open\([^)]*['"][wax+]|\.write|writeFile|appendFile|unlink|rmtree|os\.remove|shutil\.|fs\.(rm|mkdir|rename|copy|write|append)|Path\([^)]*\)\.(write|touch|unlink|mkdir)/;
const INTERP = /^(python[0-9.]*|node|nodejs|ruby|perl|Rscript|php|deno|bun|tsx|ts-node)$/;
const SHELLS = /^(sh|bash|zsh|dash|ksh|fish)$/;
// cd/pushd/popd change the directory later targets resolve against; we don't track it.
const CWD_CHANGERS = new Set(['cd', 'pushd', 'popd']);
const PKG_MANAGERS = new Set(['npm', 'pnpm', 'yarn']);
const PKG_EXEC_SUBS = new Set(['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'update', 'up', 'upgrade', 'run', 'run-script', 'test', 't', 'exec', 'start', 'build', 'publish', 'link']);

const nonFlags = (a) => a.filter((x) => !x.startsWith('-'));

// Value of a flag given as `-o X`, `-oX` (short) or `--output X` / `--output=X` (long). undefined if absent.
function flagValue(args, shorts, longs) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    for (const l of longs) { if (a === l) return args[i + 1] || ''; if (a.startsWith(`${l}=`)) return a.slice(l.length + 1); }
    if (!a.startsWith('--') && a.startsWith('-')) {
      for (const s of shorts) {
        const k = a.indexOf(s, 1);
        if (k < 0) continue;
        return a.length > k + 1 ? a.slice(k + 1) : (args[i + 1] || '');
      }
    }
  }
  return undefined;
}

// Segment result: write (modifies files), targets (relative or absolute strings), unknown (a write
// whose target can't be determined), exec (runs code from a file or a package script: only counts for the
// pending-gate check, so leased workers can still run tests/scripts), cwdChange (cd/pushd/popd seen).
function analyzeSegment(seg) {
  const targets = []; let unknown = false; let write = false; let exec = false; let cwdChange = false;
  const add = (p) => { if (!p || SKIP_TARGET.test(p)) return; if (/[$`*?]/.test(p)) { unknown = true; return; } targets.push(p); };
  const out = () => ({ write, targets, unknown, exec, cwdChange });
  for (const r of seg.redirects) { if (SKIP_TARGET.test(r)) continue; write = true; add(r); }
  let w = seg.words.filter((x) => x !== ')' && x !== '}');
  if (w.length && w[0].startsWith('(') && w[0] !== '(') w[0] = w[0].replace(/^\(+/, '');
  while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || WRAPPERS.has(path.basename(w[0])))) {
    const wrapper = WRAPPERS.has(path.basename(w[0]));
    w.shift();
    if (wrapper) while (w.length && (w[0].startsWith('-') || /^\d+[smhd]?$/.test(w[0]))) w.shift();
  }
  if (!w.length) return out();
  const cmd = path.basename(w[0]); const args = w.slice(1);
  if (CWD_CHANGERS.has(cmd)) { cwdChange = true; return out(); }
  if (cmd === 'eval') { write = true; unknown = true; return out(); }
  if (cmd === 'source' || cmd === '.') { exec = true; return out(); }
  if (cmd === 'apply_patch') { write = true; unknown = true; return out(); }
  if (cmd === 'tee') { write = true; nonFlags(args).forEach(add); return out(); }
  if ((cmd === 'sed' || cmd === 'perl') && args.some((a) => /^-[A-Za-z]*i/.test(a) || a === '--in-place' || a.startsWith('--in-place='))) {
    write = true; const nf = nonFlags(args);
    if (!nf.length) unknown = true; else nf.slice(args.includes('-e') || args.includes('-f') ? 0 : 1).forEach(add);
    if (nf.length <= 1 && !args.includes('-e')) unknown = unknown || nf.length === 0;
    return out();
  }
  if (cmd === 'sed') return out();
  if (cmd === 'cp') {
    write = true; const ti = args.findIndex((a) => a === '-t' || a.startsWith('--target-directory'));
    if (ti >= 0) add(args[ti].includes('=') ? args[ti].split('=')[1] : args[ti + 1]); else { const nf = nonFlags(args); if (nf.length >= 2) add(nf[nf.length - 1]); else unknown = true; }
    return out();
  }
  if (ALL_ARGS.has(cmd)) { write = true; const nf = nonFlags(args); if (!nf.length) unknown = true; nf.forEach(add); return out(); }
  if (cmd === 'dd') { const of = args.find((a) => a.startsWith('of=')); if (of) { write = true; add(of.slice(3)); } return out(); }
  if (cmd === 'git') {
    let i = 0; let dir = null;
    while (i < args.length && args[i].startsWith('-')) {
      const a = args[i];
      if (GIT_GLOBAL_VALUE.has(a)) { if (a === '-C') dir = dir ? path.join(dir, args[i + 1] || '') : args[i + 1]; i += 2; } else i++;
    }
    const sub = args[i];
    if (sub && GIT_WRITES.has(sub)) {
      write = true;
      if (sub === 'rm' || sub === 'mv') nonFlags(args.slice(i + 1)).forEach((t) => add(dir && !path.isAbsolute(t) ? path.join(dir, t) : t)); else unknown = true;
    }
    return out();
  }
  if (cmd === 'find') {
    if (args.some((a) => /^-(delete|exec|execdir|ok|okdir)$/.test(a))) { write = true; unknown = true; }
    args.forEach((a, k) => { if (/^-(fprint0?|fprintf|fls)$/.test(a)) { write = true; add(args[k + 1]); } });
    return out();
  }
  if (cmd === 'awk' || cmd === 'gawk') {
    const inplace = args.some((a, k) => (a === '-i' && args[k + 1] === 'inplace') || a === '-iinplace' || a === '--inplace' || a === '--include=inplace');
    const files = []; let prog = null; let hasF = false;
    for (let k = 0; k < args.length; k++) {
      const a = args[k];
      if (['-i', '-v', '-F', '-f', '--include', '--assign', '--field-separator', '--file'].includes(a)) { if (a === '-f' || a === '--file') hasF = true; k++; continue; }
      if (a.startsWith('-')) { if (/^-f./.test(a) || a.startsWith('--file=')) hasF = true; continue; }
      if (prog === null && !hasF) prog = a; else files.push(a);
    }
    if (inplace) { write = true; if (files.length) files.forEach(add); else unknown = true; }
    if (hasF || (prog && /system\s*\(|[>|]\s*"/.test(prog))) { write = true; unknown = true; }
    return out();
  }
  if (cmd === 'tar' || cmd === 'bsdtar' || cmd === 'gtar') {
    const bundles = args.filter((a, k) => (a.startsWith('-') && !a.startsWith('--')) || (k === 0 && /^[A-Za-z]+$/.test(a)));
    const has = (ch, long) => bundles.some((b) => b.replace(/^-/, '').includes(ch)) || args.some((a) => long.includes(a));
    const dir = flagValue(args, [], ['--directory']) || (() => { const k = args.indexOf('-C'); return k >= 0 ? args[k + 1] : undefined; })();
    if (has('x', ['--extract', '--get'])) { write = true; add(dir || '.'); }
    if (has('c', ['--create']) || has('r', ['--append']) || has('u', ['--update'])) {
      write = true;
      const fb = bundles.find((b) => b.replace(/^-/, '').includes('f'));
      let f = flagValue(args, [], ['--file']);
      if (f === undefined && fb) { const k = args.indexOf(fb); const rest = fb.replace(/^-/, ''); f = rest.endsWith('f') ? args[k + 1] : undefined; }
      if (f && f !== '-') add(f); else if (!f) unknown = true;
    }
    return out();
  }
  if (cmd === 'unzip') {
    if (args.some((a) => a === '-l' || a === '-v' || a === '-t' || a === '-p' || a === '-Z')) return out();
    write = true; const d = flagValue(args, ['d'], []); add(d || '.'); return out();
  }
  if (cmd === 'curl') {
    const o = flagValue(args, ['o'], ['--output']);
    const dir = flagValue(args, [], ['--output-dir']);
    if (o !== undefined && o !== '-') { write = true; add(dir && !path.isAbsolute(o) ? path.join(dir, o) : o); }
    if (args.some((a) => a === '--remote-name' || a === '--remote-name-all' || a === '-J' || (/^-[A-Za-z]*O/.test(a) && !a.startsWith('--')))) { write = true; if (dir) add(dir); else unknown = true; }
    const side = flagValue(args, ['D', 'c'], ['--dump-header', '--cookie-jar', '--trace', '--trace-ascii', '--libcurl', '--etag-save', '--hsts', '--alt-svc']);
    if (side !== undefined && side !== '-') { write = true; add(side); }
    return out();
  }
  if (cmd === 'wget') {
    if (args.some((a) => a === '--spider')) return out();
    write = true;
    const o = flagValue(args, ['O'], ['--output-document']);
    const dir = flagValue(args, ['P'], ['--directory-prefix']);
    if (o === '-') { write = false; return out(); }
    if (o !== undefined) add(dir && !path.isAbsolute(o) ? path.join(dir, o) : o); else add(dir || '.');
    return out();
  }
  if (cmd === 'rsync' || cmd === 'scp') {
    const nf = nonFlags(args).filter((a, k, all) => {
      const prev = args[args.indexOf(a) - 1];
      return !(prev && /^(-e|--rsh|-i|-F|-P|-o|-l|-c|-S|--exclude|--include|--exclude-from|--include-from|--files-from|--filter|-f|--port|--log-file|--password-file|--partial-dir|--temp-dir|-T|--backup-dir|--compare-dest|--copy-dest|--link-dest|--chmod|--chown)$/.test(prev));
    });
    const dest = nf.length >= 2 ? nf[nf.length - 1] : null;
    if (!dest) { write = true; unknown = true; return out(); }
    if (/^[^/]*:/.test(dest)) { if (args.includes('--remove-source-files')) { write = true; unknown = true; } return out(); } // remote destination
    write = true; add(dest);
    if (args.includes('--remove-source-files')) unknown = true;
    return out();
  }
  if (SHELLS.test(cmd)) {
    if (args.some((a) => /^-[A-Za-z]*c[A-Za-z]*$/.test(a)) || !nonFlags(args).length) { write = true; unknown = true; } // -c "..." or reads stdin
    else exec = true; // shell script file
    return out();
  }
  if (INTERP.test(cmd)) {
    const i = args.findIndex((a) => a === '-c' || a === '-e' || a === '-p' || a === '--eval' || a === '--print');
    if (i >= 0) { if (SCRIPT_WRITE.test(args[i + 1] || '')) { write = true; unknown = true; } } // inline code: write-pattern check only
    else exec = true; // script file, -m module, or code on stdin
    return out();
  }
  if (PKG_MANAGERS.has(cmd)) { const sub = nonFlags(args)[0]; if (sub && PKG_EXEC_SUBS.has(sub)) exec = true; return out(); }
  if (cmd === 'npx' || cmd === 'make' || cmd === 'pytest' || ((cmd === 'pip' || cmd === 'pip3' || cmd === 'uv' || cmd === 'poetry') && /^(install|uninstall|add|remove|sync|run)$/.test(nonFlags(args)[0] || ''))) { exec = true; return out(); }
  return out();
}

// Command / process substitutions in a raw command line. `$(..)` and backticks are expanded inside
// double quotes too; `<(..)`/`>(..)` only unquoted. Single quotes mask everything.
function substitutions(cmd) {
  const inner = []; let procsub = false; let inDouble = false;
  const closeParen = (from) => {
    let depth = 1;
    for (let j = from; j < cmd.length; j++) {
      const ch = cmd[j];
      if (ch === "'" && !inDouble) { const e = cmd.indexOf("'", j + 1); if (e < 0) return cmd.length; j = e; continue; }
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) return j;
    }
    return cmd.length;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === '\\') { i++; continue; }
    if (c === "'" && !inDouble) { const e = cmd.indexOf("'", i + 1); i = e < 0 ? cmd.length : e; continue; }
    if (c === '"') { inDouble = !inDouble; continue; }
    if (c === '$' && cmd[i + 1] === '(' && cmd[i + 2] !== '(') { const e = closeParen(i + 2); inner.push(cmd.slice(i + 2, e)); i = e; continue; }
    if (c === '`') { const e = cmd.indexOf('`', i + 1); const end = e < 0 ? cmd.length : e; inner.push(cmd.slice(i + 1, end)); i = end; continue; }
    if (!inDouble && (c === '<' || c === '>') && cmd[i + 1] === '(') { procsub = true; const e = closeParen(i + 2); inner.push(cmd.slice(i + 2, e)); i = e; continue; }
  }
  return { inner, procsub };
}

// Codex apply_patch envelope: `*** Add File: p`, `*** Update File: p`, `*** Delete File: p`, `*** Move to: p`.
const PATCH_LINE = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/;
function patchWrites(text, cwd) {
  const paths = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(PATCH_LINE);
    if (m) paths.push(path.resolve(cwd || process.cwd(), m[1]));
  }
  return { write: true, paths, unknown: !paths.length, exec: false };
}

function bashWrites(command, cwd, depth = 0) {
  const raw = String(command || '');
  if (/^\s*apply_patch\b/.test(raw)) return patchWrites(raw, cwd);
  const src = stripHeredocs(raw);
  const segs = parse(src);
  let write = false; let unknown = false; let exec = false; let cwdChange = false; let paths = [];
  for (const s of segs) {
    const r = analyzeSegment(s);
    if (r.cwdChange) cwdChange = true;
    if (r.exec) exec = true;
    if (!r.write) continue;
    write = true; if (r.unknown) unknown = true;
    for (const t of r.targets) paths.push(path.resolve(cwd || process.cwd(), t));
  }
  const sub = substitutions(src);
  if (sub.procsub) { write = true; unknown = true; }
  for (const inner of sub.inner) {
    if (depth > 4) { write = true; unknown = true; break; }
    const r = bashWrites(inner, cwd, depth + 1);
    if (r.exec) exec = true;
    if (!r.write) continue;
    write = true; if (r.unknown) unknown = true; paths.push(...r.paths);
  }
  // After cd/pushd/popd the relative targets no longer resolve against the payload cwd.
  if (cwdChange && (write || exec)) { if (write) unknown = true; paths = []; }
  if (write && !paths.length) unknown = true;
  return { write, paths, unknown, exec };
}

// Patch text from an apply_patch tool_input: a string field (input/patch/command) or a command
// array (["apply_patch", "<patch>"]). null when none is found.
function patchText(inp) {
  if (typeof inp === 'string') return inp;
  if (!inp || typeof inp !== 'object') return null;
  for (const k of ['input', 'patch', 'command']) {
    const v = inp[k];
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.join('\n');
  }
  return null;
}

// Shards MCP tools that execute notebook code (arbitrary side effects, target unknown).
const EXEC_MCP = /(?:^|__)(notebook_exec|notebook_run_all)$/;

function writesOf(n) {
  const tool = n.toolName || ''; const inp = n.toolInput || {};
  if (FILE_TOOLS.has(tool)) {
    const p = inp.file_path || inp.notebook_path || inp.path;
    return p ? { write: true, paths: [path.resolve(n.cwd || process.cwd(), String(p))], unknown: false, exec: false } : { write: true, paths: [], unknown: true, exec: false };
  }
  if (tool === 'apply_patch') {
    const t = patchText(inp);
    return t ? patchWrites(t, n.cwd) : { write: true, paths: [], unknown: true, exec: false };
  }
  if (tool === 'Bash') return bashWrites(inp.command, n.cwd);
  if (EXEC_MCP.test(tool)) return { write: true, paths: [], unknown: true, exec: false };
  return { write: false, paths: [], unknown: false, exec: false };
}

module.exports = { writesOf, bashWrites, patchWrites, FILE_TOOLS };
