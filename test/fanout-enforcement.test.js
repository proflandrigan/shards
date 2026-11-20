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
  it('a write aimed at the project root or an ancestor reaches every slice and is denied', async () => {
    await openTwoSlice();
    for (const command of ['rm -rf .', 'rm -rf ./', 'rm -rf ..', `rm -rf ${tmp}`, 'unzip big.zip', 'tar -xf a.tar']) {
      expect(denied(await call('Bash', { command })), command).toBe(true);
    }
    expect(await call('Bash', { command: 'rm -rf docs' })).toBeNull();
    expect(await call('Bash', { command: `rm -rf ${path.join(os.tmpdir(), 'elsewhere-x')}` })).toBeNull();
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
    // review fixes (PR #72): denylist gaps
    ['git -C . checkout -- .', true, []], ['git -C sub rm a', true, ['sub/a']], ['git -c a=b status', false],
    ['tar -xf x.tgz -C src', true, ['src']], ['tar xzf x.tgz', true, ['.']], ['tar -czf out.tgz src', true, ['out.tgz']], ['tar -tf x.tgz', false],
    ['curl -o a.txt http://x', true, ['a.txt']], ['curl -sSLo a.txt http://x', true, ['a.txt']], ['curl -O http://x/f', true, []], ['curl http://x', false],
    ['wget -O b.txt http://x', true, ['b.txt']], ['wget -O - http://x', false],
    ['find . -name "*.py" -delete', true, []], ['find . -exec touch {} +', true, []], ['find . -name x', false],
    ['awk -i inplace 1 f.txt', true, ['f.txt']], ["awk '{print $1}' f.txt", false],
    ['rsync -a /tmp/x models/a/', true, ['models/a/']], ['rsync -a src/ host:/dst', false],
    ['sh -c "rm x"', true, []], ['bash -c "echo x > f"', true, []], ['curl http://x | bash', true, []], ['eval "$X"', true, []],
    ['cat <(touch x)', true], ['diff <(ls a) <(ls b)', true, []], ['echo $(rm x)', true, ['x']], ['ls $(pwd)', false],
    ['cd models && rm a/x.py', true, []], ['(cd x; rm y)', true, []], ['if true; then rm z; fi', true, ['z']],
    ['python3 train.py', false], ['node models/a/s.js', false], ['npm install', false], ['ls -la; git diff', false],
    // sed/perl in-place: the script (-e/-f values, first operand) is not a target
    ["sed -i -e 's/a/b/' f.txt", true, ['f.txt']], ["sed -i '' 's/a/b/' f.txt", true, ['f.txt']], ["sed -i .bak -e 's/a/b/' -e 's/c/d/' f g", true, ['f', 'g']],
    ["perl -pi -e 's/a/b/' f.txt", true, ['f.txt']], ["perl -i.bak -pe 's/a/b/' x y", true, ['x', 'y']], ['sed -i.bak -f s.sed f', true, ['f']],
    ["sed -i 's/a/b/'", true, []], ["perl -pi -e 's/a/b/'", true, []],
    ['apply_patch <<\'EOF\'\n*** Begin Patch\n*** Update File: a.py\n@@\n-x\n+y\n*** End Patch\nEOF', true, ['a.py']],
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
  it('exec flag: interpreter on a file, package scripts, source', () => {
    for (const c of ['python3 train.py', 'node x.js', 'npm install', 'npm test', 'bash run.sh', 'source env.sh', 'cd a && pytest']) expect(bashWrites(c, T).exec, c).toBe(true);
    for (const c of ['ls', 'git status', 'cat f', 'npm ls', 'grep -r x .']) expect(bashWrites(c, T).exec, c).toBe(false);
    expect(bashWrites('cat <(touch x)', T).unknown).toBe(true); // process substitution: always unknown target
  });
  it('bound worker: write with unknown target is denied; outside-slice bash write denied', async () => {
    const l = await openTwoSlice();
    await bind(l, 'ag1', 's1');
    expect(denied(await call('Bash', { command: 'git commit -am x' }, { agent_id: 'ag1' }))).toBe(true);
    expect(denied(await call('Bash', { command: 'echo a > models/b/f' }, { agent_id: 'ag1' }))).toBe(true);
    expect(await call('Bash', { command: 'echo a > models/a/f && ls' }, { agent_id: 'ag1' })).toBeNull();
    expect(await call('Bash', { command: 'python3 train.py --out /tmp/x' }, { agent_id: 'ag1' })).toBeNull();
    // in-place edits inside the slice: the sed/perl script is not mistaken for a path outside it
    for (const command of ["sed -i -e 's/a/b/' models/a/f.py", "sed -i '' 's/a/b/' models/a/f.py", "perl -pi -e 's/a/b/' models/a/f.py"]) {
      expect(await call('Bash', { command }, { agent_id: 'ag1' }), command).toBeNull();
    }
    expect(denied(await call('Bash', { command: "perl -pi -e 's/a/b/' models/b/f.py" }, { agent_id: 'ag1' }))).toBe(true);
  });
});

