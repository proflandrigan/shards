import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const inst = require('../cli/commands/install.js');
const { runChecks, ruleCoversGateTools } = require('../cli/commands/doctor.js');

let root; let home; let empty;
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'inst-perm-'));
const sFile = () => path.join(root, '.claude', 'settings.json');
const sidecar = () => path.join(root, '.claude', '.shards-permissions.json');
const readS = () => JSON.parse(fs.readFileSync(sFile(), 'utf8'));
const writeS = (o) => { fs.mkdirSync(path.dirname(sFile()), { recursive: true }); fs.writeFileSync(sFile(), JSON.stringify(o, null, 2)); };
const gateCheck = async () => (await runChecks({ root, home, repoRoot: empty })).find((c) => c.id === 'permissions.gate-tools');
const preset = () => inst.loadPreset();
const quiet = () => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); };

beforeEach(() => { root = mk(); home = mk(); empty = mk(); });
afterEach(() => { vi.restoreAllMocks(); for (const d of [root, home, empty]) fs.rmSync(d, { recursive: true, force: true }); });

describe('preset', () => {
  it('never allows gate tools or broad shards wildcards', () => {
    const p = preset();
    for (const r of p.allow) {
      expect(ruleCoversGateTools(r), r).toBe(false);
      expect(r).not.toMatch(/mcp__.*shards/);
      expect(r).not.toMatch(/gate_/);
    }
    expect(p.ask).toContain('mcp__plugin_shards_shards__gate_advance');
    expect(p.ask).toContain('mcp__plugin_shards_shards__gate_force_close');
    expect(p.allow.length).toBeGreaterThan(20);
    expect(p.deny).toContain('Bash(git push --force)');
  });
  it('passes shards doctor after merge', async () => {
    quiet();
    expect(inst.run(['--permissions', '--root', root])).toBe(0);
    expect((await gateCheck()).status).toBe('PASS');
  });
});

describe('doctor rejects gate allow rules', () => {
  for (const rule of ['mcp__plugin_shards_shards__gate_advance', 'mcp__plugin_shards_shards__*', 'mcp__*', 'mcp__plugin_shards_shards__gate_force_close']) {
    it(`FAIL for ${rule}`, async () => {
      writeS({ permissions: { allow: [rule] } });
      expect((await gateCheck()).status).toBe('FAIL');
    });
  }
});

