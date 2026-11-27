import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { StateStore } = require('../runtime/state/store');
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const L = require('../runtime/leases');
const fanout = require('../runtime/fanout');
const review = require('../runtime/review');
const host = require('../hooks/lib/host');
const { handler } = require('../hooks/pre-tool-use');

const SID = '33333333-3333-4333-8333-333333333333';
let tmp; let state; let sess; let reg;
const RUN = 'run-1';
const slice = (id, paths = [`.shards/review/${RUN}/${id}`]) => ({ id, paths, acceptance: `check ${id}` });
const call = (name, args, extra = {}) => reg.call(name, args, { root: tmp, getConfig: () => ({ config: {} }), state, sessionKey: SID, ...extra });
const text = (r) => r.content[1].text;
const hook = async (tool, input, extra = {}) => {
  const n = host.normalize({ session_id: SID, cwd: tmp, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, ...extra }, { SHARDS_HOST: 'claude-code' });
  const out = await handler(n, tmp);
  return out ? JSON.parse(out).hookSpecificOutput : null;
};
const denied = (o) => !!o && o.permissionDecision === 'deny';
const CLAIM = 'mcp__plugin_shards_shards__fanout_claim';

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'review-rt-'));
  state = new StateStore(tmp, SID);
  sess = { root: tmp, sessionKey: SID, state };
  reg = new Registry(loadTools());
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

async function openReview(worker = 'researcher', id = 'lease-test') {
  void id;
  return L.openLease(sess, { owner: 'review', worker_type: worker, slices: [{ id: 's1', paths: [`.shards/review/${RUN}/s1`] }, { id: 's2', paths: [`.shards/review/${RUN}/s2`] }], meta: { run_id: RUN } });
}

describe('agent_type claim matching (item 6)', () => {
  const claim = async (owner, worker, agentType) => {
    const l = await L.openLease(sess, { owner, worker_type: worker, slices: [{ id: 's1', paths: ['p/a'] }] });
    return L.bindWorker(sess, { agentId: `ag-${Math.random()}`, agentType, leaseId: l.id, sliceId: 's1' }).then(() => true, () => false);
  };
  it('fanout: accepts X, X-worker and shards:X-worker (the data-scientist-worker bug)', async () => {
    expect(await claim('fanout', 'data-scientist', 'data-scientist')).toBe(true);
    expect(await claim('fanout', 'data-scientist', 'data-scientist-worker')).toBe(true);
    expect(await claim('fanout', 'data-scientist', 'shards:data-scientist-worker')).toBe(true);
  });
  it('fanout and task refuse other agents and the verify suffix', async () => {
    expect(await claim('fanout', 'ml-engineer', 'data-analyst-worker')).toBe(false);
    expect(await claim('fanout', 'ml-engineer', 'ml-engineer-verify')).toBe(false);
    expect(await claim('task', 'ml-engineer', 'shards:data-analyst')).toBe(false);
    expect(await claim('task', 'ml-engineer', 'ml-engineer-worker')).toBe(true);
  });
  it('review: accepts X, X-verify, shards:X-verify; refuses X-worker and other agents', async () => {
    expect(await claim('review', 'researcher', 'researcher')).toBe(true);
    expect(await claim('review', 'researcher', 'researcher-verify')).toBe(true);
    expect(await claim('review', 'researcher', 'shards:researcher-verify')).toBe(true);
    expect(await claim('review', 'researcher', 'researcher-worker')).toBe(false);
    expect(await claim('review', 'researcher', 'data-scientist-verify')).toBe(false);
  });
  it('empty agent_type matches (Codex built-in roles); matching is case-insensitive', () => {
    expect(L.typeAccepted(undefined, 'fanout', 'x')).toBe(true);
    expect(L.typeAccepted('default', 'review', '')).toBe(true);
    expect(L.typeAccepted('ML-Engineer', 'fanout', 'ml-engineer')).toBe(true);
  });
});

