import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const SHIM = path.join(ROOT, 'hooks', 'pre-tool-use.js');
const L = require('../runtime/leases');
const { StateStore } = require('../runtime/state/store');
const host = require('../hooks/lib/host');
const { handler } = require('../hooks/pre-tool-use');
const { bashWrites } = require('../hooks/lib/writes');
const { startLeaseSweep } = require('../runtime/server');

const SID = '22222222-2222-4222-8222-222222222222';
const CLAIM = 'mcp__plugin_shards_shards__fanout_claim';
let tmp; let sess;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-fan-'));
  sess = { root: tmp, sessionKey: SID };
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); delete process.env.SHARDS_GATE_ENFORCE; });

const call = async (tool, input, extra = {}) => {
  const n = host.normalize({ session_id: SID, cwd: tmp, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, ...extra }, { SHARDS_HOST: 'claude-code' });
  const out = await handler(n, tmp);
  return out ? JSON.parse(out).hookSpecificOutput : null;
};
const denied = (o) => !!o && o.permissionDecision === 'deny';
const W = (file, extra) => call('Write', { file_path: path.join(tmp, file), content: 'x' }, extra);

async function openTwoSlice(ttl_ms) {
  return L.openLease(sess, { owner: 'fanout', worker_type: 'ml-engineer', ttl_ms, slices: [{ id: 's1', paths: ['models/a'] }, { id: 's2', paths: ['models/b'] }] });
}
async function bind(lease, agent, slice, type = 'shards:ml-engineer') {
  return call(CLAIM, { lease_id: lease.id, slice_id: slice }, { agent_id: agent, agent_type: type });
}
async function pendGate() {
  const st = new StateStore(tmp, SID);
  await st.update('frames', () => ({ frames: [{ id: 'f1-syn', agent: 'syn', gates: ['g1'] }] }));
  await st.update('gates', () => ({ gates: { g1: { id: 'g1', frame: 'f1-syn', agent: 'syn', status: 'pending' } } }));
}

describe('worker bound to a slice', () => {
  it('blocks writes outside slice, allows inside', async () => {
    const l = await openTwoSlice();
    expect(await bind(l, 'ag1', 's1')).toBeNull();
    expect(await W('models/a/train.py', { agent_id: 'ag1' })).toBeNull();
    const d = await W('models/b/x.py', { agent_id: 'ag1' });
    expect(denied(d)).toBe(true);
    expect(d.permissionDecisionReason).toContain('s1');
    expect(denied(await W('src/z.js', { agent_id: 'ag1' }))).toBe(true);
    expect(denied(await call('Edit', { file_path: path.join(tmp, 'models/b/x'), old_string: 'a', new_string: 'b' }, { agent_id: 'ag1' }))).toBe(true);
    expect(denied(await call('NotebookEdit', { notebook_path: path.join(tmp, 'models/b/n.ipynb') }, { agent_id: 'ag1' }))).toBe(true);
  });
  it('keeps running with a gate pending; unleased subagent and main session cannot write', async () => {
    const l = await openTwoSlice();
    await bind(l, 'ag1', 's1');
    await pendGate();
    expect(await W('models/a/ok.py', { agent_id: 'ag1' })).toBeNull();
    expect(denied(await W('models/c/u.py', { agent_id: 'unleased' }))).toBe(true);
    expect(denied(await W('notes.md'))).toBe(true);
    expect((await W('notes.md')).permissionDecisionReason).toContain('g1');
    expect(denied(await call('Bash', { command: 'echo hi > out.txt' }))).toBe(true);
    // reads and non-write tools pass
    expect(await call('Read', { file_path: path.join(tmp, 'a') })).toBeNull();
    expect(await call('Bash', { command: 'ls -la && cat a | grep x' })).toBeNull();
    expect(await call('mcp__other__thing', {})).toBeNull();
  });
  it('claim works with a gate pending', async () => {
    const l = await openTwoSlice();
    await pendGate();
    expect(await bind(l, 'ag1', 's1')).toBeNull();
    expect(await W('models/a/ok.py', { agent_id: 'ag1' })).toBeNull();
  });
  it('heartbeats the lease when a bound worker acts', async () => {
    const l = await openTwoSlice(20000);
    await bind(l, 'ag1', 's1');
    const st = new StateStore(tmp, SID);
    const old = new Date(Date.now() - 6000).toISOString();
    const cur = st.read('leases'); cur.leases[l.id].heartbeat_at = old; cur.leases[l.id].expires_at = new Date(Date.now() + 14000).toISOString();
    fs.writeFileSync(st.file('leases'), JSON.stringify(cur));
    await W('models/a/x.py', { agent_id: 'ag1' });
    const after = st.read('leases').leases[l.id];
    expect(Date.parse(after.expires_at)).toBeGreaterThan(Date.now() + 19000);
  });
});

