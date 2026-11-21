import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const L = require('../runtime/leases');
const gates = require('../runtime/gates');
const fanout = require('../runtime/fanout');
const { pushFrame } = require('../runtime/stack');
const { StateStore } = require('../runtime/state/store');
const host = require('../hooks/lib/host');
const pre = require('../hooks/pre-tool-use');
const stop = require('../hooks/subagent-stop');
const { compare, extractCounts } = require('../scripts/coupling-ratchet.js');

const SID = '33333333-3333-4333-8333-333333333333';
const CLAIM = 'mcp__plugin_shards_shards__fanout_claim';
let tmp; let st; let sess;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-s5f-'));
  st = new StateStore(tmp, SID);
  sess = { root: tmp, sessionKey: SID, state: st };
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const norm = (tool, input, extra = {}) => host.normalize({ session_id: SID, cwd: tmp, tool_name: tool, tool_input: input, ...extra }, { SHARDS_HOST: 'claude-code' });
const pcall = async (tool, input, extra) => { const o = await pre.handler(norm(tool, input, { hook_event_name: 'PreToolUse', ...extra }), tmp); return o ? JSON.parse(o).hookSpecificOutput : null; };
const W = (file, extra) => pcall('Write', { file_path: path.join(tmp, file), content: 'x' }, extra);
const denied = (o) => !!o && o.permissionDecision === 'deny';
const slices2 = [{ id: 's1', paths: ['models/a'] }, { id: 's2', paths: ['models/b'] }];
const openFan = (extra = {}) => L.openLease(sess, { owner: 'fanout', worker_type: 'ml-engineer', slices: slices2, ...extra });
const bind = (lease, agent, slice) => pcall(CLAIM, { lease_id: lease.id, slice_id: slice }, { agent_id: agent, agent_type: 'shards:ml-engineer' });
const stopCall = (agent) => stop.handler(norm('', {}, { hook_event_name: 'SubagentStop', ...(agent ? { agent_id: agent } : {}) }), tmp);

describe('SubagentStop releases the worker lease binding', () => {
  it('unbinds a fan-out worker, keeps the lease open, frees the slice for a retry', async () => {
    const l = await openFan();
    await bind(l, 'ag1', 's1');
    expect(await W('models/a/x.py', { agent_id: 'ag1' })).toBeNull();
    expect(await stopCall('ag1')).toBe('');
    const after = st.read('leases').leases[l.id];
    expect(after.status).toBe('active');
    expect(after.workers).toEqual({});
    expect(after.released.ag1).toMatchObject({ slice_id: 's1' });
    expect(L.findWorkerLease(sess, 'ag1')).toBeNull();
    expect(await bind(l, 'ag2', 's1')).toBeNull();
    expect(await W('models/a/y.py', { agent_id: 'ag2' })).toBeNull();
  });
  it('does not touch other workers, and is idempotent / harmless for unknown agents', async () => {
    const l = await openFan();
    await bind(l, 'ag1', 's1'); await bind(l, 'ag2', 's2');
    await stopCall('ag1');
    await stopCall('ag1');
    await stopCall('nobody');
    await stopCall(undefined);
    expect(Object.keys(st.read('leases').leases[l.id].workers)).toEqual(['ag2']);
    expect(await W('models/b/z.py', { agent_id: 'ag2' })).toBeNull();
  });
  it('closes a task-owned (single worker) lease outright', async () => {
    const l = await L.openLease(sess, { owner: 'task', worker_type: 'ml-engineer', slices: [{ id: 't1', paths: ['models/t'] }] });
    await bind(l, 'ag9', 't1');
    const r = await L.releaseWorker(sess, 'ag9');
    expect(r).toMatchObject({ released: true, lease_id: l.id, closed: true });
    expect(st.read('leases').leases[l.id].status).toBe('closed');
    expect(L.listActive(sess)).toEqual([]);
  });
  it('runs as a real hook process: exit 0, no output, with and without state', () => {
    const run = () => spawnSync('node', [path.join(ROOT, 'hooks', 'subagent-stop.js')], { input: JSON.stringify({ session_id: SID, cwd: tmp, hook_event_name: 'SubagentStop', agent_id: 'a' }), cwd: tmp, encoding: 'utf8', env: { ...process.env, SHARDS_PROJECT_ROOT: tmp } });
    let r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    fs.mkdirSync(path.dirname(st.file('leases')), { recursive: true });
    fs.writeFileSync(st.file('leases'), '{"leases":{}}');
    r = run();
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
  });
  it('is wired in both hook configs', () => {
    const cc = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'claude-code.hooks.json'), 'utf8'));
    expect(cc.hooks.SubagentStop[0].hooks[0].command).toContain('hooks/subagent-stop.js');
    const cx = JSON.parse(fs.readFileSync(path.join(ROOT, 'hooks', 'codex.hooks.json'), 'utf8'));
    expect(cx.hooks.SubagentStop[0].hooks[0].command).toContain('subagent-stop.js');
  });
});

