import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { EVENT_TYPES, emitEvent, validateEvent } = require('../runtime/lib/events.js');
const schema = require('../core/schema/event.schema.json');

const serverJs = path.join(__dirname, '..', 'runtime', 'server.js');
const HDR = /^\[shards v\d+ \| agent=\S+ ph=\S+ gate=\S+ q=\d+\]$/;
const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
const check = ajv.compile(schema);

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-evt-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const mkctx = (root = dir) => ({
  root, sessionKey: 's1',
  state: { read: () => ({ frames: [{ agent: 'data-analyst' }] }) },
});
const evFile = () => path.join(dir, '.shards', 'events.jsonl');
const lines = () => (fs.existsSync(evFile()) ? fs.readFileSync(evFile(), 'utf8').split('\n').filter(Boolean) : []);

describe('emitEvent', () => {
  it('appends a valid event with relative POSIX path', async () => {
    const evt = await emitEvent(mkctx(), { type: 'chart', path: 'analysis\\x\\c.json'.replace(/\\/g, path.sep), meta: { title: 't', a: 1 } });
    const ls = lines();
    expect(ls).toHaveLength(1);
    const parsed = JSON.parse(ls[0]);
    expect(check(parsed)).toBe(true);
    expect(parsed.v).toBe(1);
    expect(parsed.path).toBe('analysis/x/c.json');
    expect(parsed.agent).toBe('data-analyst');
    expect(parsed.session).toBe('s1');
    expect(evt).toEqual(parsed);
    expect(validateEvent(parsed).valid).toBe(true);
  });

  it('rejects bad type, appends nothing', async () => {
    await expect(emitEvent(mkctx(), { type: 'bogus', path: 'a.csv' })).rejects.toThrow();
    expect(lines()).toHaveLength(0);
  });

  it('rejects traversal, outside-absolute, NUL; accepts absolute inside root', async () => {
    for (const p of ['../escape.csv', '/etc/passwd', 'a/../../x', 'a\0b.csv']) {
      await expect(emitEvent(mkctx(), { type: 'data-viewer', path: p })).rejects.toThrow();
    }
    expect(lines()).toHaveLength(0);
    const evt = await emitEvent(mkctx(), { type: 'data-viewer', path: path.join(dir, 'sub', 'f.csv'), meta: { title: 't' } });
    expect(evt.path).toBe('sub/f.csv');
  });

  it.skipIf(process.platform === 'win32')('rejects symlink escapes', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-out-'));
    try {
      fs.writeFileSync(path.join(outside, 'secret.csv'), 'x');
      fs.symlinkSync(outside, path.join(dir, 'link'));
      await expect(emitEvent(mkctx(), { type: 'data-viewer', path: 'link/secret.csv' })).rejects.toThrow(/symlink/);
      await expect(emitEvent(mkctx(), { type: 'data-viewer', path: 'link/new.csv' })).rejects.toThrow(/symlink/);
      expect(lines()).toHaveLength(0);
    } finally { fs.rmSync(outside, { recursive: true, force: true }); }
  });

  it('accepts all 11 types; close without path ok; others need path', async () => {
    expect(EVENT_TYPES).toHaveLength(11);
    for (const type of EVENT_TYPES) {
      if (type === 'close') continue;
      await emitEvent(mkctx(), { type, path: 'p/x.json', meta: { title: 't', panel_id: 'p1', pr: 1 } });
    }
    const c = await emitEvent(mkctx(), { type: 'close', meta: { id: 'panel-1' } });
    expect(c.path).toBeNull();
    expect(lines()).toHaveLength(11);
    await expect(emitEvent(mkctx(), { type: 'chart' })).rejects.toThrow(/path/);
    expect(lines()).toHaveLength(11);
  });

  it('20 concurrent emits yield 20 well-formed lines', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => emitEvent(mkctx(), { type: 'chart', path: `c${i}.json`, meta: { title: 't', i, pad: 'x'.repeat(2000) } })));
    const ls = lines();
    expect(ls).toHaveLength(20);
    const idx = new Set(ls.map((l) => { const e = JSON.parse(l); expect(check(e)).toBe(true); return e.meta.i; }));
    expect(idx.size).toBe(20);
  });
});

describe('artifact_emit over MCP', () => {
  it('lists, emits, and errors keep header', async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [serverJs, '--root', dir], env: { ...process.env }, stderr: 'pipe' });
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('artifact_emit');

      const ok = await client.callTool({ name: 'artifact_emit', arguments: { type: 'chart', path: 'a/b.json', meta: { title: 't', k: 1 } } });
      expect(ok.isError).toBeFalsy();
      expect(ok.content[0].text).toMatch(HDR);
      const ls = lines();
      expect(ls).toHaveLength(1);
      expect(check(JSON.parse(ls[0]))).toBe(true);
      expect(JSON.parse(ls[0]).path).toBe('a/b.json');

      const bad = await client.callTool({ name: 'artifact_emit', arguments: { type: 'nope', path: 'a.json' } });
      expect(bad.isError).toBe(true);
      expect(bad.content[0].text).toMatch(HDR);

      const trav = await client.callTool({ name: 'artifact_emit', arguments: { type: 'chart', path: '../x.json' } });
      expect(trav.isError).toBe(true);
      expect(trav.content[0].text).toMatch(HDR);

      const nopath = await client.callTool({ name: 'artifact_emit', arguments: { type: 'chart' } });
      expect(nopath.isError).toBe(true);
      expect(lines()).toHaveLength(1);
    } finally { await client.close(); }
  }, 30000);
});