describe('lead / unbound caller', () => {
  it('blocked inside a leased slice, allowed outside', async () => {
    const l = await openTwoSlice();
    const d = await W('models/a/file.py');
    expect(denied(d)).toBe(true);
    expect(d.permissionDecisionReason).toContain('slice owned by worker s1');
    expect(denied(await call('Bash', { command: 'rm -rf models/b' }))).toBe(true);
    expect(await W('docs/readme.md')).toBeNull();
    expect(await call('Read', { file_path: path.join(tmp, 'models/a/f') })).toBeNull();
    await L.closeLease(sess, l.id);
    expect(await W('models/a/file.py')).toBeNull();
  });
  it('codex (no agent_id) is treated as unbound', async () => {
    await openTwoSlice();
    expect(denied(await W('models/a/f.py'))).toBe(true);
  });
});

describe('crash recovery', () => {
  it('expired lease frees paths and worker restriction', async () => {
    const l = await openTwoSlice(1000);
    await bind(l, 'ag1', 's1');
    const later = Date.now() + 5000;
    expect(L.findWorkerLease(sess, 'ag1', later)).toBeNull();
    expect(await L.expireStale(sess, later)).toEqual([l.id]);
    const { getLeasedPaths } = require('../runtime/git/leases');
    expect(await getLeasedPaths(sess)).toEqual([]);
    // expiry is real-time in the hook: age the lease on disk, then the lazy sweep frees it
    const st = new StateStore(tmp, SID);
    const cur = st.read('leases'); cur.leases[l.id] = { ...cur.leases[l.id], status: 'active', expires_at: new Date(Date.now() - 1000).toISOString() };
    fs.writeFileSync(st.file('leases'), JSON.stringify(cur));
    expect(await W('models/a/x.py', { agent_id: 'ag1' })).toBeNull();
    expect(await W('src/anything.js', { agent_id: 'ag1' })).toBeNull();
    expect(st.read('leases').leases[l.id].status).toBe('expired');
  });
});

describe('SHARDS_GATE_ENFORCE=0', () => {
  it('disables denies but binding still records', async () => {
    const l = await openTwoSlice();
    await pendGate();
    process.env.SHARDS_GATE_ENFORCE = '0';
    expect(await W('models/a/f.py')).toBeNull();
    expect(await bind(l, 'ag1', 's1')).toBeNull();
    expect(await W('src/out.js', { agent_id: 'ag1' })).toBeNull();
    expect(L.findWorkerLease(sess, 'ag1')).not.toBeNull();
    expect(await bind(l, 'ag1', 'nope')).toBeNull();
  });
});

describe('fanout_claim binding', () => {
  it('success, wrong slice, over slice count, agent_type mismatch', async () => {
    const l = await openTwoSlice();
    expect(await bind(l, 'ag1', 's1')).toBeNull();
    expect(await bind(l, 'ag1', 's1')).toBeNull(); // idempotent
    expect(L.findWorkerLease(sess, 'ag1').slice.id).toBe('s1');
    const wrong = await bind(l, 'ag2', 'nope');
    expect(denied(wrong)).toBe(true); expect(wrong.permissionDecisionReason).toContain('no slice nope');
    expect(denied(await bind(l, 'ag2', 's1'))).toBe(true); // slice taken
    expect(denied(await bind(l, 'ag1', 's2'))).toBe(true); // agent already bound elsewhere
    expect(await bind(l, 'ag2', 's2')).toBeNull();
    expect(denied(await bind(l, 'ag3', 's2'))).toBe(true);
    const l2 = await openTwoSlice();
    expect(denied(await bind(l2, 'ag9', 's1', 'shards:data-analyst'))).toBe(true);
    expect(await bind(l2, 'ag9', 's1', 'ML-Engineer')).toBeNull();
    expect(denied(await bind({ id: 'lease-missing' }, 'ag9', 's1'))).toBe(true);
  });
  it('bindWorker over slice count directly, one-slice lease', async () => {
    const l = await L.openLease(sess, { owner: 'task', worker_type: 'x', slices: [{ id: 'only', paths: ['p'] }] });
    await L.bindWorker(sess, { agentId: 'a', leaseId: l.id, sliceId: 'only' });
    await expect(L.bindWorker(sess, { agentId: 'b', leaseId: l.id, sliceId: 'only' })).rejects.toThrow();
    expect(L.isPathAllowed(sess, 'a', 'p/f').allowed).toBe(true);
    expect(L.isPathAllowed(sess, 'a', 'q/f').allowed).toBe(false);
  });
});

