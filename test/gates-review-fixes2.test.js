import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const { pushFrame, popFrames } = require('../runtime/stack');
const { loadOrCreateConfig } = require('../runtime/config');
const G = require('../runtime/gates');
const { createServer } = require('../runtime/server');

const dirs = [];
const mk = () => { const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'grf2-'))); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const DEPS = { commitGate: async () => ({ outcome: 'committed', sha: 'abc1234' }), replayPending: async () => [], loadConfig: () => ({}), resolveOutputDirs: () => [] };
const text = (r) => r.content.map((c) => c.text).join('\n');

describe('cross-project carry-over', () => {
  it('a gate confirmed for projA does not satisfy gate_request for projB', async () => {
    const root = mk(); const state = new StateStore(root, 's1'); const reg = new Registry(loadTools());
    const ctx = { root, state, sessionKey: 's1', gateDeps: DEPS, getConfig: () => ({ config: { gates: {} } }) };
    await pushFrame(state, { agent: 'data-analyst', project: 'projA' });
    fs.writeFileSync(path.join(root, 'x.md'), 'x');
    const args = { id: 'data-analyst-phase-1', kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' };
    await reg.call('gate_request', args, ctx);
    await G.confirmGate({ root, sessionKey: 's1', state }, args.id, { decision: 'confirmed', proof: { tier: 'operator-cli' } }, DEPS);
    await popFrames(state, { popBase: true });
    await pushFrame(state, { agent: 'data-analyst', project: 'projB' });
    const r = await reg.call('gate_request', args, ctx);
    expect(text(r)).not.toMatch(/already_confirmed|already confirmed/);
    const g = state.read('gates').gates[args.id];
    expect(g.status).toBe('pending');
    expect(g.project).toBe('projB');
    // same project still short-circuits
    await G.confirmGate({ root, sessionKey: 's1', state }, args.id, { decision: 'confirmed', proof: { tier: 'operator-cli' } }, DEPS);
    expect(text(await reg.call('gate_request', args, ctx))).toMatch(/already_confirmed/);
  });
});

describe('config errors fail closed', () => {
  async function run(yaml) {
    const root = mk(); fs.writeFileSync(path.join(root, 'shards.config.yaml'), yaml);
    const state = new StateStore(root, 's1'); await pushFrame(state, { agent: 'data-analyst', project: 'p' });
    const reg = new Registry(loadTools());
    const r = await reg.call('gate_request', { id: 'g1', kind: 'checkpoint', phase: 1, summary: 's', record_ref: 'x.md', evidence: { status: 'pass', summary: 'ok' } },
      { root, getConfig: () => loadOrCreateConfig(root), state, sessionKey: 's1', gateDeps: DEPS });
    return { r, state, root, reg };
  }
  it('strict policy plus a config typo keeps the checkpoint pending and surfaces the error', async () => {
    const { r, state } = await run('version: 1\ngates:\n  policy: strict\nbogus_key: 1\n');
    expect(state.read('gates').gates.g1.status).toBe('pending');
    expect(text(r)).toMatch(/config_error/);
    expect(text(r)).toMatch(/WARNING: shards.config.yaml/);
  });
  it('a valid default config still auto-records passing checkpoint evidence', async () => {
    const { state } = await run('version: 1\n');
    expect(state.read('gates').gates.g1.status).toBe('confirmed');
  });
  it('load_phase surfaces the config error', async () => {
    const { reg, root, state } = await run('version: 1\nbogus_key: 1\n');
    const r = await reg.call('load_phase', { agent: 'data-analyst', n: 1 }, { root, getConfig: () => loadOrCreateConfig(root), state, sessionKey: 's1' });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/WARNING: shards.config.yaml/);
  });
});

describe('gate_resume cannot leave two pending gates on one frame', () => {
  it('refuses when the re-home target frame already holds a gate', async () => {
    const root = mk(); const state = new StateStore(root, 's1'); const s = { root, sessionKey: 's1', state };
    await pushFrame(state, { agent: 'syn' });
    const f2 = await pushFrame(state, { agent: 'data-analyst', project: 'p' });
    await G.requestGate(s, { frame: f2, id: 'A', kind: 'phase' });
    await G.suspendGate(s, 'A', { proof: { tier: 'x' } });
    await popFrames(state, {});
    await pushFrame(state, { agent: 'ml-engineer' });
    const f3 = await pushFrame(state, { agent: 'data-analyst', project: 'p' });
    await G.requestGate(s, { frame: f3, id: 'B', kind: 'phase' });
    const r = await new Registry(loadTools()).call('gate_resume', { id: 'A' }, { root, state, sessionKey: 's1' });
    expect(r.isError).toBe(true);
    const gs = state.read('gates').gates;
    expect(gs.A.status).toBe('suspended');
    expect(Object.values(gs).filter((g) => g.frame === f3.id && g.status === 'pending')).toHaveLength(1);
  });
});

describe('server config reload and session index', () => {
  it('reloads shards.config.yaml when its mtime or size changes', () => {
    const root = mk(); const h = createServer({ root, sessionKey: 'k1', leaseSweepMs: 0 });
    const f = path.join(root, 'shards.config.yaml');
    fs.writeFileSync(f, 'version: 1\ngates:\n  policy: strict\n');
    expect(h.getConfig().config.gates.policy).toBe('strict');
    fs.writeFileSync(f, 'version: 1\ngates:\n  policy: plan\n');
    expect(h.getConfig().config.gates.policy).toBe('plan');
    fs.writeFileSync(f, 'version: 1\nbogus_key: 1\n');
    expect(() => h.getConfig()).toThrow();
    fs.writeFileSync(f, 'version: 1\ngates:\n  policy: strict\n');
    expect(h.getConfig().config.gates.policy).toBe('strict');
    h.sweeper.stop();
  });

  it('the runtime registers the session in INDEX.json without Studio (idempotent)', () => {
    const root = mk(); const h = createServer({ root, sessionKey: 'k1', leaseSweepMs: 0 });
    void h.state; // resolving the session (as every tool call does) registers it
    void h.state;
    h.sweeper.stop();
    const idx = require('../runtime/sessions/index.js').listSessions(path.join(root, '.shards', 'sessions'));
    expect(idx.map((x) => x.sessionId)).toEqual(['k1']);
    expect(idx[0].status).toBe('active');
  });

  it('server start sweeps stale active rows to abandoned', () => {
    const root = mk(); const dir = path.join(root, '.shards', 'sessions'); const idx = require('../runtime/sessions/index.js');
    idx.appendSession(dir, { sessionId: 'old' });
    const data = idx.readIndex(dir); data.sessions[0].lastActivityAt = new Date(Date.now() - 48 * 3600e3).toISOString(); idx.writeIndex(dir, data);
    const h = createServer({ root, sessionKey: 'k1', leaseSweepMs: 0 }); h.sweeper.stop();
    expect(idx.getEntry(dir, 'old').status).toBe('abandoned');
  });
});
