#!/usr/bin/env node
'use strict';
// E10.4: `npm pack` check against an explicit allow-list (never publishes).
//   node scripts/pack-check.js                       npm pack --dry-run on the repo root (kind cli)
//   node scripts/pack-check.js --tarball <tgz> [--kind cli|mcp] [--dir <source dir>]
// Checks: (1) every packed file matches ALLOWED, (2) every REQUIRED path is present, (3) every `bin` target is packed,
// (4) the transitive relative-`require` closure of every bin (and of runtime/server.js and hooks/*.js, which the plugin
// and MCP entries launch) is packed. The closure is read from <dir> (default: the repo root), so a bin that starts
// requiring a file the `files` list does not ship fails here, not on a user's machine.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

// Explicit allow-lists. A glob is a path prefix when it ends in `/*`, otherwise an exact path. New shipped top-level
// paths must be added here AND to package.json `files` (see docs/release.md).
const KINDS = {
  cli: {
    allowed: [
      'package.json', 'README.md', 'cli/*', 'build/*', 'core/*', 'hooks/*', 'runtime/*', 'bindings/*',
      'scripts/validate-agents.js', 'src/commands/*', 'src/docs/*',
      'tools/install.js', 'tools/legacy-layout.js', 'tools/shards-ui.js', 'tools/shards-gates.js', 'tools/shards-sessions.js',
    ],
    required: [
      'package.json', 'README.md', 'cli/shards.js', 'cli/commands/gates.js', 'build/compile.js', 'build/activation-inventory.js',
      'build/assets/icon.png', 'core/agents', 'core/templates', 'runtime/server.js', 'hooks/session-start.js', 'hooks/claude-code.hooks.json',
      'bindings/README.md', 'scripts/validate-agents.js', 'src/commands/shards.md', 'src/docs/manifest.json',
      'tools/shards-ui.js', 'tools/shards-gates.js', 'tools/shards-sessions.js', 'tools/install.js', 'tools/legacy-layout.js',
    ],
    // Never in a tarball, even if a broad glob would allow it.
    forbidden: [/(^|\/)node_modules\//, /(^|\/)__tests__\//, /(^|\/)\.claude\//, /(^|\/)\.shards\//, /^adapters\//, /^plugins\//, /^test\//, /\.test\.js$/],
  },
  mcp: {
    allowed: ['package.json', 'runtime/*', 'core/*', 'bindings/*', 'hooks/lib/*', 'build/*', 'scripts/validate-agents.js'],
    required: [
      'package.json', 'runtime/server.js', 'runtime/tools', 'core/agents', 'core/schema', 'hooks/lib/host.js', 'hooks/lib/common.js',
      'build/core.js', 'build/compile.js', 'build/activation-inventory.js', 'scripts/validate-agents.js', 'bindings/README.md',
    ],
    forbidden: [/(^|\/)node_modules\//, /(^|\/)__tests__\//, /\.test\.js$/],
  },
};

const matches = (file, glob) => (glob.endsWith('/*') ? file.startsWith(glob.slice(0, -1)) : file === glob);
const norm = (p) => p.split(path.sep).join('/');

// Literal relative requires: require('./x'), require("../y/z"). Dynamic requires are out of scope.
function relativeRequires(text) {
  const out = [];
  for (const m of text.replace(/^\s*\/\/.*$/gm, '').matchAll(/\brequire\(\s*(['"])(\.{1,2}\/[^'"]*|\.{1,2})\1\s*\)/g)) out.push(m[2]);
  return out;
}

function resolveRequire(fromFile, spec, exists) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  for (const c of [base, `${base}.js`, `${base}.json`, `${base}.cjs`, `${base}/index.js`]) if (exists(c)) return c;
  return null;
}

// Transitive closure of relative requires from entry files, read from dir. Returns { files:Set, unresolved:[{from,spec}] }.
function requireClosure(dir, entries) {
  const isFile = (rel) => { try { return fs.statSync(path.join(dir, rel)).isFile(); } catch (_) { return false; } };
  const files = new Set();
  const unresolved = [];
  const queue = entries.filter(isFile);
  while (queue.length) {
    const f = queue.pop();
    if (files.has(f)) continue;
    files.add(f);
    if (!/\.(c?js)$/.test(f) && !/^#!.*node/.test(fs.readFileSync(path.join(dir, f), 'utf8').slice(0, 40))) continue;
    for (const spec of relativeRequires(fs.readFileSync(path.join(dir, f), 'utf8'))) {
      const r = resolveRequire(f, spec, isFile);
      if (r) queue.push(r); else unresolved.push({ from: f, spec });
    }
  }
  return { files, unresolved };
}

// files: array of package-relative paths in the tarball. Returns { errors: string[], closure: string[] }.
function checkFiles(files, { kind = 'cli', dir = REPO } = {}) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`unknown kind '${kind}'`);
  const errors = [];
  const list = files.map(norm).filter((f) => f && !f.endsWith('/'));
  const set = new Set(list);

  for (const f of list) {
    if (spec.forbidden.some((re) => re.test(f))) errors.push(`forbidden in tarball: ${f}`);
    else if (!spec.allowed.some((g) => matches(f, g))) errors.push(`unexpected (not in allow-list): ${f}`);
  }
  for (const r of spec.required) {
    if (!list.some((f) => f === r || f.startsWith(`${r}/`))) errors.push(`missing required: ${r}`);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const bins = Object.entries(pkg.bin || {});
  for (const [name, target] of bins) {
    if (!set.has(norm(path.normalize(target)))) errors.push(`bin ${name} -> ${target} is not packed`);
  }
  const entries = [
    ...bins.map(([, t]) => norm(path.normalize(t))),
    ...(kind === 'cli' ? ['runtime/server.js'] : []),
    ...(fs.existsSync(path.join(dir, 'hooks')) ? fs.readdirSync(path.join(dir, 'hooks')).filter((f) => f.endsWith('.js')).map((f) => `hooks/${f}`) : []),
  ];
  const { files: closure, unresolved } = requireClosure(dir, entries);
  for (const f of [...closure].sort()) if (!set.has(f)) errors.push(`required at runtime but not packed: ${f}`);
  for (const u of unresolved) errors.push(`unresolvable require in ${u.from}: ${u.spec}`);
  return { errors, closure: [...closure].sort() };
}

function listTarball(tgz) {
  const r = spawnSync('tar', ['-tzf', tgz], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`tar -tzf failed: ${r.stderr}`);
  return r.stdout.split('\n').filter(Boolean).map((l) => l.replace(/^package\//, ''));
}

function listDryRun(dir) {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf8', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`npm pack --dry-run failed: ${r.stderr}`);
  return JSON.parse(r.stdout)[0].files.map((f) => f.path);
}

function main(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] : undefined; };
  const kind = opt('--kind') || 'cli';
  const dir = path.resolve(opt('--dir') || REPO);
  const tgz = opt('--tarball');
  const files = tgz ? listTarball(path.resolve(tgz)) : listDryRun(dir);
  const { errors, closure } = checkFiles(files, { kind, dir });
  if (errors.length) {
    for (const e of errors) console.error(`  ${e}`);
    console.error(`pack-check (${kind}): FAIL (${errors.length} problem(s), ${files.length} files)`);
    return 1;
  }
  console.log(`pack-check (${kind}): OK (${files.length} files; ${closure.length} files in the bin/hook require closure)`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { checkFiles, requireClosure, relativeRequires, KINDS };
