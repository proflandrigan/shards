import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const inst = require('../cli/commands/install.js');

let root;
const file = () => path.join(root, 'AGENTS.md');
const read = () => fs.readFileSync(file(), 'utf8');
const run = (...a) => inst.run(['--agents-md', '--root', root, ...a]);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-agents-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('--agents-md', () => {
  it('creates AGENTS.md with the marked fragment', () => {
    expect(run()).toBe(0);
    const t = read();
    expect(t.startsWith('# Project\n\n')).toBe(true);
    expect(t).toContain(inst.AGENTS_BEGIN);
    expect(t).toContain(inst.AGENTS_END);
    expect(t).toMatch(/max_depth/);
    expect(t).toMatch(/gate_advance/);
    expect(t).toMatch(/shards-<agent>/);
  });
  it('appends to existing content and is idempotent', () => {
    fs.writeFileSync(file(), '# Mine\n\nhello\n');
    run();
    const once = read();
    expect(once.startsWith('# Mine\n\nhello\n\n')).toBe(true);
    run();
    expect(read()).toBe(once);
    expect(once.split(inst.AGENTS_BEGIN).length).toBe(2);
  });
  it('replaces a stale block in place', () => {
    fs.writeFileSync(file(), `before\n\n<!-- shards:begin agents-md v0 -->\nold\n${inst.AGENTS_END}\nafter\n`);
    run();
    const t = read();
    expect(t).not.toContain('old\n');
    expect(t).toContain(inst.AGENTS_BEGIN);
    expect(t.startsWith('before\n\n')).toBe(true);
    expect(t.endsWith('after\n')).toBe(true);
  });
  it('--remove round-trips to the original text', () => {
    const orig = '# Mine\n\nhello\n';
    fs.writeFileSync(file(), orig);
    run();
    expect(run('--remove')).toBe(0);
    expect(read()).toBe(orig);
  });
  it('--remove deletes a file this command created; no-op when absent', () => {
    run();
    run('--remove');
    expect(fs.existsSync(file())).toBe(false);
    expect(run('--remove')).toBe(0);
  });
  it('--dry-run writes nothing', () => {
    run('--dry-run');
    expect(fs.existsSync(file())).toBe(false);
  });
  it('does not touch CLAUDE.md', () => {
    run();
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(false);
  });
  it('requires a mode flag', () => {
    expect(inst.run(['--root', root])).toBe(2);
  });
});
