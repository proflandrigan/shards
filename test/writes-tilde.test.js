import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { writesOf } = require('../hooks/lib/writes.js');
const bash = (command) => writesOf({ toolName: 'Bash', toolInput: { command }, cwd: '/r' });

describe('writesOf tilde expansion', () => {
  it('expands ~/f to the home directory', () => {
    const r = bash('touch ~/f');
    expect(r.write).toBe(true);
    expect(r.paths).toEqual([path.join(os.homedir(), 'f')]);
  });
  it('expands a bare ~', () => {
    expect(bash('mkdir ~').paths).toEqual([os.homedir()]);
  });
  it('expands a ~/ redirect target', () => {
    expect(bash('echo x > ~/out.txt').paths).toEqual([path.join(os.homedir(), 'out.txt')]);
  });
  it('treats ~user as unknown, not a path under cwd', () => {
    const r = bash('touch ~root/f');
    expect(r.unknown).toBe(true);
    expect(r.paths).not.toContain(path.resolve('/r', '~root/f'));
  });
  it('still resolves ordinary relative paths against cwd', () => {
    expect(bash('touch a/f').paths).toEqual([path.resolve('/r', 'a/f')]);
  });
});
