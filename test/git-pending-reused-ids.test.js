import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const git = require('../runtime/git');
const G = require('../runtime/gates');
const { StateStore } = require('../runtime/state/store');
const { sh, makeRepo, write, hook, cleanup, CFG } = require('./git-binding-fixture.js');

// Gate ids are scoped by agent/project/track, so the same id (e.g. `data-analyst-phase-1`)
// can be confirmed again for another project. The pending-commit store must not drop an
// earlier, still-uncommitted record for that id.
afterEach(() => { cleanup(); });
const GATE = 'data-analyst-phase-1';
const base = (root, extra) => ({ root, gate: GATE, agent: 'data-analyst', outputDirs: ['out'], config: CFG, session: 's', ...extra });
const refs = (cwd) => sh(cwd, 'for-each-ref', '--format=%(refname)', 'refs/shards/pending').split('\n').filter(Boolean);
const storeFile = (root) => path.join(root, '.shards', 'state', 'git-pending.json');
const failingHook = (top) => { const flag = path.join(top, 'FAIL'); fs.writeFileSync(flag, '1'); hook(top, 'pre-commit', `[ -e "${flag}" ] && exit 1; exit 0`); return flag; };

describe('git pending store: reused gate ids', () => {
  it('two confirmations of the same gate id for different projects both survive and replay in order', async () => {
    const { root, top } = makeRepo();
    const flag = failingHook(top);
    const head0 = sh(root, 'rev-parse', 'HEAD');
    write(root, 'out/a.md', 'churn\n');
    const r1 = await git.commitGate(base(root, { project: 'churn' }));
    expect(r1.reason).toMatch(/^hook_failed/);
    write(root, 'out/a.md', 'pricing\n');
    const r2 = await git.commitGate(base(root, { project: 'pricing' }));
    expect(r2.reason).toBe(`blocked_by_${GATE}`);

    const pend = git.listPending(root);
    expect(pend.map((r) => [r.gate, r.project])).toEqual([[GATE, 'churn'], [GATE, 'pricing']]);
    expect(new Set(pend.map((r) => r.key)).size).toBe(2);
    expect(new Set(pend.map((r) => r.snapshot_ref)).size).toBe(2);
    expect(refs(root)).toHaveLength(2);

    fs.unlinkSync(flag);
    const out = await git.replayPending(root, { config: CFG, force: true });
    expect(out.map((o) => [o.gate, o.outcome])).toEqual([[GATE, 'committed'], [GATE, 'committed']]);
    const log = sh(root, 'log', '--format=%H', `${head0}..HEAD`).split('\n').reverse();
    expect(log).toHaveLength(2);
    expect(sh(root, 'show', `${log[0]}:out/a.md`)).toBe('churn');
    expect(sh(root, 'show', `${log[1]}:out/a.md`)).toBe('pricing');
    expect(git.listPending(root)).toEqual([]);
    expect(refs(root)).toEqual([]);
  });

  it('the same gate id from another session does not replace the earlier record', async () => {
    const { root, top } = makeRepo();
    failingHook(top);
    write(root, 'out/a.md', 'one\n');
    await git.commitGate(base(root, { session: 's1', project: 'p' }));
    write(root, 'out/b.md', 'two\n');
    await git.commitGate(base(root, { session: 's2', project: 'p' }));
    expect(git.listPending(root).map((r) => r.session)).toEqual(['s1', 's2']);
  });

  it('a re-confirm of the same gate instance replaces its record', async () => {
    const { root, top } = makeRepo();
    const flag = failingHook(top);
    const head0 = sh(root, 'rev-parse', 'HEAD');
    write(root, 'out/a.md', 'first\n');
    await git.commitGate(base(root, { project: 'churn' }));
    write(root, 'out/a.md', 'second\n');
    const r2 = await git.commitGate(base(root, { project: 'churn' }));
    expect(r2.reason).toMatch(/^hook_failed/); // not blocked_by: the old record is gone
    const pend = git.listPending(root);
    expect(pend).toHaveLength(1);
    expect(pend[0].seq).toBe(2);
    expect(refs(root)).toEqual([pend[0].snapshot_ref]);

    fs.unlinkSync(flag);
    const out = await git.replayPending(root, { config: CFG, force: true });
    expect(out.map((o) => o.outcome)).toEqual(['committed']);
    expect(sh(root, 'rev-list', '--count', `${head0}..HEAD`)).toBe('1');
    expect(sh(root, 'show', 'HEAD:out/a.md')).toBe('second');
  });

  it('an old-format store (keyed by bare gate id, no record key/project) loads and replays', async () => {
    const { root, top } = makeRepo();
    const flag = failingHook(top);
    write(root, 'out/a.md', 'legacy\n');
    await git.commitGate(base(root, { gate: 'g-old', session: 's-old' }));
    // Rewrite to the pre-fix shape: key = gate id, snapshot under the bare gateRef.
    const cur = JSON.parse(fs.readFileSync(storeFile(root), 'utf8'));
    const [rec] = Object.values(cur.records);
    const oldRef = git.gateRef('g-old');
    sh(root, 'update-ref', oldRef, rec.snapshot_ref);
    sh(root, 'update-ref', '-d', rec.snapshot_ref);
    const { key, project, track, ...legacy } = rec; // eslint-disable-line no-unused-vars
    fs.writeFileSync(storeFile(root), JSON.stringify({ version: 1, next_seq: cur.next_seq, records: { 'g-old': { ...legacy, snapshot_ref: oldRef } } }, null, 2));

    const pend = git.listPending(root);
    expect(pend.map((r) => [r.gate, r.key])).toEqual([['g-old', 'g-old']]);

    // A new confirmation of another gate queues behind the legacy record.
    write(root, 'out/b.md', 'new\n');
    const r2 = await git.commitGate(base(root, { gate: 'g-new', project: 'p' }));
    expect(r2.reason).toBe('blocked_by_g-old');
    expect(git.listPending(root).map((r) => r.gate)).toEqual(['g-old', 'g-new']);

    fs.unlinkSync(flag);
    const out = await git.replayPending(root, { config: CFG, force: true });
    expect(out.map((o) => [o.gate, o.outcome])).toEqual([['g-old', 'committed'], ['g-new', 'committed']]);
    expect(sh(root, 'show', 'HEAD~1:out/a.md')).toBe('legacy');
    expect(git.listPending(root)).toEqual([]);
    expect(refs(root)).toEqual([]);
  });

  it('a legacy record is replaced by a re-confirm of the same gate/session/agent', async () => {
    const { root, top } = makeRepo();
    failingHook(top);
    write(root, 'out/a.md', 'v1\n');
    await git.commitGate(base(root));
    const cur = JSON.parse(fs.readFileSync(storeFile(root), 'utf8'));
    const [rec] = Object.values(cur.records);
    const { key, project, track, ...legacy } = rec; // eslint-disable-line no-unused-vars
    fs.writeFileSync(storeFile(root), JSON.stringify({ version: 1, next_seq: cur.next_seq, records: { [GATE]: legacy } }));
    write(root, 'out/a.md', 'v2\n');
    await git.commitGate(base(root, { project: 'churn' }));
    const pend = git.listPending(root);
    expect(pend).toHaveLength(1);
    expect(pend[0].project).toBe('churn');
  });

  it('writes the replayed sha back to the right instance when the id was reused (gate machine)', async () => {
    const { root, top } = makeRepo();
    const flag = failingHook(top);
    const state = new StateStore(root, 's1');
    const sess = { root, sessionKey: 's1', state };
    const PROOF = { tier: 'test' };
    const deps = { loadConfig: () => ({ git: CFG }), resolveOutputDirs: () => ['out'] };

    write(root, 'out/a.md', 'churn\n');
    await G.requestGate(sess, { frame: { id: 'f1', agent: 'data-analyst', project: 'churn' }, id: GATE, kind: 'phase' });
    expect((await G.confirmGate(sess, GATE, { decision: 'confirmed', proof: PROOF }, deps)).commit.reason).toMatch(/^hook_failed/);
    write(root, 'out/a.md', 'pricing\n');
    await G.requestGate(sess, { frame: { id: 'f2', agent: 'data-analyst', project: 'pricing' }, id: GATE, kind: 'phase' });
    expect((await G.confirmGate(sess, GATE, { decision: 'confirmed', proof: PROOF }, deps)).commit.reason).toBe(`blocked_by_${GATE}`);
    expect(git.listPending(root).map((r) => r.project)).toEqual(['churn', 'pricing']);

    fs.unlinkSync(flag);
    const out = await git.replayPending(root, { config: CFG, force: true });
    expect(out.map((o) => o.outcome)).toEqual(['committed', 'committed']);
    const top2 = G.getGate(sess, GATE);
    expect(top2.project).toBe('pricing');
    expect(top2.commit).toMatchObject({ outcome: 'committed', sha: sh(root, 'rev-parse', 'HEAD') });
    const prev = top2.previous.find((p) => p.project === 'churn');
    expect(prev.commit).toMatchObject({ outcome: 'committed', sha: sh(root, 'rev-parse', 'HEAD~1') });
  });
});
