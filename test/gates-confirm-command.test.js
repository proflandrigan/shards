import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const cc = require('../runtime/gates/confirm-command.js');
const pkg = require('../package.json');
// Same quoting rule as runtime/gates/confirm-command.js (Windows paths contain backslashes).
const q = (s) => (/[\s"'$`\\]/.test(s) ? JSON.stringify(s) : s);

describe('operator confirm command', () => {
  it('npx spec matches package.json name and publish tag', () => {
    expect(cc.NPM_SPEC).toBe(`${pkg.name}@${pkg.publishConfig.tag}`);
    expect(cc.confirmCommand('g1', 'k')).toBe(`npx ${pkg.name}@next gates confirm g1 --session k`);
    expect(cc.confirmCommand('g1', 'k', { changes: true })).toBe(`npx ${pkg.name}@next gates confirm g1 --session k --changes "<note>"`);
  });

  it('installed runtime (no sibling cli/) prints only the npx form', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
    const runtimeDir = path.join(d, 'runtime');
    fs.mkdirSync(runtimeDir);
    expect(cc.localConfirmCommand('g', 'k', { runtimeDir })).toBeNull();
    const lines = cc.operatorConfirmLines('g', 'k', { runtimeDir }).join('\n');
    expect(lines).toContain('npx @proflandrigan/shards@next gates confirm g --session k');
    expect(lines).not.toContain('node ');
    expect(lines).not.toContain('cli/shards.js');
  });

  it('repo checkout also prints the local node form with an absolute path', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-'));
    fs.mkdirSync(path.join(d, 'runtime'));
    fs.mkdirSync(path.join(d, 'cli'));
    fs.writeFileSync(path.join(d, 'cli', 'shards.js'), '');
    const runtimeDir = path.join(d, 'runtime');
    expect(cc.localConfirmCommand('g', 'k', { runtimeDir })).toBe(`node ${q(path.join(d, 'cli', 'shards.js'))} gates confirm g --session k`);
    const lines = cc.operatorConfirmLines('g', 'k', { runtimeDir });
    expect(lines[0]).toContain('npx @proflandrigan/shards@next');
    expect(lines.join('\n')).toContain(`${path.join(d, 'cli', 'shards.js')} gates confirm g --session k --changes`);
  });

  it('no runtime message still prints node cli/shards.js', () => {
    const files = ['gates/tier1.js', 'gates/machine.js', 'tools/load_phase.js'].map((f) => path.join(__dirname, '..', 'runtime', f));
    for (const f of files) expect(fs.readFileSync(f, 'utf8')).not.toContain('node cli/shards.js gates confirm');
  });
});