describe('bash write detection', () => {
  const T = path.join(os.tmpdir(), 'cwd');
  const table = [
    ['ls -la', false], ['cat a.txt | grep x', false], ['git status', false], ['git log --oneline', false],
    ['echo hi > out.txt', true, ['out.txt']], ['echo hi >> out.txt', true, ['out.txt']], ['echo hi 2>/dev/null', false],
    ['ls 2>&1 | head', false], ['cmd &> log.txt', true, ['log.txt']],
    ['cat a | tee b.txt', true, ['b.txt']], ['sed -i s/a/b/ f.txt', true, ['f.txt']], ['sed -n 1p f.txt', false],
    ['mv a b', true, ['a', 'b']], ['cp a b', true, ['b']], ['rm -rf d', true, ['d']], ['touch x y', true, ['x', 'y']],
    ['mkdir -p a/b', true, ['a/b']], ['git commit -m x', true, []], ['git apply p.diff', true, []], ['git checkout -- f', true, []],
    ['python3 -c "open(\'f\',\'w\').write(1)"', true, []], ['node -e "require(\'fs\').writeFileSync(\'f\',1)"', true, []],
    ['python3 -c "print(1)"', false], ['cat <<EOF > f.txt\nhello > not-a-target\nEOF', true, ['f.txt']],
    ['cd x && echo a > $OUT', true, []], ['echo "a > b"', false], ['FOO=1 rm f', true, ['f']],
  ];
  for (const [cmd, w, paths] of table) {
    it(JSON.stringify(cmd), () => {
      const r = bashWrites(cmd, T);
      expect(r.write).toBe(w);
      if (paths) {
        expect(r.paths).toEqual(paths.map((p) => path.resolve(T, p)));
        expect(r.unknown).toBe(paths.length === 0 && w);
      }
    });
  }
  it('bound worker: write with unknown target is denied; outside-slice bash write denied', async () => {
    const l = await openTwoSlice();
    await bind(l, 'ag1', 's1');
    expect(denied(await call('Bash', { command: 'git commit -am x' }, { agent_id: 'ag1' }))).toBe(true);
    expect(denied(await call('Bash', { command: 'echo a > models/b/f' }, { agent_id: 'ag1' }))).toBe(true);
    expect(await call('Bash', { command: 'echo a > models/a/f && ls' }, { agent_id: 'ag1' })).toBeNull();
    expect(await call('Bash', { command: 'python3 train.py --out /tmp/x' }, { agent_id: 'ag1' })).toBeNull();
  });
});

describe('end to end spawn', () => {
  function run(payload) {
    const e = { ...process.env, SHARDS_HOST: 'claude-code' };
    for (const k of ['CLAUDE_PROJECT_DIR', 'SHARDS_PROJECT_ROOT', 'SHARDS_GATE_ENFORCE']) delete e[k];
    return spawnSync('node', [SHIM], { input: JSON.stringify({ session_id: SID, cwd: tmp, hook_event_name: 'PreToolUse', ...payload }), cwd: tmp, env: e, encoding: 'utf8' });
  }
  it('emits deny JSON for a lead write in a slice; empty on fast path', async () => {
    const quiet = run({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'a.txt') } });
    expect(quiet.status).toBe(0); expect(quiet.stdout).toBe('');
    expect(fs.existsSync(path.join(tmp, '.shards'))).toBe(false);
    await openTwoSlice();
    const r = run({ tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'models/a/x.py') } });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' });
  });
  it('claim then scoped write via spawn', async () => {
    const l = await openTwoSlice();
    const c = run({ tool_name: CLAIM, tool_input: { lease_id: l.id, slice_id: 's2' }, agent_id: 'w', agent_type: 'shards:ml-engineer' });
    expect(c.stdout).toBe('');
    expect(run({ tool_name: 'Write', agent_id: 'w', tool_input: { file_path: path.join(tmp, 'models/b/x') } }).stdout).toBe('');
    expect(run({ tool_name: 'Write', agent_id: 'w', tool_input: { file_path: path.join(tmp, 'models/a/x') } }).stdout).toContain('deny');
  });
});

describe('lease sweep timer', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('uses an unref()d interval, expires stale leases, stops cleanly', async () => {
    const l = await openTwoSlice(1);
    // Deterministic: advance only the clock (not timers) past the 1ms TTL instead of a real 10ms sleep,
    // which depended on timer and ISO-millisecond granularity under load.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 60000 });
    let fn; const handle = { unref: vi.fn() }; const clear = vi.fn();
    const sw = startLeaseSweep({ root: tmp, ms: 30000, setIntervalFn: (f, ms) => { fn = f; expect(ms).toBe(30000); return handle; }, clearIntervalFn: clear });
    expect(handle.unref).toHaveBeenCalled();
    fn();
    await sw.sweep();
    expect(new StateStore(tmp, SID).read('leases').leases[l.id].status).toBe('expired');
    vi.useRealTimers();
    sw.stop(); expect(clear).toHaveBeenCalledWith(handle);
    expect(startLeaseSweep({ root: tmp, ms: 0, setIntervalFn: () => { throw new Error('no'); } }).sweep).toBeTypeOf('function');
  });
});
