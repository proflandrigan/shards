import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const G = require('../runtime/gates');
const policy = require('../runtime/gates/policy');
const git = require('../runtime/git');
const leases = require('../runtime/leases');
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const { sh, makeRepo, write, hook, cleanup } = require('./git-binding-fixture.js');

// Regression tests for the PR #72 gate/git review findings. These exercise the real
// git binding and lease store (no getLeasedPaths stub).
const PROOF = { tier: 'test' };
const NO_COMMIT = { commitGate: async () => ({ outcome: 'skipped' }), replayPending: async () => [], loadConfig: () => ({}), resolveOutputDirs: () => [] };
const OLD_HOME = process.env.HOME;
let root; let state; let home;
const sess = () => ({ root, sessionKey: 's1', state });
const commits = (cwd) => Number(sh(cwd, 'rev-list', '--count', 'HEAD'));

afterEach(() => { cleanup(); process.env.HOME = OLD_HOME; });

function repoSession() {
  ({ root } = makeRepo());
  state = new StateStore(root, 's1');
}
function tmpSession() {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'grf-')));
  state = new StateStore(root, 's1');
}

describe('git binding: project config on replay (git.commit=false)', () => {
  it('replayPending without config honours git.commit:false from shards.config.yaml', async () => {
    repoSession();
    write(root, 'shards.config.yaml', 'git:\n  commit: false\n');
    write(root, 'out/a.md', 'a\n');
    const r = await git.commitGate({ root, gate: 'g1', agent: 'a', outputDirs: ['out'], config: { commit: false }, session: 's1' });
    expect(r.reason).toBe('commit_disabled');
    const before = commits(root);
    const out = await git.replayPending(root, { force: true });
    expect(out.map((o) => [o.gate, o.outcome, o.reason])).toEqual([['g1', 'skipped', 'commit_disabled']]);
    expect(commits(root)).toBe(before);
    expect(git.listPending(root).map((p) => p.gate)).toEqual(['g1']);
  });

  it('commitGate without config also loads the project config', async () => {
    repoSession();
    write(root, 'shards.config.yaml', 'git:\n  commit: false\n');
    write(root, 'out/a.md', 'a\n');
    const before = commits(root);
    const r = await git.commitGate({ root, gate: 'g1', agent: 'a', outputDirs: ['out'], session: 's1' });
    expect(r.outcome).toBe('commit_pending');
    expect(r.reason).toBe('commit_disabled');
    expect(commits(root)).toBe(before);
  });
});

describe('git binding: leases excluded from gate commits', () => {
  it('confirmGate -> commitGate drops paths held by an active lease (real lease store)', async () => {
    repoSession();
    write(root, 'out/mine.md', 'mine\n');
    write(root, 'out/leased/w.md', 'half-written by a worker\n');
    await leases.openLease(sess(), { owner: 'fanout', worker_type: 'w', slices: [{ id: 'x', paths: ['out/leased'] }] });
    await G.requestGate(sess(), { frame: { id: 'f1', agent: 'data-analyst' }, id: 'ga', kind: 'phase' });
    const r = await G.confirmGate(sess(), 'ga', { decision: 'confirmed', proof: PROOF }, { loadConfig: () => ({ git: {} }), resolveOutputDirs: () => ['out'] });
    expect(r.commit.outcome).toBe('committed');
    expect(r.commit.files).toEqual(['out/mine.md']);
    expect(sh(root, 'show', '--name-only', '--format=', 'HEAD')).toBe('out/mine.md');
  });

  it('a session key string still resolves leases on the default path', async () => {
    repoSession();
    write(root, 'out/mine.md', 'mine\n');
    write(root, 'out/leased/w.md', 'w\n');
    await leases.openLease(sess(), { owner: 'fanout', worker_type: 'w', slices: [{ id: 'x', paths: ['out/leased'] }] });
    const r = await git.commitGate({ root, gate: 'g', agent: 'a', outputDirs: ['out'], config: {}, session: 's1' });
    expect(r.files).toEqual(['out/mine.md']);
  });
});

