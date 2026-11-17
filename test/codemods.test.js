import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const run = (script, args = [], cwd = root) => execFileSync('node', [path.join(root, script), ...args], { cwd, encoding: 'utf8' });

describe('E1 stage 3 codemods are idempotent on the converted core/', () => {
  it('e1-4 finds nothing left to convert', () => {
    const out = run('scripts/codemods/e1-4-subagent-macros.js');
    expect(out).toContain('converted 0 blocks');
    expect(out).not.toContain('UNRESOLVED');
  });
  it('e1-5 finds nothing left to rewrite', () => {
    const out = run('scripts/codemods/e1-5-claude-paths.js');
    expect(out).toContain('{"protocol":0,"phase":0,"link":0,"plain":0}');
    expect(out).not.toContain('EXCEPTIONS');
  });
});

describe('legacy installer deprecation', () => {
  const installer = path.join(root, 'tools/install.js');
  const optIn = { ...process.env, SHARDS_LEGACY_INSTALL: '1' };
  it('refuses by default: prints the v2 replacements, exits 1 and writes nothing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-'));
    const r = spawnSync('node', [installer], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('DEPRECATED');
    expect(r.stderr).toContain('shards build --target claude --dev');
    expect(r.stderr).toContain('shards install --project');
    expect(r.stderr).toContain('/plugin install shards@shards');
    expect(fs.readdirSync(dir)).toEqual([]);
  });
  it('with --legacy (or SHARDS_LEGACY_INSTALL=1) still warns pointing at v-legacy and shards build --dev, then installs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-'));
    const r = spawnSync('node', [installer, '--legacy'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('DEPRECATED');
    expect(r.stderr).toContain('git checkout v-legacy');
    expect(r.stderr).toContain('shards build --dev');
    expect(r.stdout).toContain('Installing');
    const d2 = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-'));
    expect(spawnSync('node', [installer], { cwd: d2, encoding: 'utf8', env: optIn }).status).toBe(0);
  });
});
