import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { ElicitRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { createServer } = require('../runtime/server');
const { pushFrame } = require('../runtime/stack');
const gates = require('../runtime/gates');
const tier1 = require('../runtime/gates/tier1');

let root; let srv; const clients = [];
const ARGS = { id: 'data-analyst-phase-1', kind: 'phase', phase: 1, summary: 'scoped', record_ref: 'analysis/p/project-specs.md' };
const session = () => ({ root, sessionKey: 's1', state: srv.state });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gt1-'));
  srv = createServer({ root, sessionKey: 's1' });
  await pushFrame(srv.state, { agent: 'data-analyst', project: 'p' });
});
afterEach(async () => { for (const c of clients.splice(0)) await c.close(); fs.rmSync(root, { recursive: true, force: true }); });

async function connect(handler) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '0' }, handler ? { capabilities: { elicitation: {} } } : { capabilities: {} });
  if (handler) client.setRequestHandler(ElicitRequestSchema, handler);
  await srv.server.connect(b);
  await client.connect(a);
  clients.push(client);
  return client;
}
const body = (r) => r.content[1].text;
const data = (r) => JSON.parse(body(r).slice(body(r).indexOf('\n\n{') + 2));
const req = (c, over = {}) => c.callTool({ name: 'gate_request', arguments: { ...ARGS, ...over } });

describe('tier 1 elicitation', () => {
  it('approve confirms with elicitation proof', async () => {
    const seen = [];
    const c = await connect(async (r) => { seen.push(r.params); return { action: 'accept', content: { decision: 'approve' } }; });
    const r = await req(c);
    expect(r.isError).toBeFalsy();
    expect(data(r)).toMatchObject({ result: 'confirmed', status: 'confirmed', tier: 'elicitation' });
    expect(body(r)).toContain('confirmed');
    expect(seen[0].message).toContain('data-analyst-phase-1');
    expect(seen[0].message).toContain('phase 1');
    const g = gates.getGate(session(), ARGS.id);
    expect(g.status).toBe('confirmed');
    expect(g.proof).toMatchObject({ tier: 'elicitation', level: 1, action: 'accept' });
  });
  it('request changes returns the note and reopens on next request', async () => {
    const c = await connect(async () => ({ action: 'accept', content: { decision: 'request_changes', note: 'redo the join' } }));
    const r = await req(c);
    expect(data(r)).toMatchObject({ result: 'changes_requested', note: 'redo the join' });
    expect(body(r)).toContain('redo the join');
    expect(gates.getGate(session(), ARGS.id)).toMatchObject({ status: 'changes_requested', note: 'redo the join' });
  });
  it('decline leaves pending with how-to-confirm instructions', async () => {
    const c = await connect(async () => ({ action: 'decline' }));
    const r = await req(c);
    expect(data(r).status).toBe('pending');
    expect(body(r)).toContain('STOP');
    expect(body(r)).toContain('gate_confirm');
    expect(body(r)).toContain('node cli/shards.js gates confirm data-analyst-phase-1 --session s1');
    expect(gates.getGate(session(), ARGS.id).status).toBe('pending');
  });
  it('handler error leaves pending', async () => {
    const c = await connect(async () => { throw new Error('boom'); });
    const r = await req(c);
    expect(data(r).status).toBe('pending');
  });
  it('client without elicitation falls back and stays pending', async () => {
    const c = await connect(null);
    const r = await req(c);
    expect(data(r)).toMatchObject({ result: 'opened', status: 'pending' });
    expect(body(r)).toContain('gate_confirm');
    expect(gates.getGate(session(), ARGS.id).status).toBe('pending');
  });
  it('timeout leaves pending', async () => {
    const out = await tier1.elicitGate({ elicit: () => new Promise(() => {}), clientCapabilities: () => ({ elicitation: { form: {} } }), elicitTimeoutMs: 30 }, { id: 'x', kind: 'phase', phase: 1, summary: '' });
    expect(out.outcome).toBe('error');
  });
  it('unsupported without ctx hooks; no elicitation while validation failed', async () => {
    expect((await tier1.elicitGate({}, { id: 'x' })).outcome).toBe('unsupported');
    const elicit = vi.fn(async () => ({ action: 'accept', content: { decision: 'approve' } }));
    const c = await connect(elicit);
    const r = await req(c, { validates: 'analytics_engineer' });
    expect(r.isError).toBe(true);
    expect(gates.getGate(session(), ARGS.id)).toBeNull();
  });
  it('describeConfirmHow names tier 3 and CLI', () => {
    const t = tier1.describeConfirmHow('g', 'k', { elicitation: true, host: 'codex' });
    expect(t).toMatch(/gate_confirm\(id="g"/);
    expect(t).toContain('--session k');
    expect(t).toContain('Codex');
  });
});
