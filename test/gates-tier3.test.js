import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const G = require('../runtime/gates');
const T3 = require('../runtime/gates/tier3');
const { StateStore } = require('../runtime/state/store');
const { handler: promptHook } = require('../hooks/user-prompt-submit');
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { pushFrame } = require('../runtime/stack');

let root;
const deps = () => ({ commitGate: async () => ({ outcome: 'committed', sha: 'abcdef1234567' }), replayPending: async () => [], loadConfig: () => ({}), resolveOutputDirs: () => ['x'] });
const frame = (id) => ({ id, agent: 'ml-engineer', phase: 1, project: 'p' });
const req = (f, id) => ({ frame: f, id, kind: 'phase', phase: 1, summary: 's', record_ref: 'r' });
const sess = (key = 'a') => ({ root, sessionKey: key });
const say = (text, key = 'a') => promptHook({ sessionId: key, prompt: text, host: 'claude' }, root);
const open = async (id, f = frame('f1'), key = 'a') => { await G.requestGate(sess(key), req(f, id)); await T3.markRequest(sess(key), id); };
const confirm = (id, user_reply, decision = 'confirmed', key = 'a') => T3.confirmByReply(sess(key), { id, decision, user_reply }, deps());

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 't3-')); });

describe('tier 3 chat reply', () => {
  it('confirms with the whole first message; stores proof and reply', async () => {
    await open('g1');
    await say('Great, go ahead');
    const r = await confirm('g1', 'Great, go ahead');
    expect(r.ok).toBe(true);
    const g = G.getGate(sess(), 'g1');
    expect(g.status).toBe('confirmed');
    expect(g.reply).toBe('Great, go ahead');
    expect(g.proof).toMatchObject({ tier: 'chat-reply', level: 3, prompt_id: 1 });
    expect(g.proof.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes_requested stores the note', async () => {
    await open('g1');
    await say('yes but change X');
    const r = await confirm('g1', 'yes but change X', 'changes_requested');
    expect(r.ok).toBe(true);
    const g = G.getGate(sess(), 'g1');
    expect(g.status).toBe('changes_requested');
    expect(g.note).toBe('yes but change X');
  });
  it('accepts whitespace/NFC-different equal text', async () => {
    await open('g1');
    await say('café   ok\n\n go');
    expect((await confirm('g1', 'café ok go ')).ok).toBe(true);
  });
  it('refuses with no recorder / no prompt / invented reply', async () => {
    await open('g1');
    let r = await confirm('g1', 'looks good');
    expect(r).toMatchObject({ ok: false, first: true, refusal: T3.FIXED_REFUSAL });
    await say('something else');
    r = await confirm('g1', 'looks good');
    expect(r.ok).toBe(false);
    expect(G.getGate(sess(), 'g1').status).toBe('pending');
  });
  it('refuses partial message', async () => {
    await open('g1');
    await say('looks good but wait');
    expect((await confirm('g1', 'looks good')).ok).toBe(false);
  });
  it('refuses a later unrelated message match (not the first after hwm)', async () => {
    await open('g1');
    await say('what is the weather');
    await say('approved');
    expect((await confirm('g1', 'approved')).ok).toBe(false);
    expect(G.getGate(sess(), 'g1').status).toBe('pending');
  });
  it('ignores messages before the request', async () => {
    await say('approved');
    await open('g1');
    expect((await confirm('g1', 'approved')).ok).toBe(false);
  });
  it('message sent while suspended cannot confirm after resume', async () => {
    await open('g1');
    await G.suspendGate(sess(), 'g1', { proof: { tier: 'x' } });
    await say('approved');
    expect((await confirm('g1', 'approved')).ok).toBe(false); // suspended
    await G.resumeGate(sess(), 'g1', { proof: { tier: 'x' } });
    expect((await confirm('g1', 'approved')).ok).toBe(false);
    await say('ok now');
    expect((await confirm('g1', 'ok now')).ok).toBe(true);
  });
  it('one message cannot confirm two gates', async () => {
    await open('g1', frame('f1'));
    await say('yes');
    expect((await confirm('g1', 'yes')).ok).toBe(true);
    await open('g2', frame('f2'));
    // g2 hwm is above prompt 1, so it fails; force a stale mark to prove single-use too
    await state_mark('g2', 0);
    expect((await confirm('g2', 'yes')).ok).toBe(false);
    expect(G.getGate(sess(), 'g2').status).toBe('pending');
  });
  it('concurrent double-use: only one gate wins', async () => {
    await open('g1', frame('f1')); await open('g2', frame('f2'));
    await say('yes');
    const rs = await Promise.all([confirm('g1', 'yes'), confirm('g2', 'yes')]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });
  it('refusal text shown in full once per gate', async () => {
    await open('g1'); await open('g2', frame('f2'));
    const a = await confirm('g1', 'x'); const b = await confirm('g1', 'x');
    expect(a).toMatchObject({ first: true, refusal: T3.FIXED_REFUSAL });
    expect(b).toMatchObject({ ok: false, first: false, refusal: 'Gate still waiting for the user. Stop and wait.' });
    expect((await confirm('g2', 'x')).first).toBe(true);
    expect(T3.FIXED_REFUSAL).not.toMatch(/ask again|ask the user/i);
  });
  it('refuses unknown and already-confirmed gates', async () => {
    expect((await confirm('nope', 'x')).ok).toBe(false);
    await open('g1'); await say('go');
    await confirm('g1', 'go');
    await say('go');
    expect((await confirm('g1', 'go')).ok).toBe(false);
  });
  it('sessions are independent', async () => {
    await open('g1', frame('f1'), 'a'); await open('g1', frame('f1'), 'b');
    await say('yes', 'a');
    expect((await confirm('g1', 'yes', 'confirmed', 'b')).ok).toBe(false);
    expect((await confirm('g1', 'yes', 'confirmed', 'a')).ok).toBe(true);
    expect(G.getGate(sess('b'), 'g1').status).toBe('pending');
  });
  it('tool via registry: refusal is an error carrying fixed text; success confirms', async () => {
    const state = new StateStore(root, 'a');
    await pushFrame(state, { agent: 'data-analyst', project: 'p' });
    const reg = new Registry(loadTools());
    const ctx = { root, getConfig: () => ({ config: {} }), state, sessionKey: 'a' };
    const fr = state.read('frames').frames[0];
    await G.requestGate({ root, sessionKey: 'a', state }, req(fr, 'g1'));
    await T3.markRequest({ root, sessionKey: 'a', state }, 'g1');
    const bad = await reg.call('gate_confirm', { id: 'g1', decision: 'confirmed', user_reply: 'yes' }, ctx);
    expect(bad.isError).toBe(true);
    expect(bad.content[1].text).toBe(T3.FIXED_REFUSAL);
    await say('yes');
    const good = await reg.call('gate_confirm', { id: 'g1', decision: 'confirmed', user_reply: 'yes' }, ctx);
    expect(good.isError).toBeFalsy();
    expect(G.getGate({ root, sessionKey: 'a', state }, 'g1').status).toBe('confirmed');
  });
});

async function state_mark(id, hwm) {
  const st = new StateStore(root, 'a');
  await st.update('confirm', (c) => { c.marks[id].prompt_hwm = hwm; return c; });
}
