import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const inst = require('../cli/commands/install.js');
const { conventionsBody, conventionsSkill } = require('../build/conventions.js');

let root;
const file = () => path.join(root, 'CLAUDE.md');
const read = () => fs.readFileSync(file(), 'utf8');
const run = (...a) => inst.run(['--claude-md', '--root', root, ...a]);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-md-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('conventions source', () => {
  it('body is v2: gate tools, no fences', () => {
    const b = conventionsBody();
    expect(b).toMatch(/gate_request/);
    expect(b).toMatch(/gate_advance/);
    expect(b).toMatch(/no `::GATE::` fences/);
    expect(b).not.toMatch(/paced by/);
  });
  it('skill has frontmatter and the body', () => {
    const s = conventionsSkill();
    expect(s.startsWith('---\nname: shards-conventions\ndescription: ')).toBe(true);
    expect(s).toContain(conventionsBody());
  });
});

describe('--claude-md', () => {
  it('creates CLAUDE.md with header and marked block', () => {
    expect(run()).toBe(0);
    const t = read();
    expect(t.startsWith('# Project\n\n<!-- shards:begin conventions v1 -->\n')).toBe(true);
    expect(t).toContain('<!-- shards:end conventions -->');
    expect(t).toContain(conventionsBody());
  });

  it('appends to an existing file, leaving content outside markers untouched', () => {
    const user = '# Mine\n\nSome rules.\n';
    fs.writeFileSync(file(), user);
    run();
    expect(read().startsWith(user + '\n<!-- shards:begin')).toBe(true);
  });

  it('is idempotent and replaces the block in place', () => {
    const user = '# Mine\n\nA\n';
    fs.writeFileSync(file(), user);
    run();
    const once = read();
    run();
    expect(read()).toBe(once);
    // stale block content + trailing user content
    const stale = once.replace(conventionsBody(), 'OLD TEXT\n') + '\n## After\nkeep me\n';
    fs.writeFileSync(file(), stale);
    run();
    const t = read();
    expect(t).not.toContain('OLD TEXT');
    expect(t).toContain(conventionsBody());
    expect(t.endsWith('\n## After\nkeep me\n')).toBe(true);
    expect(t.match(/shards:begin/g)).toHaveLength(1);
  });

  it('--remove deletes exactly the block and restores user content', () => {
    const user = '# Mine\n\nSome rules.\n';
    fs.writeFileSync(file(), user);
    run();
    expect(run('--remove')).toBe(0);
    expect(read()).toBe(user);
  });

  it('--remove deletes a file we created', () => {
    run();
    run('--remove');
    expect(fs.existsSync(file())).toBe(false);
  });

  it('--remove with no block is a no-op', () => {
    fs.writeFileSync(file(), '# Mine\n');
    expect(run('--remove')).toBe(0);
    expect(read()).toBe('# Mine\n');
  });

  it('--dry-run writes nothing', () => {
    run('--dry-run');
    expect(fs.existsSync(file())).toBe(false);
    fs.writeFileSync(file(), '# Mine\n');
    run('--dry-run');
    expect(read()).toBe('# Mine\n');
    run();
    const withBlock = read();
    run('--remove', '--dry-run');
    expect(read()).toBe(withBlock);
  });

  it('refuses the shards source repo unless --force', () => {
    fs.mkdirSync(path.join(root, 'core', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(root, 'cli'), { recursive: true });
    fs.writeFileSync(path.join(root, 'cli', 'shards.js'), '');
    expect(run()).toBe(1);
    expect(fs.existsSync(file())).toBe(false);
    expect(run('--force')).toBe(0);
    expect(fs.existsSync(file())).toBe(true);
  });

  it('requires a mode flag', () => {
    expect(inst.run(['--root', root])).toBe(2);
  });
});
