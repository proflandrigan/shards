#!/usr/bin/env node
'use strict';
// Stage the @proflandrigan/shards-mcp package into a directory (default: a fresh dir under os.tmpdir()).
// Layout preserves the repo-relative structure so runtime's `../core`, `../bindings`, `../hooks/lib`
// and `../package.json` (VERSION) requires resolve unchanged:
//   <out>/package.json   generated: name shards-mcp, same version/deps as root, bin -> runtime/server.js
//   <out>/runtime/ core/ bindings/ hooks/lib/ build/ scripts/validate-agents.js  (build/ is used by the load_phase tool and carries activation-inventory.js; runtime/build must never require scripts/)
// Usage: node scripts/stage-runtime-package.js [--out dir]   (prints the staged dir on stdout)
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const root = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function stage(out) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const d of ['runtime', 'core', 'bindings', 'hooks/lib', 'build']) {
    fs.cpSync(path.join(ROOT, d), path.join(out, d), { recursive: true });
  }
  fs.mkdirSync(path.join(out, 'scripts'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'scripts', 'validate-agents.js'), path.join(out, 'scripts', 'validate-agents.js'));
  const pkg = {
    name: '@proflandrigan/shards-mcp',
    version: root.version,
    description: 'Shards MCP runtime (gates, sessions, agent loading) for Claude Code and Codex',
    license: root.license,
    author: root.author,
    bin: { 'shards-mcp': 'runtime/server.js' },
    files: ['runtime/', 'core/', 'bindings/', 'hooks/lib/', 'build/', 'scripts/validate-agents.js'],
    dependencies: root.dependencies,
    engines: { node: '>=18' },
    publishConfig: { access: 'public', tag: 'next' },
  };
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  fs.chmodSync(path.join(out, 'runtime', 'server.js'), 0o755);
  return out;
}

if (require.main === module) {
  const i = process.argv.indexOf('--out');
  const out = i > -1 ? path.resolve(process.argv[i + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'shards-mcp-stage-'));
  console.log(stage(out));
}
module.exports = { stage };
