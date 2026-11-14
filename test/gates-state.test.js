import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const G = require('../runtime/gates');
const { headerInfoFromStore } = require('../runtime/header.js');
const { popFrames } = require('../runtime/stack.js');
const { StateStore } = require('../runtime/state/store.js');

let root; let s1; let s2;
const frame = (id, agent = 'ml-engineer') => ({ id, agent, phase: 1, track: null, project: 'p1' });
const proof = { tier: 'cli' };
const mkDeps = (over = {}) => {
  const calls = [];
  return { calls, commitGate: async (a) => { calls.push(a); return { outcome: 'committed', sha: 'abcdef1234567' }; },
    replayPending: async () => {}, loadConfig: () => ({ git: {} }), resolveOutputDirs: () => ['models/p1'], ...over };
};
const req = (f, id, extra = {}) => ({ frame: f, id, kind: 'phase', phase: 1, summary: 's', record_ref: 'r', validates: null, ...extra });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gates-'));
  s1 = { root, sessionKey: 'sess-a' }; s2 = { root, sessionKey: 'sess-b' };
});

describe('gates state', () => {
  it('opens and is isolated per session', async () => {
    const f = frame('f1-ml-engineer');
    expect((await G.requestGate(s1, req(f, 'g1'))).result).toBe('opened');
    expect(G.getGate(s2, 'g1')).toBeNull();
    expect((await G.requestGate(s2, req(f, 'g1'))).result).toBe('opened');
    await G.confirmGate(s1, 'g1', { decision: 'confirmed', proof }, mkDeps());
    expect(G.getGate(s2, 'g1').status).toBe('pending');
  });

  it('rejects unknown kinds, exports kinds', async () => {
    expect(G.KINDS).toHaveLength(6);
    expect(G.ADVANCING_KINDS).toEqual(['phase', 'final', 'execute', 'handoff']);
    await expect(G.requestGate(s1, req(frame('f1'), 'g', { kind: 'bogus' }))).rejects.toThrow(/kind/);
  });

  it('already_pending refreshes; one pending per frame', async () => {
    const f = frame('f1');
    await G.requestGate(s1, req(f, 'g1'));
    const r = await G.requestGate(s1, req(f, 'g1', { summary: 'new' }));
    expect(r.result).toBe('already_pending'); expect(r.entry.summary).toBe('new');
    await expect(G.requestGate(s1, req(f, 'g2'))).rejects.toThrow(/g1/);
    expect(G.pendingForFrame(s1, 'f1').id).toBe('g1');
  });

  it('concurrent requests in one frame: exactly one wins', async () => {
    const f = frame('f1');
    const rs = await Promise.allSettled([G.requestGate(s1, req(f, 'a')), G.requestGate(s1, req(f, 'b'))]);
    expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(G.listGates(s1).filter((g) => g.status === 'pending')).toHaveLength(1);
  });

  it('confirm requires proof', async () => {
    await G.requestGate(s1, req(frame('f1'), 'g1'));
    await expect(G.confirmGate(s1, 'g1', { decision: 'confirmed' }, mkDeps())).rejects.toThrow('confirmGate requires human proof');
    await expect(G.confirmGate(s1, 'g1', { decision: 'confirmed', proof: {} }, mkDeps())).rejects.toThrow(/human proof/);
    expect(G.getGate(s1, 'g1').status).toBe('pending');
  });

  it('confirm commits with inputs; idempotent; never reopens', async () => {
    await G.requestGate(s1, req(frame('f1'), 'g1'));
    const d = mkDeps();
    const r = await G.confirmGate(s1, 'g1', { decision: 'confirmed', proof, note: 'ok' }, d);
    expect(r.result).toBe('confirmed');
    expect(r.entry.commit).toMatchObject({ outcome: 'committed', sha: 'abcdef1234567' });
    expect(d.calls).toHaveLength(1);
    expect(d.calls[0]).toMatchObject({ root, gate: 'g1', agent: 'ml-engineer', outputDirs: ['models/p1'], session: 'sess-a' });
    const r2 = await G.confirmGate(s1, 'g1', { decision: 'confirmed', proof }, d);
    expect(r2.result).toBe('already_confirmed'); expect(d.calls).toHaveLength(1);
    const rq = await G.requestGate(s1, req(frame('f1'), 'g1'));
    expect(rq.result).toBe('already_confirmed');
    expect(G.formatConfirmedMessage(G.getGate(s1, 'g1'))).toBe('Gate g1 already confirmed (abcdef1), continue.');
    expect(G.confirmedGates(s1)).toEqual([{ id: 'g1', sha: 'abcdef1234567', outcome: 'committed' }]);
  });

  it('commit_pending and throwing commit still confirm', async () => {
    await G.requestGate(s1, req(frame('f1'), 'g1'));
    const r = await G.confirmGate(s1, 'g1', { decision: 'confirmed', proof }, mkDeps({ commitGate: async () => ({ outcome: 'commit_pending', reason: 'dirty' }) }));
    expect(r.entry.status).toBe('confirmed'); expect(r.entry.commit.outcome).toBe('commit_pending');
    expect(G.formatConfirmedMessage(r.entry)).toContain('commit_pending');
    await G.requestGate(s1, req(frame('f2'), 'g2'));
    const r2 = await G.confirmGate(s1, 'g2', { decision: 'confirmed', proof }, mkDeps({ commitGate: async () => { throw new Error('boom'); } }));
    expect(r2.entry.status).toBe('confirmed');
    expect(r2.entry.commit).toMatchObject({ outcome: 'commit_pending' });
    expect(r2.entry.commit.reason).toMatch(/boom/);
  });

  it('non-advancing kind skips commit', async () => {
    await G.requestGate(s1, req(frame('f1'), 'c1', { kind: 'checkpoint' }));
    const d = mkDeps();
    const r = await G.confirmGate(s1, 'c1', { decision: 'confirmed', proof }, d);
    expect(d.calls).toHaveLength(0);
    expect(r.entry.commit).toEqual({ outcome: 'skipped', reason: 'non_advancing_kind' });
  });

  it('changes_requested then re-request same id', async () => {
    const f = frame('f1');
    await G.requestGate(s1, req(f, 'g1'));
    const d = mkDeps();
    const r = await G.confirmGate(s1, 'g1', { decision: 'changes_requested', proof, note: 'fix' }, d);
    expect(r.result).toBe('changes_requested'); expect(d.calls).toHaveLength(0);
    expect(G.pendingForFrame(s1, 'f1')).toBeNull();
    const rq = await G.requestGate(s1, req(f, 'g1', { summary: 'v2' }));
    expect(rq.result).toBe('reopened'); expect(rq.entry.status).toBe('pending'); expect(rq.entry.summary).toBe('v2');
  });

  it('suspend/resume with proof', async () => {
    const f = frame('f1');
    await G.requestGate(s1, req(f, 'g1'));
    await expect(G.suspendGate(s1, 'g1', {})).rejects.toThrow(/proof/);
    const e = await G.suspendGate(s1, 'g1', { proof });
    expect(e.status).toBe('suspended');
    await expect(G.requestGate(s1, req(f, 'g1'))).rejects.toThrow('gate g1 is suspended; resume it first');
    await expect(G.requestGate(s1, req(f, 'g2'))).rejects.toThrow(/g1/);
    await expect(G.resumeGate(s1, 'g1', {})).rejects.toThrow(/proof/);
    expect((await G.resumeGate(s1, 'g1', { proof })).status).toBe('pending');
    await expect(G.resumeGate(s1, 'g1', { proof })).rejects.toThrow();
  });

  it('interim confirm text', () => {
    const t = G.describeInterimConfirm('g1', 'k');
    expect(t).toContain('node cli/shards.js gates confirm g1 --session k');
    expect(t).toContain('--changes');
  });

  it('header and stack integration', async () => {
    const state = new StateStore(root, 'sess-h');
    await state.update('frames', () => ({ frames: [{ id: 'f1-ml-engineer', agent: 'ml-engineer', phase: 1, gates: [] }] }));
    const sess = { root, sessionKey: 'sess-h', state };
    await G.requestGate(sess, req(frame('f1-ml-engineer'), 'g1'));
    expect(headerInfoFromStore(state).gate).toBe('g1');
    await expect(popFrames(state, { popBase: true })).rejects.toThrow(/g1/);
    await G.confirmGate(sess, 'g1', { decision: 'confirmed', proof }, mkDeps());
    expect(headerInfoFromStore(state).gate).toBe('-');
  });
});

describe('gates + real git module', () => {
  let git = null;
  try { git = require('../runtime/git'); } catch (_) { /* not built yet */ }
  it.skipIf(!git || typeof git.commitGate !== 'function')('confirm works with real commitGate', async () => {
    await G.requestGate(s1, req(frame('f1'), 'g1'));
    const r = await G.confirmGate(s1, 'g1', { decision: 'confirmed', proof }, { loadConfig: () => ({ git: { enabled: false } }), resolveOutputDirs: () => [] });
    expect(r.entry.status).toBe('confirmed');
    expect(r.entry.commit && r.entry.commit.outcome).toBeTruthy();
  });
});