describe('git binding: errors never lose a commit', () => {
  it('a throw inside commitGate keeps a pending record; replay commits it and writes the sha back', async () => {
    repoSession();
    const top = root;
    write(root, 'out/a.md', 'A\n');
    hook(top, 'pre-commit', 'exit 1');
    await G.requestGate(sess(), { frame: { id: 'f1', agent: 'x' }, id: 'gA', kind: 'phase' });
    const deps = { loadConfig: () => ({ git: {} }), resolveOutputDirs: () => ['out'] };
    expect((await G.confirmGate(sess(), 'gA', { decision: 'confirmed', proof: PROOF }, deps)).commit.reason).toMatch(/^hook_failed/);
    fs.unlinkSync(path.join(top, '.git', 'hooks', 'pre-commit'));
    fs.chmodSync(path.join(root, 'out/a.md'), 0); // snapshot of gB will fail to hash this file
    write(root, 'out/b.md', 'B\n');
    await G.requestGate(sess(), { frame: { id: 'f1', agent: 'x' }, id: 'gB', kind: 'phase' });
    let gB;
    try {
      gB = await G.confirmGate(sess(), 'gB', { decision: 'confirmed', proof: PROOF }, deps);
    } finally { fs.chmodSync(path.join(root, 'out/a.md'), 0o644); }
    expect(gB.commit.outcome).toBe('commit_pending');
    expect(gB.commit.reason).toMatch(/^commit_error/);
    expect(git.listPending(root).map((p) => p.gate)).toEqual(['gA', 'gB']);
    const out = await git.replayPending(root, { config: {}, force: true });
    expect(out.map((o) => [o.gate, o.outcome])).toEqual([['gA', 'committed'], ['gB', 'committed']]);
    expect(sh(root, 'show', '--name-only', '--format=', 'HEAD')).toBe('out/b.md');
    const entry = G.getGate(sess(), 'gB');
    expect(entry.commit.outcome).toBe('committed');
    expect(entry.commit.sha).toBe(sh(root, 'rev-parse', 'HEAD'));
  });

  it('a throwing record in replay does not abort later records', async () => {
    repoSession();
    const flag = path.join(root, 'FAIL');
    fs.writeFileSync(flag, '1');
    hook(root, 'pre-commit', `[ -e "${flag}" ] && exit 1; exit 0`);
    write(root, 'out/a.md', 'a\n');
    await git.commitGate({ root, gate: 'g1', agent: 'a', outputDirs: ['out'], config: {}, session: 's1' });
    write(root, 'out/b.md', 'b\n');
    await git.commitGate({ root, gate: 'g2', agent: 'a', outputDirs: ['out'], config: {}, session: 's1' });
    fs.unlinkSync(flag);
    // Corrupt g1's record so attempt() throws (files is not iterable).
    const file = path.join(root, '.shards', 'state', 'git-pending.json');
    const store = JSON.parse(fs.readFileSync(file, 'utf8'));
    store.records.g1.files = 42;
    fs.writeFileSync(file, JSON.stringify(store));
    const out = await git.replayPending(root, { config: {}, force: true });
    // The throw is a failed try for g1 (store saved, others still reported), not a rejected replay.
    expect(out.map((o) => [o.gate, o.outcome])).toEqual([['g1', 'commit_pending'], ['g2', 'skipped']]);
    expect(out[0].reason).toMatch(/^commit_error/);
    expect(out[1].reason).toBe('blocked_by_g1');
    expect(git.listPending(root).map((p) => [p.gate, p.tries])).toEqual([['g1', 2], ['g2', 0]]);
  });
});

