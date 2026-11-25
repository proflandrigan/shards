'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const dirs = [];
function sh(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
}
function tmp(prefix = 'shards-gitb-') {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  dirs.push(d);
  return d;
}
function makeRepo({ sub } = {}) {
  const top = tmp();
  sh(top, 'init', '-q', '-b', 'main');
  sh(top, 'config', 'user.name', 'Test');
  sh(top, 'config', 'user.email', 't@example.com');
  sh(top, 'config', 'commit.gpgsign', 'false');
  sh(top, 'config', 'core.autocrlf', 'false'); // Windows runners default to true
  fs.writeFileSync(path.join(top, 'README.md'), 'hi\n');
  sh(top, 'add', 'README.md');
  sh(top, 'commit', '-q', '-m', 'init');
  const root = sub ? path.join(top, sub) : top;
  fs.mkdirSync(root, { recursive: true });
  return { top, root };
}
function write(root, rel, text) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
}
function hook(top, name, body) {
  const p = path.join(top, '.git', 'hooks', name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(p, 0o755);
}
function cleanup() {
  while (dirs.length) { try { fs.rmSync(dirs.pop(), { recursive: true, force: true }); } catch (_) { /* ignore */ } }
}
const CFG = { commit: true, push: false, denylist: { globs: ['*.parquet'], max_file_size_bytes: 1000 } };

module.exports = { sh, tmp, makeRepo, write, hook, cleanup, CFG };