describe('review fixes (PR #72): unknown-target writes, exec, apply_patch, notebook tools, path canonicalisation', () => {
  const NB = 'mcp__plugin_shards_shards__notebook_exec';
  it('pending gate: lead exec/unknown-target writes, apply_patch and notebook execution are denied; reads allowed', async () => {
    await pendGate();
    for (const c of ['git -C . checkout -- .', 'tar -xf x.tgz -C src', 'curl -o a.txt http://x', 'find . -delete', 'awk -i inplace 1 f', 'cat <(touch x)', 'python3 train.py', 'sh -c "true"', 'cd src && rm x', 'rsync -a a/ b/']) {
      expect(denied(await call('Bash', { command: c })), c).toBe(true);
    }
    for (const c of ['ls -la', 'cat a', 'git status', 'git diff', 'git log --oneline', 'grep -r x .']) expect(await call('Bash', { command: c }), c).toBeNull();
    expect(denied(await call(NB, { session: 's', cell: 0 }))).toBe(true);
    expect(denied(await call('mcp__plugin_shards_shards__notebook_run_all', { session: 's' }))).toBe(true);
    expect(await call('mcp__plugin_shards_shards__notebook_status', { session: 's' })).toBeNull();
    const cx = (input) => call('apply_patch', input);
    expect(denied(await cx({ input: '*** Begin Patch\n*** Add File: notes.md\n+x\n*** End Patch' }))).toBe(true);
    expect(denied(await cx({ command: ['apply_patch', '*** Begin Patch\n*** Delete File: a\n*** End Patch'] }))).toBe(true);
    expect(denied(await cx({}))).toBe(true);
  });
  it('apply_patch targets are parsed (Add/Update/Delete/Move to); unparseable -> unknown', () => {
    const { writesOf } = require('../hooks/lib/writes');
    const p = '*** Begin Patch\n*** Add File: a.md\n+x\n*** Update File: b.py\n*** Move to: c.py\n@@\n*** Delete File: d.txt\n*** End Patch';
    expect(writesOf({ toolName: 'apply_patch', toolInput: { input: p }, cwd: tmp })).toEqual({ write: true, paths: ['a.md', 'b.py', 'c.py', 'd.txt'].map((f) => path.resolve(tmp, f)), unknown: false, exec: false });
    expect(writesOf({ toolName: 'apply_patch', toolInput: { patch: 'garbage' }, cwd: tmp })).toMatchObject({ write: true, unknown: true, paths: [] });
  });
  it('lead with an active fan-out lease: apply_patch/rsync into a slice denied; unknown target asks on Claude, denied on Codex', async () => {
    await openTwoSlice();
    expect(denied(await call('apply_patch', { input: '*** Begin Patch\n*** Update File: models/a/x.py\n*** End Patch' }))).toBe(true);
    expect(denied(await call('Bash', { command: 'rsync -a /tmp/x models/a/' }))).toBe(true);
    expect(denied(await call('Bash', { command: 'tar -xf x.tgz -C models/b' }))).toBe(true);
    for (const c of ['cd models && rm a/x.py', 'sh -c "rm models/a/x"', 'find models/a -delete']) {
      expect((await call('Bash', { command: c }))?.permissionDecision, c).toBe('ask');
    }
    expect((await call(NB, { session: 's', cell: 0 }))?.permissionDecision).toBe('ask');
    const n = host.normalize({ session_id: SID, cwd: tmp, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'sh -c "rm models/a/x"' } }, { SHARDS_HOST: 'codex' });
    expect(JSON.parse(await handler(n, tmp)).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(await call('Bash', { command: 'python3 train.py' })).toBeNull(); // exec only: no gate pending
    expect(await call('Bash', { command: 'echo x > other.txt' })).toBeNull();
  });
  it('bound worker: may run scripts/tests, but cd-tainted, sh -c and notebook execution writes are denied', async () => {
    const l = await openTwoSlice();
    await bind(l, 'ag1', 's1');
    for (const c of ['node models/a/s.js', 'python3 -m pytest', 'npm test']) expect(await call('Bash', { command: c }, { agent_id: 'ag1' }), c).toBeNull();
    for (const c of ['cd models/b; touch models/a/y', 'sh -c "touch models/a/y"', 'curl -o models/b/f http://x']) expect(denied(await call('Bash', { command: c }, { agent_id: 'ag1' })), c).toBe(true);
    expect(await call('Bash', { command: 'curl -o models/a/f http://x' }, { agent_id: 'ag1' })).toBeNull();
    expect(denied(await call(NB, { session: 's', cell: 0 }, { agent_id: 'ag1' }))).toBe(true);
  });
  it('lead protection resolves symlinks (and case on case-insensitive platforms)', async () => {
    fs.mkdirSync(path.join(tmp, 'models/a'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'models/b'), { recursive: true });
    fs.symlinkSync(path.join(tmp, 'models/a'), path.join(tmp, 'link'));
    const l = await openTwoSlice();
    expect(denied(await W('link/x.py'))).toBe(true);
    expect(denied(await call('Bash', { command: 'rm link/x.py' }))).toBe(true);
    if (process.platform === 'darwin' || process.platform === 'win32') expect(denied(await W('Models/A/x.py'))).toBe(true);
    // a bound worker writing through a symlink inside its slice that points into another slice is denied
    await bind(l, 'ag1', 's1');
    fs.symlinkSync(path.join(tmp, 'models/b'), path.join(tmp, 'models/a/lnk'));
    expect(denied(await W('models/a/lnk/z', { agent_id: 'ag1' }))).toBe(true);
    expect(await W('models/a/ok.py', { agent_id: 'ag1' })).toBeNull();
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

describe('Codex apply_patch with a bare-string tool_input (CX-6)', () => {
  const ADD = '*** Begin Patch\n*** Add File: notes.md\n+x\n*** End Patch';
  const UPD = '*** Begin Patch\n*** Update File: models/a/x.py\n@@\n-x\n+y\n*** End Patch';
  const cx = async (input, extra = {}) => {
    const n = host.normalize({ session_id: SID, cwd: tmp, hook_event_name: 'PreToolUse', turn_id: 't1', tool_name: 'apply_patch', tool_input: input, ...extra }, { SHARDS_HOST: 'codex' });
    const out = await handler(n, tmp);
    return out ? JSON.parse(out).hookSpecificOutput : null;
  };
  it('normalize keeps a string tool_input as {input}; other non-objects still become {}', () => {
    const n = (v) => host.normalize({ tool_name: 'apply_patch', tool_input: v }, { SHARDS_HOST: 'codex' }).toolInput;
    expect(n(ADD)).toEqual({ input: ADD });
    expect(n(undefined)).toEqual({}); expect(n(null)).toEqual({}); expect(n(42)).toEqual({}); expect(n(true)).toEqual({});
    expect(n({ input: ADD })).toEqual({ input: ADD });
  });
  it('every documented payload form yields the parsed paths', () => {
    const { writesOf } = require('../hooks/lib/writes');
    for (const v of [UPD, { input: UPD }, { patch: UPD }, { command: UPD }, { command: ['apply_patch', UPD] }]) {
      const n = host.normalize({ cwd: tmp, tool_name: 'apply_patch', tool_input: v }, { SHARDS_HOST: 'codex' });
      expect(writesOf(n), JSON.stringify(v)).toEqual({ write: true, paths: [path.resolve(tmp, 'models/a/x.py')], unknown: false, exec: false });
    }
  });
  it('pending gate: string apply_patch is denied and the reason names the parsed path', async () => {
    await pendGate();
    const d = await cx(ADD);
    expect(denied(d)).toBe(true);
    expect(d.permissionDecisionReason).toContain('gate g1 is pending');
    expect(d.permissionDecisionReason).toContain('notes.md');
  });
  it('fan-out lease: lead string apply_patch into a worker slice is a known-path slice violation', async () => {
    const l = await openTwoSlice();
    await bind(l, 'ag1', 's1');
    const d = await cx(UPD);
    expect(denied(d)).toBe(true);
    expect(d.permissionDecisionReason).toMatch(/models[\\/]a[\\/]x\.py is inside slice owned by worker s1/); // Windows reports backslashes
    expect(d.permissionDecisionReason).not.toContain('could not be determined');
  });
  it('no gate, patch outside any slice: allowed', async () => {
    await openTwoSlice();
    expect(await cx('*** Begin Patch\n*** Add File: docs/notes.md\n+x\n*** End Patch')).toBeNull();
    fs.rmSync(path.join(tmp, '.shards'), { recursive: true, force: true });
    expect(await cx(ADD)).toBeNull();
  });
  it('spawned hook: string apply_patch denied under a gate; malformed/missing input still fails open', async () => {
    const e = { ...process.env, SHARDS_HOST: 'codex' };
    for (const k of ['CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT', 'CLAUDECODE', 'SHARDS_PROJECT_ROOT', 'SHARDS_GATE_ENFORCE']) delete e[k];
    const run = (input) => spawnSync('node', [SHIM], { input, cwd: tmp, env: e, encoding: 'utf8' });
    const base = { session_id: SID, cwd: tmp, hook_event_name: 'PreToolUse', turn_id: 't1' };
    await pendGate();
    const r = run(JSON.stringify({ ...base, tool_name: 'apply_patch', tool_input: ADD }));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).hookSpecificOutput).toMatchObject({ permissionDecision: 'deny' });
    expect(r.stdout).toContain('notes.md');
    for (const raw of ['{not json', '', 'null', JSON.stringify({ ...base, tool_name: 'Read' }), JSON.stringify({ ...base, tool_name: 'Read', tool_input: 42 })]) {
      const q = run(raw);
      expect(q.status, raw).toBe(0);
      expect(q.stdout, raw).toBe('');
    }
  });
});
