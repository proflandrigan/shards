import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const inst = require('../cli/commands/install.js');
const P = require('../cli/commands/install-project.js');

let root;
const quiet = () => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); };
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const snapshot = () => walk(root).map((f) => path.relative(root, f)).sort();

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-proj-')); quiet(); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('shards install --project (E9.1)', () => {
  it('plans skills for both hosts plus rewritten content paths', () => {
    const plan = P.planFiles();
    expect(plan.has('.claude/skills/syn/SKILL.md')).toBe(true);
    expect(plan.has('.agents/skills/syn/SKILL.md')).toBe(true);
    expect(plan.get('.claude/skills/syn/SKILL.md').equals(plan.get('.agents/skills/syn/SKILL.md'))).toBe(true);
    const text = plan.get('.agents/skills/syn/SKILL.md').toString();
    expect(text).toContain('.shards/content/agents/syn/AGENT.md');
    expect(text).not.toMatch(/(^|[^./\w-])content\/agents/);
    expect(plan.has('.shards/content/agents/syn/AGENT.md')).toBe(true);
  });

  it('installs, is idempotent, and --remove restores a pre-existing tree exactly', () => {
    fs.mkdirSync(path.join(root, '.claude', 'skills', 'mine'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude', 'skills', 'mine', 'SKILL.md'), 'user skill');
    fs.writeFileSync(path.join(root, 'README.md'), 'hi');
    const before = snapshot();
    expect(inst.run(['--project', '--root', root])).toBe(0);
    expect(fs.existsSync(path.join(root, '.claude/skills/syn/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(root, '.agents/skills/data-analyst/SKILL.md'))).toBe(true);
    const man = JSON.parse(fs.readFileSync(path.join(root, P.MANIFEST), 'utf8'));
    expect(man.files.length).toBeGreaterThan(100);
    const after = snapshot();
    expect(inst.run(['--project', '--root', root])).toBe(0); // idempotent
    expect(snapshot()).toEqual(after);
    expect(inst.run(['--project', '--root', root, '--remove'])).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(fs.existsSync(path.join(root, '.agents'))).toBe(false);
  });

  it('never overwrites a user file and keeps edited files on remove', () => {
    const mine = path.join(root, '.claude', 'skills', 'syn', 'SKILL.md');
    fs.mkdirSync(path.dirname(mine), { recursive: true });
    fs.writeFileSync(mine, 'user-owned syn skill');
    expect(inst.run(['--project', '--root', root])).toBe(0);
    expect(fs.readFileSync(mine, 'utf8')).toBe('user-owned syn skill');
    const edited = path.join(root, '.agents', 'skills', 'end', 'SKILL.md');
    fs.appendFileSync(edited, '\nlocal edit\n');
    expect(inst.run(['--project', '--root', root, '--remove'])).toBe(0);
    expect(fs.readFileSync(mine, 'utf8')).toBe('user-owned syn skill');
    expect(fs.existsSync(edited)).toBe(true);
    expect(fs.existsSync(path.join(root, '.claude/skills/agents/SKILL.md'))).toBe(false);
  });

  it('--dry-run writes nothing', () => {
    expect(inst.run(['--project', '--root', root, '--dry-run'])).toBe(0);
    expect(snapshot()).toEqual([]);
  });

  it('--project --permissions adds the preset, and --remove removes both exactly', () => {
    expect(inst.run(['--project', '--permissions', '--root', root])).toBe(0);
    const s = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
    expect(s.permissions.allow.length).toBeGreaterThan(20);
    expect(inst.run(['--project', '--permissions', '--root', root, '--remove'])).toBe(0);
    expect(snapshot()).toEqual([]);
  });

  it('refuses the shards source repo without --force', () => {
    expect(inst.run(['--project', '--root', path.resolve(__dirname, '..')])).toBe(1);
  });
});