describe('merge', () => {
  it('creates settings.json when missing and records additions', () => {
    quiet();
    expect(inst.run(['--permissions', '--root', root])).toBe(0);
    const s = readS();
    expect(s.permissions.allow).toEqual(preset().allow);
    expect(s.permissions.ask).toEqual(preset().ask);
    expect(Object.keys(s)).toEqual(['permissions']);
    expect(JSON.parse(fs.readFileSync(sidecar(), 'utf8')).added.allow).toEqual(preset().allow);
  });

  it('preserves user rules and order, appends only new, skips canonical duplicates', () => {
    quiet();
    const user = { theme: 'dark', permissions: { allow: ['Bash(foo:*)', 'Bash(git log *)', 'Read(x)'], deny: ['Bash(rm -rf /)'], defaultMode: 'acceptEdits' }, env: { A: '1' } };
    writeS(user);
    const r = inst.mergePermissions(root, preset());
    const s = readS();
    expect(s.theme).toBe('dark');
    expect(s.env).toEqual({ A: '1' });
    expect(s.permissions.defaultMode).toBe('acceptEdits');
    expect(s.permissions.allow.slice(0, 3)).toEqual(user.permissions.allow);
    expect(s.permissions.allow.filter((x) => x === 'Bash(git log:*)')).toHaveLength(0); // canonical dup of user's `git log *`
    expect(r.added.allow).not.toContain('Bash(git log:*)');
    expect(s.permissions.deny[0]).toBe('Bash(rm -rf /)');
  });

  it('is idempotent', () => {
    quiet();
    inst.mergePermissions(root, preset());
    const before = fs.readFileSync(sFile(), 'utf8');
    const side = fs.readFileSync(sidecar(), 'utf8');
    const r = inst.mergePermissions(root, preset());
    expect(r.changed).toBe(false);
    expect(fs.readFileSync(sFile(), 'utf8')).toBe(before);
    expect(fs.readFileSync(sidecar(), 'utf8')).toBe(side);
  });

  it('refuses a fragment that allows gate tools', () => {
    const errs = [];
    vi.spyOn(console, 'error').mockImplementation((m) => errs.push(m));
    const f = path.join(root, 'bad.json');
    fs.writeFileSync(f, JSON.stringify({ allow: ['Bash(ls:*)', 'mcp__plugin_shards_shards__*'] }));
    expect(inst.run(['--permissions', '--root', root, '--preset', f])).toBe(1);
    expect(errs.join('\n')).toMatch(/gate tools/);
    expect(fs.existsSync(sFile())).toBe(false);
    expect(() => inst.mergePermissions(root, { allow: ['mcp__*'] })).toThrow(/gate tools/);
  });

  it('--dry-run writes nothing', () => {
    quiet();
    expect(inst.run(['--permissions', '--root', root, '--dry-run'])).toBe(0);
    expect(fs.existsSync(path.join(root, '.claude'))).toBe(false);
  });

  it('refuses the shards source repo unless --force', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fs.mkdirSync(path.join(root, 'core', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(root, 'cli'), { recursive: true });
    fs.writeFileSync(path.join(root, 'cli', 'shards.js'), '');
    expect(inst.run(['--permissions', '--root', root])).toBe(1);
    expect(fs.existsSync(sFile())).toBe(false);
    expect(inst.run(['--permissions', '--root', root, '--force'])).toBe(0);
    expect(fs.existsSync(sFile())).toBe(true);
  });
});

describe('remove (exact unmerge)', () => {
  it('restores a pre-existing file semantically and keeps user rules', () => {
    quiet();
    const user = { permissions: { allow: ['Bash(foo:*)', 'Bash(git log *)'], ask: ['Bash(x)'] }, other: [1, 2] };
    writeS(user);
    inst.run(['--permissions', '--root', root]);
    expect(readS()).not.toEqual(user);
    expect(inst.run(['--permissions', '--root', root, '--remove'])).toBe(0);
    expect(readS()).toEqual(user);
    expect(fs.existsSync(sidecar())).toBe(false);
  });

  it('removes the file it created and containers it created', () => {
    quiet();
    inst.run(['--permissions', '--root', root]);
    inst.run(['--permissions', '--root', root, '--remove']);
    expect(fs.existsSync(sFile())).toBe(false);
    // existing file without permissions key: key removed again
    writeS({ theme: 'x' });
    inst.run(['--permissions', '--root', root]);
    inst.run(['--permissions', '--root', root, '--remove']);
    expect(readS()).toEqual({ theme: 'x' });
  });

  it('leaves rules the user added after install, and does not remove pre-existing identical rules', () => {
    quiet();
    writeS({ permissions: { allow: ['Bash(jq:*)'] } });
    inst.run(['--permissions', '--root', root]);
    const s = readS(); s.permissions.allow.push('Bash(mine:*)'); writeS(s);
    inst.run(['--permissions', '--root', root, '--remove']);
    expect(readS().permissions.allow).toEqual(['Bash(jq:*)', 'Bash(mine:*)']);
  });

  it('--remove --dry-run changes nothing; remove without record is a no-op', () => {
    quiet();
    expect(inst.run(['--permissions', '--root', root, '--remove'])).toBe(0);
    inst.run(['--permissions', '--root', root]);
    const before = fs.readFileSync(sFile(), 'utf8');
    inst.run(['--permissions', '--root', root, '--remove', '--dry-run']);
    expect(fs.readFileSync(sFile(), 'utf8')).toBe(before);
    expect(fs.existsSync(sidecar())).toBe(true);
  });
});

describe('cli registration', () => {
  it('shards install is a registered command and in usage', () => {
    const { COMMANDS } = require('../cli/shards.js');
    expect(COMMANDS.install).toBeTruthy();
  });
});