describe('gate ids are scoped to agent/project', () => {
  beforeEach(() => tmpSession());
  it('same id for another project or agent opens a fresh gate instead of already_confirmed', async () => {
    await G.requestGate(sess(), { frame: { id: 'f1', agent: 'data-analyst', project: 'churn' }, id: 'data-analyst-phase-1', kind: 'phase' });
    await G.confirmGate(sess(), 'data-analyst-phase-1', { decision: 'confirmed', proof: PROOF }, NO_COMMIT);
    const same = await G.requestGate(sess(), { frame: { id: 'f9', agent: 'data-analyst', project: 'churn' }, id: 'data-analyst-phase-1', kind: 'phase' });
    expect(same.result).toBe('already_confirmed');
    const r = await G.requestGate(sess(), { frame: { id: 'f2', agent: 'data-analyst', project: 'pricing' }, id: 'data-analyst-phase-1', kind: 'phase' });
    expect(r.result).toBe('opened');
    expect(r.entry).toMatchObject({ status: 'pending', project: 'pricing', frame: 'f2' });
    expect(r.entry.previous.map((p) => [p.project, p.status])).toEqual([['churn', 'confirmed']]);
    await expect(G.requestGate(sess(), { frame: { id: 'f3', agent: 'ml-engineer' }, id: 'data-analyst-phase-1', kind: 'final' }))
      .rejects.toThrow(/already pending for data-analyst/);
  });

  it('load_phase does not accept a gate confirmed for another project', async () => {
    const reg = new Registry(loadTools());
    await pushFrame(state, { agent: 'ml-engineer', project: 'p' });
    const call = (args) => reg.call('load_phase', args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1' });
    await call({ agent: 'ml-engineer', n: '1' });
    const f = state.read('frames').frames[0];
    await G.requestGate(sess(), { frame: f, id: 'ml-engineer-phase-1', kind: 'phase', phase: 1, summary: 's' });
    await G.confirmGate(sess(), 'ml-engineer-phase-1', { decision: 'confirmed', proof: PROOF }, NO_COMMIT);
    expect((await call({ agent: 'ml-engineer', n: '2' })).isError).toBeFalsy();
    await state.update('frames', () => ({ frames: [{ ...f, id: 'f-other', project: 'q', phase: 1 }] }));
    const r = await call({ agent: 'ml-engineer', n: '2' });
    expect(r.isError).toBe(true);
    expect(r.content[1].text).toContain('(status: missing)');
  });
});

describe('reopened / resumed gates follow the live frame', () => {
  beforeEach(() => tmpSession());
  it('a changes_requested gate reopened from a new frame is pending in that frame', async () => {
    await state.update('frames', () => ({ frames: [{ id: 'f1', agent: 'data-analyst', project: 'p' }] }));
    const a = { id: 'data-analyst-phase-1', kind: 'phase', phase: 1, summary: 's' };
    await G.requestGate(sess(), { ...a, frame: { id: 'f1', agent: 'data-analyst', project: 'p' } });
    await G.confirmGate(sess(), a.id, { decision: 'changes_requested', proof: PROOF });
    await state.update('frames', () => ({ frames: [{ id: 'f2', agent: 'data-analyst', project: 'p' }] }));
    const r = await G.requestGate(sess(), { ...a, frame: { id: 'f2', agent: 'data-analyst', project: 'p' } });
    expect(r.result).toBe('reopened');
    expect(G.pendingForFrame(sess(), 'f2')).toMatchObject({ id: a.id, frame: 'f2' });
  });

  it('an already-pending gate whose frame is gone is re-homed to the requesting frame', async () => {
    await state.update('frames', () => ({ frames: [{ id: 'f1', agent: 'data-analyst' }] }));
    await G.requestGate(sess(), { id: 'g', kind: 'phase', frame: { id: 'f1', agent: 'data-analyst' } });
    await state.update('frames', () => ({ frames: [{ id: 'f2', agent: 'data-analyst' }] }));
    const r = await G.requestGate(sess(), { id: 'g', kind: 'phase', frame: { id: 'f2', agent: 'data-analyst' } });
    expect(r.result).toBe('already_pending');
    expect(r.entry.frame).toBe('f2');
  });

  it('gate_resume refuses when the top frame already has an open gate and leaves the gate suspended', async () => {
    const reg = new Registry(loadTools());
    await G.requestGate(sess(), { frame: { id: 'f1', agent: 'ml-engineer' }, id: 'A', kind: 'phase' });
    await G.suspendGate(sess(), 'A', { proof: PROOF });
    await state.update('frames', () => ({ frames: [{ id: 'f2', agent: 'ml-engineer' }] }));
    await G.requestGate(sess(), { frame: { id: 'f2', agent: 'ml-engineer' }, id: 'B', kind: 'phase' });
    const r = await reg.call('gate_resume', { id: 'A' }, { root, state, sessionKey: 's1', getConfig: () => ({ config: {} }) });
    expect(r.isError).toBe(true);
    expect(r.content.map((c) => c.text).join('\n')).toMatch(/already has pending gate B/);
    expect(G.getGate(sess(), 'A')).toMatchObject({ status: 'suspended', frame: 'f1' });
  });
});

describe('plan policy budget', () => {
  beforeEach(() => tmpSession());
  it('re-checks max_gates under the policy lock (no overspend from a stale read)', async () => {
    await G.requestGate(sess(), { frame: { id: 'f0', agent: 'a' }, id: 'plan-approval', kind: 'phase' });
    await G.confirmGate(sess(), 'plan-approval', { decision: 'confirmed', proof: PROOF }, NO_COMMIT);
    await state.update('policy', (cur) => { cur.notices = 1; return cur; });
    // A concurrent caller that read the counter before another gate spent the last notice.
    const stale = { read: (n) => (n === 'policy' ? { notices: 0 } : state.read(n)), update: (...a) => state.update(...a) };
    const s = { root, sessionKey: 's1', state: stale };
    const { entry } = await G.requestGate(sess(), { frame: { id: 'f1', agent: 'a' }, id: 'g1', kind: 'phase' });
    const r = await policy.apply(s, entry, { status: 'pass' }, { policy: 'plan', budget: { max_gates: 1 } }, NO_COMMIT);
    expect(r.handled).toBe(false);
    expect(r.reason).toMatch(/budget exhausted/);
    expect(G.getGate(sess(), 'g1').status).toBe('pending');
    expect(state.read('policy').notices).toBe(1);
  });
});

describe('gate_force_close validates the gate before using the host prompt', () => {
  beforeEach(async () => {
    tmpSession();
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'grfh-'));
    process.env.HOME = home;
    await pushFrame(state, { agent: 'data-analyst', project: 'p' });
    await G.requestGate(sess(), { frame: state.read('frames').frames[0], id: 'data-analyst-phase-1', kind: 'phase', phase: 1, summary: 's' });
  });
  it('an unknown id does not consume the recorded prompt', async () => {
    const reg = new Registry(loadTools());
    const rec = { tool: 'mcp__plugin_shards_shards__gate_force_close', permission_mode: 'default', ts: new Date().toISOString(), host: 'claude-code', decision: 'ask' };
    await state.withLock(() => { fs.writeFileSync(state.file('hooks'), JSON.stringify({ gateCalls: [rec], lastGateCall: rec })); });
    const call = (id) => reg.call('gate_force_close', { id }, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1', host: 'claude-code' });
    const bad = await call('nope');
    expect(bad.isError).toBe(true);
    expect(bad.content.map((c) => c.text).join('\n')).toMatch(/unknown gate nope/);
    const ok = await call('data-analyst-phase-1');
    expect(ok.isError).toBeFalsy();
    expect(G.getGate(sess(), 'data-analyst-phase-1').status).toBe('force_closed');
  });
});
