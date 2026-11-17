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
  it('prints a warning pointing at v-legacy and shards build --dev', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-'));
    const r = execFileSync('node', [path.join(root, 'tools/install.js')], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    // warning goes to stderr; capture via a second run with 2>&1
    const both = spawnSync('node', [path.join(root, 'tools/install.js')], { cwd: dir, encoding: 'utf8' }).stderr;
    expect(both).toContain('DEPRECATED');
    expect(both).toContain('git checkout v-legacy');
    expect(both).toContain('shards build --dev');
    expect(r).toContain('Installing');
  });
});