describe('pending gate policy for subagents (ADR 0011)', () => {
  async function pend() {
    await st.update('frames', () => ({ frames: [{ id: 'f1-syn', agent: 'syn', gates: ['g1'] }] }));
    await st.update('gates', () => ({ gates: { g1: { id: 'g1', frame: 'f1-syn', agent: 'syn', status: 'pending' } } }));
  }
  it('lease-holding worker writes inside its slice; everyone else is blocked by the pending gate', async () => {
    const l = await openFan();
    await bind(l, 'ag1', 's1');
    await pend();
    expect(await W('models/a/ok.py', { agent_id: 'ag1' })).toBeNull();
    expect(denied(await W('models/b/no.py', { agent_id: 'ag1' }))).toBe(true);
    const stranger = await W('notes.md', { agent_id: 'plain-subagent' });
    expect(denied(stranger)).toBe(true);
    expect(stranger.permissionDecisionReason).toContain('g1');
    expect(denied(await W('notes.md'))).toBe(true);
  });
  it('a subagent in an active fan-out that never claimed is blocked like the main agent', async () => {
    await openFan();
    await pend();
    expect(denied(await W('models/a/x.py', { agent_id: 'unclaimed' }))).toBe(true);
  });
  it('a worker that exited (SubagentStop) is subject to the gate again', async () => {
    const l = await openFan();
    await bind(l, 'ag1', 's1');
    await pend();
    expect(await W('models/a/ok.py', { agent_id: 'ag1' })).toBeNull();
    await stopCall('ag1');
    expect(denied(await W('models/a/ok.py', { agent_id: 'ag1' }))).toBe(true);
  });
  it('an expired lease no longer exempts its worker (explicit clock, no real waiting)', async () => {
    const l = await openFan({ ttl_ms: 1000 });
    await bind(l, 'ag1', 's1');
    expect(L.findWorkerLease(sess, 'ag1')).not.toBeNull();
    expect(L.findWorkerLease(sess, 'ag1', Date.now() + 60000)).toBeNull();
  });
});

describe('fanout_start refuses while a gate is suspended', () => {
  const sl = [{ id: 'a', paths: ['models/a/'], acceptance: 'ok a' }];
  const proof = { proof: { tier: 'chat-reply', level: 3 } };
  beforeEach(async () => { await pushFrame(st, { agent: 'data-analyst', project: 'p' }); });
  it('refuses with a clear error naming the gate and opens no lease; works again after resume + close', async () => {
    const frame = st.read('frames').frames.slice(-1)[0];
    await gates.requestGate(sess, { frame, id: 'g1', kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
    await gates.suspendGate(sess, 'g1', proof);
    await expect(fanout.startFanout(sess, { agent: 'ml-engineer', slices: sl })).rejects.toThrow(/suspended.*g1/);
    expect(L.listActive(sess)).toEqual([]);
    await gates.forceCloseGate(sess, 'g1', { reason: 'test' });
    const r = await fanout.startFanout(sess, { agent: 'ml-engineer', slices: sl });
    expect(r.cards).toHaveLength(1);
  });
  it('is also refused for a suspended gate owned by a lower frame', async () => {
    const f1 = st.read('frames').frames.slice(-1)[0];
    await gates.requestGate(sess, { frame: f1, id: 'g1', kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
    await gates.suspendGate(sess, 'g1', proof);
    await pushFrame(st, { agent: 'researcher', project: 'p' });
    await expect(fanout.startFanout(sess, { agent: 'ml-engineer', slices: sl })).rejects.toThrow(/suspended/);
  });
});

describe('coupling-ratchet --update accepts new metrics', () => {
  const base = { a: 3, gate_fences: 2, 'gate_fences.by_kind': { phase: 2 } };
  const cur = { a: 3, gate_fences: 2, 'gate_fences.by_kind': { phase: 2 }, brand_new: 0, other_new: 5 };
  it('a new metric at 0 passes, in both modes', () => {
    const c = { ...cur }; delete c.other_new;
    expect(compare(base, c).ok).toBe(true);
    expect(compare(base, c, { acceptNew: true }).ok).toBe(true);
  });
  it('a new metric with a nonzero count is refused in check mode but recorded on --update', () => {
    expect(compare(base, cur).ok).toBe(false);
    const r = compare(base, cur, { acceptNew: true });
    expect(r.ok).toBe(true);
    expect(r.added.map((x) => x.metric)).toContain('other_new');
  });
  it('acceptNew does not let existing metrics or by_kind sub-keys rise', () => {
    const bad = { ...cur, a: 4, 'gate_fences.by_kind': { phase: 2, final: 1 } };
    const r = compare(base, bad, { acceptNew: true });
    expect(r.ok).toBe(false);
    expect(r.increased.map((x) => x.metric)).toEqual(expect.arrayContaining(['a', 'gate_fences.by_kind.final']));
  });
  it('CLI --update writes a baseline that includes the new metric and exits 0', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-cli-'));
    fs.mkdirSync(path.join(d, 'src/agents'), { recursive: true });
    fs.writeFileSync(path.join(d, 'src/agents/a.md'), 'subagent_type\n');
    const bl = path.join(d, 'baseline.json');
    const cur2 = extractCounts(require('../scripts/coupling-report.js').computeReport({ root: d, roots: ['src'] }));
    const old = { ...cur2 };
    delete old.subagent_type;
    fs.writeFileSync(bl, JSON.stringify(old));
    const run = (args) => spawnSync('node', [path.join(ROOT, 'scripts', 'coupling-ratchet.js'), '--roots', 'src', '--baseline', bl, ...args], { cwd: d, encoding: 'utf8' });
    expect(run([]).status).toBe(1);
    expect(run(['--update']).status).toBe(0);
    expect(JSON.parse(fs.readFileSync(bl, 'utf8')).subagent_type).toBe(cur2.subagent_type);
    expect(run([]).status).toBe(0);
    fs.rmSync(d, { recursive: true, force: true });
  });
});
