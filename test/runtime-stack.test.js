import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { StateStore } = require('../runtime/state/store');
const { pushFrame, popFrames, pendingGatesFor } = require('../runtime/stack');

let root, st;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'stack-')); st = new StateStore(root, 'sA'); });
const names = () => st.read('frames').frames.map((f) => f.agent);

describe('stack', () => {
  it('push assigns unique monotonic ids and schema', async () => {
    const a = await pushFrame(st, { agent: 'syn' });
    const b = await pushFrame(st, { agent: 'ae', project: 'p' });
    expect(a.id).toBe('f1-syn'); expect(b.id).toBe('f2-ae');
    expect(b).toMatchObject({ mode: 'switch', phase: 0, track: null, project: 'p', gates: [] });
    expect(typeof b.opened_at).toBe('string');
  });
  it('refuses duplicate top', async () => {
    await pushFrame(st, { agent: 'syn' });
    await expect(pushFrame(st, { agent: 'syn' })).rejects.toThrow(/already active/);
  });
  it('pop one; base protected; pop_base empties', async () => {
    await pushFrame(st, { agent: 'syn' }); await pushFrame(st, { agent: 'ae' });
    expect((await popFrames(st, {})).popped.map((f) => f.agent)).toEqual(['ae']);
    await expect(popFrames(st, {})).rejects.toThrow(/base frame/);
    expect(names()).toEqual(['syn']);
    await popFrames(st, { popBase: true });
    expect(names()).toEqual([]);
    await expect(popFrames(st, {})).rejects.toThrow(/empty/);
  });
  it('pop to', async () => {
    for (const a of ['syn', 'ae', 'bi']) await pushFrame(st, { agent: a });
    const r = await popFrames(st, { to: 'syn' });
    expect(r.popped.map((f) => f.agent)).toEqual(['ae', 'bi']);
    expect(names()).toEqual(['syn']);
    expect((await popFrames(st, { to: 'syn' })).popped).toEqual([]);
  });
  it('to unknown / to+popBase refused, state untouched', async () => {
    await pushFrame(st, { agent: 'syn' }); await pushFrame(st, { agent: 'ae' });
    const v = st.getVersion();
    await expect(popFrames(st, { to: 'zzz' })).rejects.toThrow('Agent zzz is not on the stack: [syn > ae]');
    await expect(popFrames(st, { to: 'syn', popBase: true })).rejects.toThrow(/cannot be combined/);
    expect(names()).toEqual(['syn', 'ae']);
    expect(st.getVersion()).toBe(v);
  });
  it('pending gate blocks pop and throwing leaves state untouched', async () => {
    await pushFrame(st, { agent: 'syn' }); const ae = await pushFrame(st, { agent: 'ae' });
    await st.update('gates', () => ({ gates: { g1: { id: 'g1', status: 'pending', frame: ae.id } } }));
    const v = st.getVersion();
    await expect(popFrames(st, {})).rejects.toThrow(/g1.*ae/);
    expect(names()).toEqual(['syn', 'ae']);
    expect(st.getVersion()).toBe(v);
    await st.update('gates', (c) => { c.gates.g1.status = 'confirmed'; return c; });
    await popFrames(st, {});
    expect(names()).toEqual(['syn']);
  });
  it('pendingGatesFor matches by agent when frame undefined and by frame.gates', () => {
    const frames = [{ id: 'f1-a', agent: 'a', gates: ['gx'] }];
    expect(pendingGatesFor({ g: { id: 'g', status: 'pending', agent: 'a' } }, frames)).toEqual(['g']);
    expect(pendingGatesFor({ gx: { status: 'pending' } }, frames)).toEqual(['gx']);
    expect(pendingGatesFor({ g: { id: 'g', status: 'pending', agent: 'b' } }, frames)).toEqual([]);
  });
});
