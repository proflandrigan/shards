import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const gates = require('../runtime/gates');
const index = require('../runtime/sessions/index.js');
const ops = require('../runtime/sessions/ops');

let root; let reg;
const sdir = () => path.join(root, '.shards', 'sessions');
const add = (id, extra = {}) => index.appendSession(sdir(), { sessionId: id, agent: 'syn', projectName: 'p', ...extra });
const call = (name, args = {}, key = 'cur', state) => reg.call(name, args, { root, getConfig: () => ({ config: {} }), state: state || new StateStore(root, key), sessionKey: key });
const data = (r) => { const t = r.content[r.content.length - 1].text; return JSON.parse(t.slice(t.indexOf('{'))); };
const errText = (r) => r.content.map((c) => c.text).join('\n');

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'sess-')); reg = new Registry(loadTools()); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

async function openGate(key, id = 'data-analyst-phase-1') {
  const st = new StateStore(root, key);
  await pushFrame(st, { agent: 'data-analyst', project: 'p' });
  const r = await reg.call('gate_request', { id, kind: 'phase', phase: 1, summary: 's', record_ref: 'r.md' }, { root, getConfig: () => ({ config: {} }), state: st, sessionKey: key });
  expect(r.isError).toBeFalsy();
  return st;
}

describe('sessions tools', () => {
  it('registers the three tools', () => {
    const names = reg.list().map((t) => t.name);
    for (const n of ['sessions_list', 'sessions_resume', 'sessions_end']) expect(names).toContain(n);
  });
  it('sessions_list filters by status and limit', async () => {
    add('aaaa1111'); add('bbbb2222'); add('cccc3333');
    index.markEnded(sdir(), 'aaaa1111', {});
    expect(data(await call('sessions_list')).count).toBe(3);
    const ended = data(await call('sessions_list', { status: 'ended' }));
    expect(ended.sessions.map((s) => s.sessionId)).toEqual(['aaaa1111']);
    expect(data(await call('sessions_list', { limit: 1 })).count).toBe(1);
  });
  it('sessions_resume returns hints for all hosts, accepts prefix', async () => {
    add('abcd1234-0000'); 
    const d = data(await call('sessions_resume', { id: 'abcd' }));
    expect(d.entry.sessionId).toBe('abcd1234-0000');
    expect(d.hints.claude).toBe('claude --resume abcd1234-0000');
    expect(d.hints.codex).toContain('codex resume abcd1234-0000');
    expect(d.hints.codex).toContain('UNVERIFIED');
    expect(d.hints.t3).toContain('T3 Code');
    expect(typeof d.host).toBe('string');
  });
  it('sessions_resume errors on ambiguous prefix and unknown id', async () => {
    add('abcd1111'); add('abcd2222');
    const r = await call('sessions_resume', { id: 'abcd' });
    expect(r.isError).toBe(true);
    expect(errText(r)).toMatch(/Ambiguous/);
    expect(errText(r)).toContain('abcd1111');
    expect(errText(r)).toContain('abcd2222');
    const n = await call('sessions_resume', { id: 'zzzz' });
    expect(n.isError).toBe(true);
  });
  it('sessions_end happy path marks current session ended', async () => {
    add('cur');
    const d = data(await call('sessions_end'));
    expect(d.ended).toBe(true);
    expect(d.replayed).toEqual([]);
    expect(d.still_pending).toEqual([]);
    expect(index.getEntry(sdir(), 'cur').status).toBe('ended');
  });
  it('sessions_end falls back to most recent active row', async () => {
    add('other1');
    const d = data(await call('sessions_end', {}, 'unindexed'));
    expect(d.session).toBe('other1');
  });
  it('sessions_end without index row returns ended:false with note', async () => {
    const d = data(await call('sessions_end', {}, 'ghost'));
    expect(d.ended).toBe(false);
    expect(d.note).toMatch(/No index row/);
  });
  it('sessions_end refused with a pending gate', async () => {
    add('cur');
    const st = await openGate('cur');
    const r = await call('sessions_end', {}, 'cur', st);
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('data-analyst-phase-1 (pending)');
    expect(errText(r)).toContain('shards gates force-close');
    expect(index.getEntry(sdir(), 'cur').status).toBe('active');
  });
  it('sessions_end refused with a suspended gate', async () => {
    add('cur');
    const st = await openGate('cur');
    await gates.suspendGate({ root, sessionKey: 'cur', state: st }, 'data-analyst-phase-1', { proof: { tier: 'test' } });
    const r = await call('sessions_end', {}, 'cur', st);
    expect(r.isError).toBe(true);
    expect(errText(r)).toContain('data-analyst-phase-1 (suspended)');
  });
  it('endSession replays pending commits via injected git and reports leftovers', async () => {
    add('cur');
    const git = {
      replayPending: async () => [{ gate: 'g1', outcome: 'committed' }, { gate: 'g2', outcome: 'pending', reason: 'lock' }],
      listPending: () => [{ gate: 'g2', status: 'pending', reason: 'lock' }],
    };
    const r = await ops.endSession(root, { currentKey: 'cur', deps: { git } });
    expect(r.ended).toBe(true);
    expect(r.replayed).toHaveLength(2);
    expect(r.replay_failures).toHaveLength(1);
    expect(r.still_pending).toEqual([{ gate: 'g2', status: 'pending', reason: 'lock' }]);
  });
  it('endSession still ends when replay throws, and reports the error', async () => {
    add('cur');
    const git = { replayPending: async () => { throw new Error('boom'); }, listPending: () => [] };
    const r = await ops.endSession(root, { currentKey: 'cur', deps: { git } });
    expect(r.ended).toBe(true);
    expect(r.replay_error).toBe('boom');
  });
});
