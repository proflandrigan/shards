import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const G = require('../runtime/gates');
const T3 = require('../runtime/gates/tier3');
const { handler: promptHook } = require('../hooks/user-prompt-submit');

let root; let reg; let st;
const KEY = 's1';
const call = (name, args = {}, extra = {}) => reg.call(name, args, { root, getConfig: () => ({ config: {} }), state: st, sessionKey: KEY, ...extra });
const text = (r) => r.content.map((c) => c.text).join('\n');
const data = (r) => { const t = r.content[r.content.length - 1].text; return JSON.parse(t.slice(t.indexOf('{'))); };
const say = (t) => promptHook({ sessionId: KEY, prompt: t, host: 'claude' }, root);
const names = () => st.read('frames').frames.map((f) => f.agent);
const sw = async (agent) => { const r = await call('activate', { agent, mode: 'switch', project: 'p' }); expect(r.isError, text(r)).toBeFalsy(); return r; };
const openGate = async (id = 'analytics-engineer-phase-1') => {
  const r = await call('gate_request', { id, kind: 'phase', phase: 1, summary: 's', record_ref: 'r.md' });
  expect(r.isError, text(r)).toBeFalsy();
};

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'susp-')); reg = new Registry(loadTools()); st = new StateStore(root, KEY); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('stack + suspend', () => {
  it('registers the new tools', () => {
    const n = reg.list().map((t) => t.name);
    for (const t of ['gate_suspend', 'gate_resume', 'gates_open']) expect(n).toContain(t);
  });

  it('syn > analytics-engineer > bi-engineer; return(to=syn) pops two; header carries agent', async () => {
    await sw('syn'); await sw('analytics-engineer');
    const r = await sw('bi-engineer');
    expect(r.content[0].text).toContain('agent=bi-engineer');
    expect(names()).toEqual(['syn', 'analytics-engineer', 'bi-engineer']);
    const ret = await call('return', { to: 'syn' });
    expect(ret.isError, text(ret)).toBeFalsy();
    expect(data(ret).popped).toEqual(['analytics-engineer', 'bi-engineer']);
    expect(names()).toEqual(['syn']);
    expect(ret.content[0].text).toContain('agent=syn');
  });

  it('persona summary restored on return', async () => {
    const first = data(await sw('syn'));
    await sw('analytics-engineer');
    const ret = data(await call('return', {}));
    expect(ret.persona_summary.content).toBe(first.persona_summary.content);
    expect(ret.persona_summary.content.length).toBeGreaterThan(0);
  });

  it('pending gate blocks return; suspend needs human proof; with proof return works', async () => {
    await sw('syn'); await sw('analytics-engineer'); await openGate();
    const r1 = await call('return', {});
    expect(r1.isError).toBe(true);
    expect(text(r1)).toMatch(/pending gate/);
    expect(names()).toEqual(['syn', 'analytics-engineer']);

    const id = 'analytics-engineer-phase-1';
    const before = JSON.stringify(G.getGate({ root, sessionKey: KEY, state: st }, id));
    // no reply at all
    expect((await call('gate_suspend', { id })).isError).toBe(true);
    // invented reply (no recorded prompt)
    expect((await call('gate_suspend', { id, user_reply: 'yes suspend it' })).isError).toBe(true);
    expect(G.getGate({ root, sessionKey: KEY, state: st }, id).status).toBe('pending');
    expect(JSON.stringify(G.getGate({ root, sessionKey: KEY, state: st }, id))).toBe(before);
    // a reply that was said but not the first/whole message
    await say('something else'); await say('suspend it please');
    expect((await call('gate_suspend', { id, user_reply: 'suspend it please' })).isError).toBe(true);
    expect(G.getGate({ root, sessionKey: KEY, state: st }, id).status).toBe('pending');
  });

  it('valid reply suspends; return then works', async () => {
    await sw('syn'); await sw('analytics-engineer'); await openGate();
    const id = 'analytics-engineer-phase-1';
    await say('park it, go back to syn');
    const s = await call('gate_suspend', { id, user_reply: 'park it, go back to syn' });
    expect(s.isError, text(s)).toBeFalsy();
    expect(G.getGate({ root, sessionKey: KEY, state: st }, id).status).toBe('suspended');
    const ret = await call('return', {});
    expect(ret.isError, text(ret)).toBeFalsy();
    expect(names()).toEqual(['syn']);
    // the reply is single-use
    expect(T3.confirmByReply({ root, sessionKey: KEY, state: st }, { id, decision: 'confirmed', user_reply: 'park it, go back to syn' }).then((x) => x.ok)).resolves.toBe(false);
  });

  it('tier 1 elicitation approval suspends without a reply', async () => {
    await sw('syn'); await sw('analytics-engineer'); await openGate();
    const id = 'analytics-engineer-phase-1';
    const r = await call('gate_suspend', { id }, {
      clientCapabilities: () => ({ elicitation: { form: {} } }),
      elicit: async () => ({ action: 'accept', content: { decision: 'approve' } }),
    });
    expect(r.isError, text(r)).toBeFalsy();
    expect(G.getGate({ root, sessionKey: KEY, state: st }, id).history.slice(-1)[0]).toMatchObject({ to: 'suspended', by: 'elicitation' });
  });

  it('suspended gate blocks ending the session and shows in gates_open', async () => {
    await sw('syn'); await sw('analytics-engineer'); await openGate();
    const id = 'analytics-engineer-phase-1';
    await say('suspend');
    await call('gate_suspend', { id, user_reply: 'suspend' });
    await call('return', {});
    const open = data(await call('gates_open'));
    expect(open.pending).toEqual([]);
    expect(open.suspended.map((g) => g.id)).toEqual([id]);
    expect(open.any_blocking_final_review).toBe(true);
    const end = await call('sessions_end', {});
    expect(end.isError).toBe(true);
    expect(text(end)).toMatch(/suspended|gate/i);
  });

  it('gates_open is empty with no gates', async () => {
    await sw('syn');
    expect(data(await call('gates_open'))).toEqual({ pending: [], suspended: [], any_blocking_final_review: false });
  });

  it('re-entering lists the suspended gate; gate_resume resets the tier-3 mark', async () => {
    await sw('syn'); await sw('analytics-engineer'); await openGate();
    const id = 'analytics-engineer-phase-1';
    await say('suspend');
    await call('gate_suspend', { id, user_reply: 'suspend' });
    await call('return', {});
    // resume outside the owning agent is refused
    expect((await call('gate_resume', { id })).isError).toBe(true);
    const re = data(await sw('analytics-engineer'));
    expect(re.suspended_gates).toEqual([id]);
    await say('a message while suspended');
    const hwmBefore = st.read('confirm').marks[id].prompt_hwm;
    const res = await call('gate_resume', { id });
    expect(res.isError, text(res)).toBeFalsy();
    const g = G.getGate({ root, sessionKey: KEY, state: st }, id);
    expect(g.status).toBe('pending');
    expect(g.frame).toBe(st.read('frames').frames.slice(-1)[0].id);
    expect(st.read('confirm').marks[id].prompt_hwm).toBeGreaterThan(hwmBefore);
    // the message sent before resume cannot confirm
    const c = await T3.confirmByReply({ root, sessionKey: KEY, state: st }, { id, decision: 'confirmed', user_reply: 'a message while suspended' });
    expect(c.ok).toBe(false);
    // a fresh message does (commit is replaced by deps)
    await say('ok go');
    const c2 = await T3.confirmByReply({ root, sessionKey: KEY, state: st }, { id, decision: 'changes_requested', user_reply: 'ok go' });
    expect(c2.ok).toBe(true);
  });
});
