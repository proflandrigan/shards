import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { checkFiles, relativeRequires, requireClosure } = require('../scripts/pack-check.js');
const { stage } = require('../scripts/stage-runtime-package.js');
const root = path.resolve(__dirname, '..');
const SCRIPT = path.join(root, 'scripts', 'pack-check.js');
let cached;
const dryRunFiles = () => (cached ||= JSON.parse(spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }).stdout)[0].files.map((f) => f.path));

describe('pack-check (E10.4)', { timeout: 120000 }, () => {
  it('the real root tarball passes: allow-list, required paths, every bin and its require closure', () => {
    const r = checkFiles(dryRunFiles(), { kind: 'cli' });
    expect(r.errors).toEqual([]);
    for (const f of ['tools/shards-ui.js', 'tools/shards-gates.js', 'tools/shards-sessions.js', 'cli/shards.js', 'cli/commands/sessions.js', 'runtime/sessions/ops.js']) expect(r.closure).toContain(f);
  });

  it('the staged MCP package passes the mcp allow-list and closure', () => {
    const dir = stage(fs.mkdtempSync(path.join(os.tmpdir(), 'pack-check-mcp-')) + '/s');
    const files = JSON.parse(spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: dir, encoding: 'utf8' }).stdout)[0].files.map((f) => f.path);
    expect(checkFiles(files, { kind: 'mcp', dir }).errors).toEqual([]);
  });

  it('CLI exits 0 on the repo and 1 on a bad tarball listing', () => {
    expect(spawnSync('node', [SCRIPT], { cwd: root, encoding: 'utf8' }).status).toBe(0);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-check-tgz-'));
    fs.mkdirSync(path.join(tmp, 'package', 'test'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package', 'test', 'x.test.js'), '');
    fs.writeFileSync(path.join(tmp, 'package', 'package.json'), '{}');
    const tgz = path.join(tmp, 'bad.tgz');
    expect(spawnSync('tar', ['-czf', tgz, '-C', tmp, 'package']).status).toBe(0);
    const r = spawnSync('node', [SCRIPT, '--tarball', tgz], { cwd: root, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('forbidden in tarball: test/x.test.js');
    expect(r.stderr).toContain('missing required: cli/shards.js');
  });

  it('flags files outside the allow-list and forbidden files', () => {
    const ok = dryRunFiles();
    const r = checkFiles([...ok, 'scripts/release-dry-run.sh', 'core/agents/x.test.js', 'src/ui/server.js', 'notes/todo.md'], { kind: 'cli' });
    expect(r.errors).toEqual(expect.arrayContaining([
      'unexpected (not in allow-list): scripts/release-dry-run.sh',
      'forbidden in tarball: core/agents/x.test.js',
      'unexpected (not in allow-list): src/ui/server.js',
      'unexpected (not in allow-list): notes/todo.md',
    ]));
  });

  it('flags a missing required path and a bin target that is not packed', () => {
    const ok = dryRunFiles().filter((f) => f !== 'tools/shards-ui.js' && !f.startsWith('src/docs/'));
    const r = checkFiles(ok, { kind: 'cli' });
    expect(r.errors).toContain('missing required: src/docs/manifest.json');
    expect(r.errors).toContain('bin shards-ui -> tools/shards-ui.js is not packed');
  });

  it('catches a bin that requires a file the tarball does not ship (the v1 shards-ui regression)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-check-fake-'));
    fs.mkdirSync(path.join(dir, 'tools'));
    fs.mkdirSync(path.join(dir, 'src', 'ui'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ bin: { 'shards-ui': 'tools/shards-ui.js' } }));
    fs.writeFileSync(path.join(dir, 'tools', 'shards-ui.js'), "#!/usr/bin/env node\nrequire('../src/ui/server.js');\nrequire('../src/ui/missing');\n");
    fs.writeFileSync(path.join(dir, 'src', 'ui', 'server.js'), "require('./relay');\n");
    fs.writeFileSync(path.join(dir, 'src', 'ui', 'relay.js'), '');
    const r = checkFiles(['package.json', 'tools/shards-ui.js'], { kind: 'cli', dir });
    expect(r.errors).toContain('required at runtime but not packed: src/ui/server.js');
    expect(r.errors).toContain('required at runtime but not packed: src/ui/relay.js');
    expect(r.errors).toContain('unresolvable require in tools/shards-ui.js: ../src/ui/missing');
  });

  it('relativeRequires ignores comments, package requires and dynamic requires', () => {
    expect(relativeRequires("// require('./a')\nconst x = require('./b');\nrequire(\"../c/d\");\nrequire('fs'); require(name);")).toEqual(['./b', '../c/d']);
    expect(requireClosure(root, ['tools/shards-ui.js']).files.has('tools/shards-ui.js')).toBe(true);
  });

  it('package.json `files` ships no UI sources and exposes a pack:check script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.files).not.toContain('src/');
    expect(pkg.scripts['pack:check']).toBe('node scripts/pack-check.js');
  });
});
