'use strict';
// Conservative write detection for PreToolUse enforcement (E11.6). Best effort, no execution.
// writesOf(n) -> {write:boolean, paths:string[] (absolute), unknown:boolean}
//   write   : the call is (or looks like) a write/exec
//   paths   : target paths we could determine, resolved against cwd
//   unknown : looks like a write but at least one target could not be determined
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
const GIT_WRITES = new Set(['apply', 'checkout', 'commit', 'reset', 'restore', 'clean', 'merge', 'rebase', 'stash', 'cherry-pick', 'pull', 'switch', 'am', 'revert', 'add', 'rm', 'mv']);
const WRAPPERS = new Set(['sudo', 'env', 'command', 'nohup', 'time', 'nice', 'exec', 'xargs']);
const SCRIPT_WRITE = /open\([^)]*['"][wax+]|\.write|writeFile|appendFile|unlink|rmtree|os\.remove|shutil\.|fs\.(rm|mkdir|rename|copy|write|append)|Path\([^)]*\)\.(write|touch|unlink|mkdir)/;

const nonFlags = (a) => a.filter((x) => !x.startsWith('-'));

function analyzeSegment(seg) {
  const targets = []; let unknown = false; let write = false;
  const add = (p) => { if (!p || SKIP_TARGET.test(p)) return; if (/[$`*?]/.test(p)) { unknown = true; return; } targets.push(p); };
  for (const r of seg.redirects) { if (SKIP_TARGET.test(r)) continue; write = true; add(r); }
  let w = seg.words.slice();
  while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || WRAPPERS.has(path.basename(w[0])))) w.shift();
  if (!w.length) return { write, targets, unknown };
  const cmd = path.basename(w[0]); const args = w.slice(1);
  if (cmd === 'tee') { write = true; nonFlags(args).forEach(add); }
  else if (cmd === 'sed' || cmd === 'perl') {
    if (args.some((a) => /^-[A-Za-z]*i/.test(a) || a === '--in-place' || a.startsWith('--in-place='))) {
      write = true; const nf = nonFlags(args);
      if (!nf.length) unknown = true; else nf.slice(args.includes('-e') || args.includes('-f') ? 0 : 1).forEach(add);
      if (nf.length <= 1 && !args.includes('-e')) unknown = unknown || nf.length === 0;
    }
  } else if (cmd === 'cp') {
    write = true; const ti = args.findIndex((a) => a === '-t' || a.startsWith('--target-directory'));
    if (ti >= 0) add(args[ti].includes('=') ? args[ti].split('=')[1] : args[ti + 1]); else { const nf = nonFlags(args); if (nf.length >= 2) add(nf[nf.length - 1]); else unknown = true; }
  } else if (ALL_ARGS.has(cmd)) {
    write = true; const nf = nonFlags(args); if (!nf.length) unknown = true; nf.forEach(add);
  } else if (cmd === 'dd') {
    const of = args.find((a) => a.startsWith('of=')); if (of) { write = true; add(of.slice(3)); }
  } else if (cmd === 'git') {
    const sub = nonFlags(args)[0];
    if (sub && GIT_WRITES.has(sub)) { write = true; if (sub === 'rm' || sub === 'mv') nonFlags(args).slice(1).forEach(add); else unknown = true; }
  } else if (/^(python[0-9.]*|node|nodejs|ruby|perl)$/.test(cmd)) {
    const i = args.findIndex((a) => a === '-c' || a === '-e' || a === '-p');
    if (i >= 0 && SCRIPT_WRITE.test(args[i + 1] || '')) { write = true; unknown = true; }
  }
  return { write, targets, unknown };
}

function bashWrites(command, cwd) {
  const segs = parse(stripHeredocs(String(command || '')));
  let write = false; let unknown = false; const paths = [];
  for (const s of segs) {
    const r = analyzeSegment(s);
    if (!r.write) continue;
    write = true; if (r.unknown) unknown = true;
    for (const t of r.targets) paths.push(path.resolve(cwd || process.cwd(), t));
  }
  if (write && !paths.length) unknown = true;
  return { write, paths, unknown };
}

function writesOf(n) {
  const tool = n.toolName || ''; const inp = n.toolInput || {};
  if (FILE_TOOLS.has(tool)) {
    const p = inp.file_path || inp.notebook_path || inp.path;
    return p ? { write: true, paths: [path.resolve(n.cwd || process.cwd(), String(p))], unknown: false } : { write: true, paths: [], unknown: true };
  }
  if (tool === 'Bash') return bashWrites(inp.command, n.cwd);
  return { write: false, paths: [], unknown: false };
}

module.exports = { writesOf, bashWrites, FILE_TOOLS };
