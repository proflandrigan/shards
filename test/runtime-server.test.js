import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { estimateTokens } = require('../runtime/header.js');

const serverJs = path.join(__dirname, '..', 'runtime', 'server.js');
const HDR = /^\[shards v\d+ \| agent=\S+ ph=\S+ gate=\S+ q=\d+\]$/;
let dir, dir2;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-mcp-'));
  dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-mcp2-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
});

async function connect(args, env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath, args: [serverJs, ...args],
    env: { ...process.env, ...env }, stderr: 'pipe',
  });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  return client;
}
const header = (r) => r.content[0].text;

describe('shards-mcp server', () => {
  it('initialize, list, call shards_status, errors keep header', async () => {
    const client = await connect(['--root', dir]);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('shards_status');

      const r = await client.callTool({ name: 'shards_status', arguments: {} });
      expect(header(r)).toMatch(HDR);
      expect(estimateTokens(header(r))).toBeLessThanOrEqual(60);
      const data = JSON.parse(r.content[1].text);
      expect(data.root).toBe(dir);
      expect(data).toHaveProperty('sessionSource');
      expect(['handshake', 'host-env', 'process', 'explicit']).toContain(data.sessionSource);
      expect(data.jobs.record).toBe('git');
      expect(fs.existsSync(path.join(dir, 'shards.config.yaml'))).toBe(true);

      const unk = await client.callTool({ name: 'nope', arguments: {} });
      expect(unk.isError).toBe(true);
      expect(header(unk)).toMatch(HDR);

      const bad = await client.callTool({ name: 'shards_status', arguments: { x: 1 } });
      expect(bad.isError).toBe(true);
      expect(header(bad)).toMatch(HDR);
    } finally { await client.close(); }
  }, 30000);

  it('--root beats SHARDS_PROJECT_ROOT; env beats cwd', async () => {
    let c = await connect(['--root', dir], { SHARDS_PROJECT_ROOT: dir2 });
    try {
      const d = JSON.parse((await c.callTool({ name: 'shards_status', arguments: {} })).content[1].text);
      expect(d.root).toBe(dir);
    } finally { await c.close(); }
    c = await connect([], { SHARDS_PROJECT_ROOT: dir2 });
    try {
      const d = JSON.parse((await c.callTool({ name: 'shards_status', arguments: {} })).content[1].text);
      expect(d.root).toBe(dir2);
    } finally { await c.close(); }
    c = await connect([`--root=${dir}`]);
    try {
      const d = JSON.parse((await c.callTool({ name: 'shards_status', arguments: {} })).content[1].text);
      expect(d.root).toBe(dir);
    } finally { await c.close(); }
  }, 30000);
});