describe('fanout_start purpose=review', () => {
  it('opens a review lease for a consult agent with run_id in meta', async () => {
    const { lease, cards } = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1')] });
    expect(lease.owner).toBe('review');
    expect(lease.meta).toMatchObject({ run_id: RUN, purpose: 'review' });
    expect(cards[0]).toMatchObject({ slice_id: 's1', owned_paths: [`.shards/review/${RUN}/s1`], acceptance: 'check s1' });
    expect(cards[0].rules).toMatch(/no delegation/);
  });
  it('requires run_id and a valid run_id; run_id is refused for fix', async () => {
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', slices: [slice('s1')] })).rejects.toThrow(/run_id is required/);
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: '../x', slices: [slice('s1')] })).rejects.toThrow(/run_id must match/);
    await expect(fanout.startFanout(sess, { agent: 'ml-engineer', run_id: RUN, slices: [{ id: 'a', paths: ['models/a'], acceptance: 'x' }] })).rejects.toThrow(/only valid with purpose "review"/);
  });
  it('agent needs consult or fanout_worker; researcher is allowed', async () => {
    await expect(fanout.startFanout(sess, { agent: 'nope', purpose: 'review', run_id: RUN, slices: [slice('s1')] })).rejects.toThrow(/unknown agent/);
    const { lease } = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1')] });
    expect(lease.worker_type).toBe('researcher');
  });
  it('every slice path must be inside .shards/review/<run_id>/', async () => {
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1', ['models/a'])] })).rejects.toThrow(/must be inside/);
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1', [`.shards/review/other/s1`])] })).rejects.toThrow(/must be inside/);
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1', [`.shards/review/${RUN}/../../x`])] })).rejects.toThrow();
  });
  it('at most 4 slices per call', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => slice(id));
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: five })).rejects.toThrow(/at most 4/);
  });
  it('at most 16 slices per run_id per session, counting closed leases; other run ids are separate', async () => {
    for (let i = 0; i < 4; i += 1) {
      const { lease } = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: ['a', 'b', 'c', 'd'].map((x) => slice(`${x}${i}`)) });
      if (i === 0) await fanout.collectFanout(sess, lease.id, ['a0', 'b0', 'c0', 'd0'].map((s) => ({ slice_id: s, status: 'REFUTED' })));
    }
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('x')] })).rejects.toThrow(/16 per run_id/);
    const other = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: 'run-2', slices: [slice('x', ['.shards/review/run-2/x'])] });
    expect(other.lease.owner).toBe('review');
  });
  it('refuses a slice that overlaps a slice of another active review lease; allows it once that lease closes', async () => {
    const first = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1')] });
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1b', [`.shards/review/${RUN}/s1/sub`])] })).rejects.toThrow(/overlaps slice "s1"/);
    await fanout.collectFanout(sess, first.lease.id, [{ slice_id: 's1', status: 'REFUTED' }]);
    const again = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1')] });
    expect(again.lease.owner).toBe('review');
  });
  it('pending gate refusal is unchanged for review', async () => {
    const { pushFrame } = require('../runtime/stack');
    const gates = require('../runtime/gates');
    await pushFrame(state, { agent: 'data-analyst', project: 'p' });
    const frame = (state.read('frames').frames || []).slice(-1)[0];
    await gates.requestGate(sess, { frame, id: 'g1', kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
    await expect(fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1')] })).rejects.toThrow(/pending gate/);
  });
});

describe('review leases and enforcement', () => {
  it('do not block another caller: lead writes, unknown-target bash and run-dir writes are allowed', async () => {
    await openReview();
    expect(await hook('Write', { file_path: path.join(tmp, 'docs/readme.md') })).toBeNull();
    expect(await hook('Write', { file_path: path.join(tmp, `.shards/review/${RUN}/s1/x.txt`) })).toBeNull();
    expect(await hook('Bash', { command: 'cd docs && rm a.md' })).toBeNull();
    expect(await hook('Bash', { command: 'sh -c "touch models/x"' })).toBeNull();
  });
  it('a bound verifier is confined to its slice', async () => {
    const l = await openReview();
    expect(await hook(CLAIM, { lease_id: l.id, slice_id: 's1' }, { agent_id: 'v1', agent_type: 'shards:researcher-verify' })).toBeNull();
    expect(await hook('Write', { file_path: path.join(tmp, `.shards/review/${RUN}/s1/repro.py`) }, { agent_id: 'v1' })).toBeNull();
    const d = await hook('Write', { file_path: path.join(tmp, `.shards/review/${RUN}/s2/repro.py`) }, { agent_id: 'v1' });
    expect(denied(d)).toBe(true);
    expect(denied(await hook('Write', { file_path: path.join(tmp, 'src/a.py') }, { agent_id: 'v1' }))).toBe(true);
  });
  it('a verifier with the wrong agent_type cannot claim', async () => {
    const l = await openReview();
    const d = await hook(CLAIM, { lease_id: l.id, slice_id: 's1' }, { agent_id: 'v2', agent_type: 'shards:researcher-worker' });
    expect(denied(d)).toBe(true);
  });
  it('fanout_claim tool returns the review slice card for a verifier', async () => {
    const { lease } = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1')] });
    const r = await call('fanout_claim', { lease_id: lease.id, slice_id: 's1' });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain(`.shards/review/${RUN}/s1`);
  });
});

describe('fanout_collect for review', () => {
  it('CONFIRMED gives NEEDS REVISION with counts and per_slice; is returned with counts', async () => {
    const { lease } = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1'), slice('s2')] });
    const r = await call('fanout_collect', { lease_id: lease.id, results: [{ slice_id: 's1', status: 'CONFIRMED', summary: 'bug', findings: [{ id: 'F1' }] }, { slice_id: 's2', status: 'REFUTED' }] });
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(text(r).split('\n\n').slice(1).join('\n\n'));
    expect(out.verdict).toBe('NEEDS REVISION');
    expect(out.counts).toEqual({ CONFIRMED: 1, PLAUSIBLE: 0, REFUTED: 1 });
    expect(out.per_slice.s1).toMatchObject({ status: 'CONFIRMED', summary: 'bug' });
    expect(out.per_slice.s2.status).toBe('REFUTED');
    expect(L.listActive(sess).find((x) => x.id === lease.id)).toBeUndefined();
  });
  it('an untested PLAUSIBLE is not APPROVED; all REFUTED is', async () => {
    const { lease } = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1'), slice('s2')] });
    const out = await fanout.collectFanout(sess, lease.id, [{ slice_id: 's1', status: 'PLAUSIBLE' }, { slice_id: 's2', status: 'REFUTED' }]);
    expect(out.verdict).toBe('NEEDS REVISION');
    expect(out.counts).toEqual({ CONFIRMED: 0, PLAUSIBLE: 1, REFUTED: 1 });
    const next = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s3')] });
    expect((await fanout.collectFanout(sess, next.lease.id, [{ slice_id: 's3', status: 'REFUTED' }])).verdict).toBe('APPROVED');
  });
  it('rejects a fix-style verdict, a bad status, unknown and missing slices', async () => {
    const { lease } = await fanout.startFanout(sess, { agent: 'researcher', purpose: 'review', run_id: RUN, slices: [slice('s1'), slice('s2')] });
    await expect(fanout.collectFanout(sess, lease.id, [{ slice_id: 's1', status: 'MAYBE' }, { slice_id: 's2', status: 'REFUTED' }])).rejects.toThrow(/invalid status/);
    await expect(fanout.collectFanout(sess, lease.id, [{ slice_id: 's1', status: 'REFUTED' }])).rejects.toThrow(/missing/);
    await expect(fanout.collectFanout(sess, lease.id, [{ slice_id: 'z', status: 'REFUTED' }])).rejects.toThrow(/unknown slice/);
    const r = await call('fanout_collect', { lease_id: lease.id, results: [{ slice_id: 's1', verdict: 'APPROVED' }] });
    expect(r.isError).toBe(true);
  });
  it('fix leases keep the verdict shape', async () => {
    const { lease } = await fanout.startFanout(sess, { agent: 'ml-engineer', slices: [{ id: 'a', paths: ['models/a'], acceptance: 'x' }] });
    const out = await fanout.collectFanout(sess, lease.id, [{ slice_id: 'a', verdict: 'BLOCKED' }]);
    expect(out.verdict).toBe('BLOCKED');
    expect(out.per_slice.a.verdict).toBe('BLOCKED');
  });
});

describe('review_snapshot', () => {
  const snap = (args) => call('review_snapshot', args);
  const body = (r) => JSON.parse(text(r));
  beforeEach(() => {
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src/a.py'), 'x = 1\n');
    fs.writeFileSync(path.join(tmp, 'docs/b.md'), 'hello\n');
  });
  it('start then check is clean when nothing changed', async () => {
    const s = await snap({ action: 'start', run_id: 'r1', paths: ['src', 'docs'] });
    expect(s.isError).toBeFalsy();
    expect(body(await snap({ action: 'check', run_id: 'r1' }))).toEqual({ clean: true, added: [], modified: [], deleted: [] });
  });
  it('detects add, modify and delete; ignores .shards, node_modules and __pycache__', async () => {
    await snap({ action: 'start', run_id: 'r1', paths: ['src', 'docs'] });
    fs.writeFileSync(path.join(tmp, 'src/a.py'), 'x = 2\n');
    fs.writeFileSync(path.join(tmp, 'docs/new.md'), 'new\n');
    fs.unlinkSync(path.join(tmp, 'docs/b.md'));
    fs.mkdirSync(path.join(tmp, 'src/__pycache__'));
    fs.writeFileSync(path.join(tmp, 'src/__pycache__/x.pyc'), 'junk');
    fs.mkdirSync(path.join(tmp, 'src/node_modules'));
    fs.writeFileSync(path.join(tmp, 'src/node_modules/m.js'), 'junk');
    fs.mkdirSync(path.join(tmp, 'src/.shards/review/r1/s1'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'src/.shards/review/r1/s1/t.py'), 'junk');
    const c = body(await snap({ action: 'check', run_id: 'r1' }));
    expect(c.clean).toBe(false);
    expect(c.added).toEqual(['docs/new.md']);
    expect(c.modified).toEqual(['src/a.py']);
    expect(c.deleted).toEqual(['docs/b.md']);
  });
  it('start requires paths; check requires a prior start; run_id is required', async () => {
    expect((await snap({ action: 'start', run_id: 'r9' })).isError).toBe(true);
    expect((await snap({ action: 'check', run_id: 'r9' })).isError).toBe(true);
    expect((await snap({ action: 'start', paths: ['src'] })).isError).toBe(true);
    expect((await snap({ action: 'start', run_id: 'r1', paths: ['../etc'] })).isError).toBe(true);
  });
  it('leaves out excluded paths, in start and check', async () => {
    await snap({ action: 'start', run_id: 'r1', paths: ['.'], exclude: ['docs/'] });
    fs.writeFileSync(path.join(tmp, 'docs/findings.md'), 'new\n');
    fs.writeFileSync(path.join(tmp, 'docs/b.md'), 'changed\n');
    expect(body(await snap({ action: 'check', run_id: 'r1' })).clean).toBe(true);
  });
  it('refuses a second start for the same run_id so the baseline cannot be reset', async () => {
    await snap({ action: 'start', run_id: 'r1', paths: ['src'] });
    fs.writeFileSync(path.join(tmp, 'src/a.py'), 'x = 2\n');
    const again = await snap({ action: 'start', run_id: 'r1', paths: ['src'] });
    expect(again.isError).toBe(true);
    expect(JSON.stringify(again.content)).toContain('already has a baseline');
    expect(body(await snap({ action: 'check', run_id: 'r1' })).modified).toEqual(['src/a.py']);
  });
  it('refuses a path that does not exist rather than reporting it clean', async () => {
    const r = await snap({ action: 'start', run_id: 'r1', paths: ['src', 'srcc'] });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain('srcc');
  });
  it('refuses an exclude that covers a whole snapshot path (it would always check clean)', async () => {
    for (const exclude of [['src'], ['src/'], ['.shards', 'src']]) {
      const r = await snap({ action: 'start', run_id: `rx${exclude.length}${exclude[0].length}`, paths: ['src/a.py', 'docs'], exclude });
      expect(r.isError).toBe(true);
      expect(JSON.stringify(r.content)).toContain('exclude covers');
    }
    expect((await snap({ action: 'start', run_id: 'ok', paths: ['src', 'docs'], exclude: ['src/out'] })).isError).toBeFalsy();
  });
  it('names review_snapshot (not lease) in path errors, and accepts a dangling symlink path', async () => {
    const r = await snap({ action: 'start', run_id: 'r1', paths: ['src'], exclude: ['../x'] });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain('review_snapshot: exclude');
    fs.symlinkSync(path.join(tmp, 'missing-target'), path.join(tmp, 'dangling'));
    expect((await snap({ action: 'start', run_id: 'r2', paths: ['dangling'] })).isError).toBeFalsy();
  });
  it('snapshot state lives under the session state directory', async () => {
    await snap({ action: 'start', run_id: 'r1', paths: ['src'] });
    expect(fs.existsSync(path.join(state.sessionDir, 'review-snapshots', 'r1.json'))).toBe(true);
    expect(review.hashTree(tmp, 'src', {})).toHaveProperty('src/a.py');
  });
});

describe('review snapshot of the project root', () => {
  it('accepts "." and still ignores .shards', () => {
    const fs2 = require('fs'); const os2 = require('os'); const path2 = require('path');
    const r = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'snaproot-'));
    const st = new (require('../runtime/state/store').StateStore)(r, 's1');
    const review = require('../runtime/review');
    fs2.writeFileSync(path2.join(r, 'a.py'), '1');
    review.snapshot(r, st, { action: 'start', run_id: 'root1', paths: ['.'] });
    fs2.mkdirSync(path2.join(r, '.shards/review/root1/x'), { recursive: true });
    fs2.writeFileSync(path2.join(r, '.shards/review/root1/x/t.py'), '2');
    expect(review.snapshot(r, st, { action: 'check', run_id: 'root1' }).clean).toBe(true);
    fs2.writeFileSync(path2.join(r, 'a.py'), '3');
    expect(review.snapshot(r, st, { action: 'check', run_id: 'root1' }).modified).toEqual(['a.py']);
  });
});
