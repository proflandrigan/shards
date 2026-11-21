import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { run } = require('../cli/commands/sessions');
const { main } = require('../cli/shards');
const index = require('../runtime/sessions/index.js');

let root; let logs; let errs;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scli-'));
  logs = []; errs = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => errs.push(a.join(' ')));
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const add = (id) => index.appendSession(path.join(root, '.shards', 'sessions'), { sessionId: id, agent: 'syn', projectName: 'p' });

describe('shards sessions CLI', () => {
  it('is registered in the dispatcher and lists empty root', async () => {
    expect(await main(['sessions', 'list', '--root', root])).toBe(0);
    expect(logs.join('\n')).toMatch(/no sessions/);
  });
  it('list --json / --status', async () => {
    add('aaaa1111'); add('bbbb2222');
    index.markEnded(path.join(root, '.shards', 'sessions'), 'aaaa1111', {});
    expect(await run(['list', '--root', root, '--json', '--status', 'ended'])).toBe(0);
    expect(JSON.parse(logs.join('\n')).map((r) => r.sessionId)).toEqual(['aaaa1111']);
  });
  it('show and resume by prefix', async () => {
    add('abcd1234');
    expect(await run(['show', 'abcd', '--root', root])).toBe(0);
    expect(logs.join('\n')).toContain('abcd1234');
    logs.length = 0;
    expect(await run(['resume', 'abcd', '--root', root])).toBe(0);
    expect(logs.join('\n')).toContain('claude --resume abcd1234');
  });
  it('unknown / ambiguous ids exit 1', async () => {
    add('abcd1'); add('abcd2');
    expect(await run(['show', 'zz', '--root', root])).toBe(1);
    expect(await run(['resume', 'abcd', '--root', root])).toBe(1);
    expect(errs.join('\n')).toMatch(/Ambiguous/);
  });
  it('end marks active session ended', async () => {
    add('abcd1234');
    expect(await run(['end', 'abcd', '--root', root])).toBe(0);
    expect(index.getEntry(path.join(root, '.shards', 'sessions'), 'abcd1234').status).toBe('ended');
  });
  it('end with no sessions exits 1; bad usage exits 2', async () => {
    expect(await run(['end', '--root', root])).toBe(1);
    expect(await run(['bogus', '--root', root])).toBe(2);
    expect(await run(['list', '--nope'])).toBe(2);
  });
});
