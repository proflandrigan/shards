import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { StateStore } = require('../runtime/state/store.js');
const { toSessionKey } = require('../hooks/lib/host.js');

const fixture = path.join(__dirname, 'fixtures', 'session-server.js');
const serverJs = path.join(__dirname, '..', 'runtime', 'server.js');
const SA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const SB = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const SA2 = 'cccccccc-3333-4333-8333-cccccccccccc';
let root; let clients = [];
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-mp-')); clients = []; });
afterEach(async () => {
  for (const c of clients) { try { await c.close(); } catch (_) { /* ignore */ } }
  fs.rmSync(root, { recursive: true, force: true });
});

function hs(file, sid, chain, source = 'startup', ts = new Date().toISOString()) {
  const dir = path.join(root, '.shards', 'state', 'handshake');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ session_id: sid, source, cwd: root, ts, pid: 1, ppid_chain: chain }));
}
async function connect(args, env = {}) {
  const transport = new StdioClientTransport({ command: process.execPath, args, env: { ...process.env, ...env }, stderr: 'pipe' });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  clients.push(client);
  return client;
}
const fix = (anc) => connect([fixture, '--root', root, '--ancestry', JSON.stringify(anc)]);
const status = async (c) => {
  const r = await c.callTool({ name: 'shards_status', arguments: {} });
  return { r, header: r.content[0].text, data: r.isError ? null : JSON.parse(r.content[1].text) };
};

describe('multi-process session correlation', () => {
  it('two servers in one root stay isolated and re-key on /clear', async () => {
    hs('1.json', SA, [900001, 900002, 500]);
    hs('2.json', SB, [900011, 900012, 500]);
    const ca = await fix([900001, 900002, 500]);
    const cb = await fix([900011, 900012, 500]);
    const a0 = await status(ca); const b0 = await status(cb);
    expect(a0.data.sessionKey).toBe(toSessionKey(SA));
    expect(b0.data.sessionKey).toBe(toSessionKey(SB));

    const sa = new StateStore(root, toSessionKey(SA));
    const sb = new StateStore(root, toSessionKey(SB));
    await sa.update('frames', () => ({ frames: [{ id: 'f1', agent: 'agent-a', phase: 1 }] }));
    await sb.update('frames', () => ({ frames: [{ id: 'f2', agent: 'agent-b', phase: 1 }] }));
    await sa.update('gates', () => ({ gates: { ga: { id: 'ga', status: 'pending', agent: 'agent-a' } } }));

    const a1 = await status(ca); const b1 = await status(cb);
    expect(a1.data.activeAgent).toBe('agent-a');
    expect(b1.data.activeAgent).toBe('agent-b');
    expect(a1.header).toContain('agent=agent-a');
    expect(b1.header).toContain('agent=agent-b');
    expect(a1.header).toContain('gate=ga');
    expect(b1.header).toContain('gate=-');

    // /clear: newer handshake for A's ancestry with a new session id
    hs('3.json', SA2, [900001, 900002, 500], 'clear', new Date(Date.now() + 2000).toISOString());
    const a2 = await status(ca); const b2 = await status(cb);
    expect(a2.data.sessionKey).toBe(toSessionKey(SA2));
    expect(a2.data.activeAgent).toBeNull();
    expect(b2.data.sessionKey).toBe(toSessionKey(SB));
    expect(b2.data.activeAgent).toBe('agent-b');
  }, 30000);

  it('no handshake: claude-code falls back to a process key', async () => {
    const c = await connect([serverJs, '--root', root], { SHARDS_HOST: 'claude-code' });
    const s = await status(c);
    expect(s.data.sessionKey).toMatch(/^mcp-/);
  }, 30000);

  it('no handshake: codex refuses with a clear isError', async () => {
    const c = await connect([serverJs, '--root', root], { SHARDS_HOST: 'codex', SHARDS_ASSUME_ONE_PROCESS_PER_SESSION: '' });
    const s = await status(c);
    expect(s.r.isError).toBe(true);
    expect(s.header).toMatch(/^\[shards v0 \| agent=- /);
    expect(s.r.content[1].text).toContain('SHARDS_ASSUME_ONE_PROCESS_PER_SESSION=1');
    expect(s.r.content[1].text).toContain('codex');
  }, 30000);
});
