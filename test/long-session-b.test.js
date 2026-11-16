// Long-session scenario tests, part B (E11 hooks/runtime): multi-session isolation, leased vs unleased
// workers during a pending gate, auto-verify lifecycle, violation logging, permission modes.
// Invariants asserted throughout: false blocks = 0, cross-session leaks = 0.
//
// Ported from v-legacy (tools/gate-hook/__tests__/auto-verify.test.js, test/gate-hook.test.js), as
// runtime-API scenarios rather than transcript/fence replays:
//   - cross-session isolation (A's open gate does not block B; B's actions do not touch A)
//   - atomic state writes (no partial JSON, no straggler tmp files) incl. real concurrent processes
//   - auto-verify: budget exhaustion, TTL expiry, SELECT-only SQL vs write SQL, compound/destructive
//     veto, gates-win, force-close resets the block, Write never auto-approved, per-session scoping
//   - gate-open blocks Write/Edit/Bash but not Read/Glob/Grep; gate closed allows everything
//   - violation log + force-close operator log (session id recorded)
//   - lease sweep/expiry standing in for the legacy "stale gate sweep"
// Deliberately dropped (covered elsewhere or gone with the transcript-based hook; legacy formats ->
// E11.11): ::GATE:: fence parsing + post-fence violations, ::AUTO-VERIFY::/::ENDAUTO:: marker
// parsing and transcript shapes, reply classification (confirm/deny/ambiguous), Stop-hook handling,
// v1/v2 legacy state formats and __legacy__ slots, kind taxonomy normalisation, isForceCloseBash,
// SHARDS_AUTO_VERIFY=0 and the .shards/auto/history.jsonl audit log, 24h gate staleness sweep.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const SHIM = path.join(ROOT, 'hooks', 'pre-tool-use.js');
const L = require('../runtime/leases');
const av = require('../runtime/auto-verify');
const gates = require('../runtime/gates');
const operator = require('../runtime/gates/operator');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const host = require('../hooks/lib/host');
const { handler } = require('../hooks/pre-tool-use');
const gatesCli = require('../cli/commands/gates');

const SA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const SB = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const CLAIM = 'mcp__plugin_shards_shards__fanout_claim';
let tmp; let OLD_HOME; let home;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-lsb-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-lsbh-'));
  OLD_HOME = process.env.HOME; process.env.HOME = home;
});
afterEach(() => {
  process.env.HOME = OLD_HOME;
  delete process.env.SHARDS_GATE_ENFORCE;
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

const sessOf = (sid) => ({ root: tmp, sessionKey: host.toSessionKey(sid), state: new StateStore(tmp, host.toSessionKey(sid)) });
async function call(sid, tool, input, extra = {}) {
  const n = host.normalize({ session_id: sid, cwd: tmp, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, ...extra }, { SHARDS_HOST: 'claude-code' });
  const out = await handler(n, tmp);
  return out ? JSON.parse(out).hookSpecificOutput : null;
}
const denied = (o) => !!o && o.permissionDecision === 'deny';
const allowed = (o) => !!o && o.permissionDecision === 'allow';
const W = (sid, file, extra) => call(sid, 'Write', { file_path: path.join(tmp, file), content: 'x' }, extra);
const BASH = (sid, command, extra) => call(sid, 'Bash', { command }, extra);

async function openFrame(sid, agent = 'data-analyst') {
  const s = sessOf(sid);
  await pushFrame(s.state, { agent, project: 'p' });
  return s;
}
async function pend(sid, id = 'g1', agent = 'data-analyst') {
  const s = await openFrame(sid, agent);
  const frame = s.state.read('frames').frames.slice(-1)[0];
  await gates.requestGate(s, { frame, id, kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
  return s;
}
const gateStatus = (sid, id) => (gates.getGate(sessOf(sid), id) || {}).status;
const tmpFiles = (dir) => {
  const out = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tmp$/.test(e.name)) out.push(p); } };
  if (fs.existsSync(dir)) walk(dir);
  return out;
};
function readAllJson(dir) {
  const bad = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.json')) { try { JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { bad.push(p); } } } };
  walk(dir);
  return bad;
}
function runShim(sid, payload) {
  return new Promise((resolve) => {
    const e = { ...process.env, SHARDS_HOST: 'claude-code' };
    for (const k of ['CLAUDE_PROJECT_DIR', 'SHARDS_PROJECT_ROOT', 'SHARDS_GATE_ENFORCE']) delete e[k];
    const c = spawn('node', [SHIM], { cwd: tmp, env: e });
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.on('close', (code) => resolve({ code, out }));
    c.stdin.end(JSON.stringify({ session_id: sid, cwd: tmp, hook_event_name: 'PreToolUse', ...payload }));
  });
}

describe('1. two concurrent sessions, same root', () => {
  it('A pending gate never blocks B across an interleaved 40-step run', async () => {
    await pend(SA);
    await openFrame(SB, 'data-scientist');
    let falseBlocks = 0; let leaks = 0;
    for (let i = 0; i < 20; i++) {
      if (!denied(await W(SA, `a${i}.md`))) leaks++; // A must stay blocked
      if (denied(await W(SB, `b${i}.md`))) falseBlocks++;
      if (denied(await BASH(SB, `echo ${i} > b${i}.txt`))) falseBlocks++;
      if (denied(await BASH(SA, `echo ${i} > a${i}.txt`)) !== true) leaks++;
      expect(await call(SA, 'Read', { file_path: path.join(tmp, 'x') })).toBeNull();
    }
    expect(falseBlocks).toBe(0);
    expect(leaks).toBe(0);
    expect(gateStatus(SA, 'g1')).toBe('pending');
  });

  it("B's gate lifecycle (request, confirm, force-close) never touches A", async () => {
    const a = await pend(SA, 'ga');
    const b = await pend(SB, 'gb');
    expect(denied(await W(SB, 'f'))).toBe(true);
    await operator.forceClose(tmp, host.toSessionKey(SB), 'all', { actor: 'op', via: 'operator-cli' });
    expect(gateStatus(SB, 'gb')).toBe('force_closed');
    expect(await W(SB, 'f')).toBeNull();
    // A untouched
    expect(gateStatus(SA, 'ga')).toBe('pending');
    expect(denied(await W(SA, 'f'))).toBe(true);
    // B re-requests, confirms via operator proof; A still pending
    const frameB = b.state.read('frames').frames.slice(-1)[0];
    await gates.requestGate(b, { frame: frameB, id: 'gb', kind: 'phase', phase: 1, summary: 's2', record_ref: 'x.md' });
    expect(denied(await W(SB, 'g'))).toBe(true);
    await gates.confirmGate(b, 'gb', { decision: 'confirmed', proof: { tier: 'operator-cli' } }).catch(() => {});
    expect(gates.getGate(a, 'ga').status).toBe('pending');
    expect(denied(await W(SA, 'g'))).toBe(true);
    // operator force-close scoped to session B must not log or affect A
    const log = operator.readJsonl(operator.operatorLogFile(tmp));
    expect(log.every((r) => r.session === host.toSessionKey(SB))).toBe(true);
  });

  it('auto-verify in B is invisible to A and vice versa; A pending gate does not end B block', async () => {
    await pend(SA);
    const b = await openFrame(SB);
    await av.start(b, { agent: 'data-analyst', phase: 1, tool_budget: 10, ttl_s: 60 });
    expect(allowed(await call(SB, 'Read', { file_path: 'x' }))).toBe(true);
    expect(await call(SA, 'Read', { file_path: 'x' })).toBeNull();
    expect(await call(SA, 'Bash', { command: 'git status' })).toBeNull();
    expect(allowed(await call(SB, 'Bash', { command: 'git status' }))).toBe(true);
    expect(av.get(sessOf(SA)).active).toBeFalsy();
    expect(av.get(b)).toMatchObject({ active: true, used: 2 });
    // force-close in A (resets A's auto-verify, which has none) must not end B's block
    await operator.forceClose(tmp, host.toSessionKey(SA), 'all', { actor: 'op', via: 'operator-cli' });
    expect(av.get(b).active).toBe(true);
    expect(allowed(await call(SB, 'Grep', { pattern: 'x' }))).toBe(true);
  });

  it('concurrent state writes from many processes: valid JSON, no tmp files, no lost updates', async () => {
    const script = `
      const { StateStore } = require(${JSON.stringify(path.join(ROOT, 'runtime/state/store.js'))});
      (async () => {
        const [root, key, n] = process.argv.slice(1);
        const st = new StateStore(root, key);
        for (let i = 0; i < Number(n); i++) await st.update('counter', (c) => ({ n: (c.n || 0) + 1 }));
      })().catch((e) => { console.error(e); process.exit(1); });`;
    const procs = [[SA, 8], [SA, 8], [SB, 8], [SB, 8]].map(([sid, n]) => new Promise((resolve) => {
      const c = spawn(process.execPath, ['-e', script, tmp, host.toSessionKey(sid), String(n)]);
      let err = ''; c.stderr.on('data', (d) => { err += d; });
      c.on('close', (code) => resolve({ code, err }));
    }));
    const res = await Promise.all(procs);
    for (const r of res) expect(r, r.err).toMatchObject({ code: 0 });
    expect(sessOf(SA).state.read('counter').n).toBe(16);
    expect(sessOf(SB).state.read('counter').n).toBe(16);
    expect(sessOf(SA).state.getVersion()).toBe(16);
    expect(tmpFiles(path.join(tmp, '.shards'))).toEqual([]);
    expect(readAllJson(path.join(tmp, '.shards'))).toEqual([]);
  }, 60000);

  it('in-process Promise.all updates across both sessions and readers never see partial JSON', async () => {
    const a = sessOf(SA); const b = sessOf(SB);
    let stop = false; let bad = 0;
    const reader = (async () => {
      while (!stop) {
        for (const s of [a, b]) { try { s.state.read('counter'); } catch (_) { bad++; } }
        await new Promise((r) => setImmediate(r));
      }
    })();
    await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? a : b).state.update('counter', (c) => ({ n: (c.n || 0) + 1 }))));
    stop = true; await reader;
    expect(bad).toBe(0);
    expect(a.state.read('counter').n).toBe(15);
    expect(b.state.read('counter').n).toBe(15);
    expect(tmpFiles(path.join(tmp, '.shards'))).toEqual([]);
  });

  it('concurrent real hook processes for A and B give per-session verdicts', async () => {
    await pend(SA);
    await openFrame(SB);
    const jobs = [];
    for (let i = 0; i < 6; i++) {
      jobs.push(['A', runShim(SA, { tool_name: 'Write', tool_input: { file_path: path.join(tmp, `a${i}`) } })]);
      jobs.push(['B', runShim(SB, { tool_name: 'Write', tool_input: { file_path: path.join(tmp, `b${i}`) } })]);
    }
    const results = await Promise.all(jobs.map(async ([who, p]) => [who, await p]));
    for (const [who, r] of results) {
      expect(r.code).toBe(0);
      if (who === 'A') expect(r.out).toContain('"deny"'); else expect(r.out).toBe('');
    }
  }, 60000);
});

describe('2. leased vs unleased workers in a long session', () => {
  async function openLeases(sid, ttl_ms) {
    return L.openLease(sessOf(sid), { owner: 'fanout', worker_type: 'ml-engineer', ttl_ms, slices: [{ id: 's1', paths: ['models/a'] }, { id: 's2', paths: ['models/b'] }] });
  }
  const bind = (sid, lease, agent, slice) => call(sid, CLAIM, { lease_id: lease.id, slice_id: slice }, { agent_id: agent, agent_type: 'shards:ml-engineer' });
  const age = (sid, id, ms) => {
    const st = sessOf(sid).state; const cur = st.read('leases');
    cur.leases[id] = { ...cur.leases[id], heartbeat_at: new Date(Date.now() - 6000).toISOString(), expires_at: new Date(Date.now() + ms).toISOString() };
    fs.writeFileSync(st.file('leases'), JSON.stringify(cur));
  };

  it('long run: bound workers keep writing in-slice under a pending gate; everyone else blocked', async () => {
    const lease = await openLeases(SA);
    await bind(SA, lease, 'w1', 's1'); await bind(SA, lease, 'w2', 's2');
    await pend(SA);
    let falseBlocks = 0; let leaks = 0;
    for (let i = 0; i < 15; i++) {
      if (denied(await W(SA, `models/a/f${i}.py`, { agent_id: 'w1' }))) falseBlocks++;
      if (denied(await W(SA, `models/b/f${i}.py`, { agent_id: 'w2' }))) falseBlocks++;
      if (denied(await BASH(SA, `echo ${i} > models/a/o${i}.txt`, { agent_id: 'w1' }))) falseBlocks++;
      if (!denied(await W(SA, `models/b/x${i}.py`, { agent_id: 'w1' }))) leaks++; // out of slice
      if (!denied(await W(SA, `other/x${i}.py`, { agent_id: 'bg-unleased' }))) leaks++; // unleased subagent
      if (!denied(await W(SA, `notes${i}.md`))) leaks++; // lead
      if (!denied(await W(SA, `models/a/lead${i}.py`))) leaks++; // lead into a leased slice
    }
    expect(falseBlocks).toBe(0);
    expect(leaks).toBe(0);
    // reads for everyone
    for (const agent of [undefined, 'w1', 'bg-unleased']) expect(await call(SA, 'Read', { file_path: 'x' }, agent ? { agent_id: agent } : {})).toBeNull();
  });

  it("A's leases and gate never restrict session B (same paths, same agent ids)", async () => {
    const lease = await openLeases(SA);
    await bind(SA, lease, 'w1', 's1');
    await pend(SA);
    await openFrame(SB);
    expect(denied(await W(SA, 'models/a/lead.py'))).toBe(true);
    expect(await W(SB, 'models/a/lead.py')).toBeNull();
    expect(await W(SB, 'models/b/x.py', { agent_id: 'w1' })).toBeNull(); // w1 is only bound in A
    expect(await W(SB, 'src/x.js', { agent_id: 'other' })).toBeNull();
    expect(L.findWorkerLease(sessOf(SB), 'w1')).toBeNull();
  });

  it('lease expiry mid-session: worker loses its slice, falls under the gate; lead regains the slice', async () => {
    const lease = await openLeases(SA, 60000);
    await bind(SA, lease, 'w1', 's1');
    await pend(SA);
    expect(await W(SA, 'models/a/ok.py', { agent_id: 'w1' })).toBeNull();
    expect(denied(await W(SA, 'models/a/lead.py'))).toBe(true);
    age(SA, lease.id, -1000);
    const d = await W(SA, 'models/a/after.py', { agent_id: 'w1' });
    expect(denied(d)).toBe(true);
    expect(d.permissionDecisionReason).toContain('g1'); // now blocked by the gate, not by the slice
    expect(sessOf(SA).state.read('leases').leases[lease.id].status).toBe('expired');
    // confirming the gate frees everybody (expired lease no longer owns the path)
    await operator.forceClose(tmp, host.toSessionKey(SA), 'all', { actor: 'op', via: 'operator-cli' });
    expect(await W(SA, 'models/a/lead.py')).toBeNull();
    expect(await W(SA, 'anything.js', { agent_id: 'w1' })).toBeNull();
  });

  it('heartbeat from worker activity keeps a short lease alive across many calls', async () => {
    const lease = await openLeases(SA, 20000);
    await bind(SA, lease, 'w1', 's1');
    for (let i = 0; i < 5; i++) {
      age(SA, lease.id, 3000); // about to lapse...
      expect(await W(SA, `models/a/f${i}.py`, { agent_id: 'w1' })).toBeNull(); // ...touch renews it
      expect(Date.parse(sessOf(SA).state.read('leases').leases[lease.id].expires_at)).toBeGreaterThan(Date.now() + 15000);
    }
    expect(L.findWorkerLease(sessOf(SA), 'w1')).not.toBeNull();
  });

  it('background agents (agent_id set) are not blocked when no gate/lease applies, only by their own rules', async () => {
    await openFrame(SA);
    for (let i = 0; i < 5; i++) {
      expect(await W(SA, `out/bg${i}.md`, { agent_id: `bg${i}` })).toBeNull();
      expect(await BASH(SA, 'ls && cat a | grep x', { agent_id: `bg${i}` })).toBeNull();
    }
    // a lease only restricts its own slice paths; bg agents elsewhere stay free
    const lease = await openLeases(SA);
    await bind(SA, lease, 'w1', 's1');
    expect(await W(SA, 'out/free.md', { agent_id: 'bg9' })).toBeNull();
    expect(denied(await W(SA, 'models/b/f.py', { agent_id: 'bg9' }))).toBe(true); // slice owned by another worker
    // closing the lease frees the slice for the bg agent
    await L.closeLease(sessOf(SA), lease.id);
    expect(await W(SA, 'models/b/f.py', { agent_id: 'bg9' })).toBeNull();
    expect(await W(SA, 'models/a/f.py', { agent_id: 'w1' })).toBeNull(); // closed lease: no restriction left
  });

  it('SHARDS_GATE_ENFORCE=0 turns off every deny for both sessions mid-run, and re-enables cleanly', async () => {
    const lease = await openLeases(SA);
    await bind(SA, lease, 'w1', 's1');
    await pend(SA);
    expect(denied(await W(SA, 'n.md'))).toBe(true);
    process.env.SHARDS_GATE_ENFORCE = '0';
    expect(await W(SA, 'n.md')).toBeNull();
    expect(await W(SA, 'models/b/x', { agent_id: 'w1' })).toBeNull();
    delete process.env.SHARDS_GATE_ENFORCE;
    expect(denied(await W(SA, 'n.md'))).toBe(true);
    expect(denied(await W(SA, 'models/b/x', { agent_id: 'w1' }))).toBe(true);
  });
});

describe('3. auto-verify long run', () => {
  const start = (s, o = {}) => av.start(s, { agent: 'data-analyst', phase: 3, tool_budget: 5, ttl_s: 60, ...o });
  const SELECT = 'psql -c "SELECT count(*) FROM t"';

  it('budget exhaustion through the real hook: exactly N approvals, then fall-through; non-approved never consume', async () => {
    const s = await openFrame(SA);
    await start(s, { tool_budget: 4 });
    const outs = [];
    outs.push(await call(SA, 'Read', { file_path: 'x' }));
    outs.push(await call(SA, 'Bash', { command: 'rm -rf x' })); // not on allowlist, no consume
    outs.push(await call(SA, 'Write', { file_path: path.join(tmp, 'w'), content: '' })); // never auto-approved
    outs.push(await call(SA, 'Bash', { command: 'git status' }));
    outs.push(await call(SA, 'Bash', { command: SELECT }));
    outs.push(await call(SA, 'Grep', { pattern: 'x' }));
    outs.push(await call(SA, 'Read', { file_path: 'y' })); // exhausted
    expect(outs.map((o) => allowed(o))).toEqual([true, false, false, true, true, true, false]);
    expect(av.get(s)).toMatchObject({ active: false, used: 4, end_reason: 'budget_exhausted' });
    expect(av.isActive(s)).toBe(false);
    expect(await call(SA, 'Read', { file_path: 'z' })).toBeNull();
  });

  it('TTL expiry (injected clock and on-disk expiry through the hook)', async () => {
    const s = await openFrame(SA);
    const t0 = 1_000_000;
    await av.start(s, { agent: 'data-analyst', phase: 1, tool_budget: 50, ttl_s: 30 }, { now: t0 });
    expect((await av.check(s, 'Read', {}, { now: t0 + 29999 })).approve).toBe(true);
    const r = await av.check(s, 'Read', {}, { now: t0 + 30000 });
    expect(r.approve).toBe(false); expect(r.reason).toMatch(/ttl_expired/);
    expect(av.get(s)).toMatchObject({ active: false, end_reason: 'ttl_expired', used: 1 });
    // restart then age on disk: hook fast path stops approving
    await start(s, { tool_budget: 50 });
    expect(allowed(await call(SA, 'Read', { file_path: 'x' }))).toBe(true);
    const cur = s.state.read('auto-verify'); cur.expires_at = Date.now() - 1;
    fs.writeFileSync(s.state.file('auto-verify'), JSON.stringify(cur));
    expect(await call(SA, 'Read', { file_path: 'x' })).toBeNull();
    expect(av.isActive(s)).toBe(false);
    // a fresh block can start after expiry
    expect((await start(s)).active).toBe(true);
  });

  it('read-only allowlist vs sql-guard: SELECT/WITH approved, write/DDL/compound refused, quoted separators fine', async () => {
    const s = await openFrame(SA);
    await start(s, { tool_budget: 100 });
    const yes = [SELECT, 'psql -c "WITH x AS (SELECT 1) SELECT * FROM x"', "psql -c \"SELECT 'a;b' AS x\"", 'bq query --use_legacy_sql=false "SELECT 1"',
      'dbt show --select m', 'dbt ls', "git log --grep='a&b'", 'ls -la'];
    const no = ['psql -c "INSERT INTO t VALUES (1)"', 'psql -c "DELETE FROM t"', 'psql -c "DROP TABLE t"', 'psql -c "UPDATE t SET a=1"',
      'psql -c "SELECT 1; DROP TABLE x"', 'dbt run', 'dbt build', 'rm x', 'ls && rm x', 'git log; rm -rf x', "echo 'a' & rm x", 'curl http://x'];
    for (const c of yes) expect(allowed(await call(SA, 'Bash', { command: c })), c).toBe(true);
    for (const c of no) expect(allowed(await call(SA, 'Bash', { command: c })), c).toBe(false);
    expect(av.get(s).used).toBe(yes.length);
    for (const t of ['Write', 'Edit', 'NotebookEdit', 'Task']) expect(allowed(await call(SA, t, { file_path: 'x' })), t).toBe(false);
    expect(av.get(s).used).toBe(yes.length);
  });

  // Regression: auto-allowlist used to give sql-guard 'first crack' past the compound/destructive
  // vetoes, auto-approving shell chaining after a SELECT-only CLI call (fixed in runtime/lib/auto-allowlist.js).
  it('shell chaining after a SELECT-only psql must not be auto-approved', () => {
    const { isAutoApprovable } = require('../runtime/lib/auto-allowlist');
    for (const c of ['psql -c "SELECT 1" && rm f', 'psql -c "SELECT 1" ; rm f', 'psql -c "SELECT 1" | sh', 'psql -c "SELECT 1" > /etc/x']) {
      expect(isAutoApprovable('Bash', { command: c }), c).toBe(false);
    }
  });

  it('per-session scoping: B has no block, A budget is not drained by B', async () => {
    const a = await openFrame(SA); const b = await openFrame(SB);
    await start(a, { tool_budget: 3 });
    for (let i = 0; i < 10; i++) expect(await call(SB, 'Read', { file_path: 'x' })).toBeNull();
    expect(av.get(a).used).toBe(0);
    for (let i = 0; i < 3; i++) expect(allowed(await call(SA, 'Read', { file_path: 'x' }))).toBe(true);
    expect(await call(SA, 'Read', { file_path: 'x' })).toBeNull();
    // B starts its own, independent block while A's is exhausted
    await start(b, { tool_budget: 2 });
    expect(allowed(await call(SB, 'Read', { file_path: 'x' }))).toBe(true);
    expect(av.get(a).end_reason).toBe('budget_exhausted');
    expect(av.get(b).used).toBe(1);
  });

  it('pending gate wins over auto-verify: block ends, write denied, reads fall through; start refused while pending', async () => {
    const s = await openFrame(SA);
    await start(s, { tool_budget: 50 });
    expect(allowed(await call(SA, 'Read', { file_path: 'x' }))).toBe(true);
    const frame = s.state.read('frames').frames.slice(-1)[0];
    await gates.requestGate(s, { frame, id: 'g1', kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
    expect(denied(await W(SA, 'f'))).toBe(true);
    expect(await call(SA, 'Read', { file_path: 'x' })).toBeNull(); // no allow
    expect(av.get(s).active).toBe(false);
    expect(av.get(s).end_reason).toMatch(/gate_pending:g1/);
    await expect(start(s)).rejects.toThrow(/Gates always win/);
  });

  it('force-close (operator) resets auto-verify, then a new block can start; other session unaffected', async () => {
    const a = await pend(SA); const b = await openFrame(SB);
    // auto-verify started before the gate (gate wins on check, but the block record stays active until observed)
    await a.state.update('auto-verify', () => ({ active: true, agent: 'data-analyst', phase: 1, tool_budget: 9, used: 0, started_at: Date.now(), ttl_s: 600, expires_at: Date.now() + 600000 }));
    await start(b, { tool_budget: 9 });
    await operator.forceClose(tmp, host.toSessionKey(SA), 'all', { actor: 'op', via: 'operator-cli' });
    expect(av.get(a)).toMatchObject({ active: false, end_reason: 'force_close' });
    expect(av.get(b).active).toBe(true);
    expect(allowed(await call(SB, 'Read', { file_path: 'x' }))).toBe(true);
    expect((await start(a)).active).toBe(true);
    expect(allowed(await call(SA, 'Read', { file_path: 'x' }))).toBe(true);
  });

  it('tool-level lifecycle across many steps: start, use, end, restart, double start refused', async () => {
    const st = sessOf(SA);
    await pushFrame(st.state, { agent: 'data-analyst', project: 'p' });
    const reg = new Registry(loadTools());
    const ctx = { root: tmp, getConfig: () => ({ config: {} }), state: st.state, sessionKey: st.sessionKey };
    const go = (name, args) => reg.call(name, args, ctx);
    for (let round = 0; round < 3; round++) {
      expect((await go('auto_verify_start', { agent: 'data-analyst', phase: 3, tool_budget: 3, ttl_s: 60 })).isError).toBeFalsy();
      expect((await go('auto_verify_start', { agent: 'data-analyst', phase: 3, tool_budget: 3, ttl_s: 60 })).isError).toBe(true);
      expect(allowed(await call(SA, 'Read', { file_path: 'x' }))).toBe(true);
      await go('auto_verify_end', {});
      expect(await call(SA, 'Read', { file_path: 'x' })).toBeNull();
    }
  });
});

describe('4. violation logging', () => {
  const rec = (o = {}) => ({ tool: 'mcp__plugin_shards_shards__gate_force_close', permission_mode: 'default', ts: new Date().toISOString(), host: 'claude-code', decision: 'ask', ...o });
  async function setCalls(s, ...calls) {
    await s.state.withLock(() => { fs.writeFileSync(s.state.file('hooks'), JSON.stringify({ gateCalls: calls, lastGateCall: calls[calls.length - 1] })); });
  }
  const forceCall = (s, id) => new Registry(loadTools()).call('gate_force_close', { id }, { root: tmp, getConfig: () => ({ config: {} }), state: s.state, sessionKey: s.sessionKey, host: 'claude-code' });
  const violations = () => operator.readJsonl(operator.violationsFile(tmp));

  it('refused force-close calls log session id and gate; allowed ones and allowed tool calls log nothing', async () => {
    const a = await pend(SA, 'ga'); const b = await pend(SB, 'gb');
    // allowed hook calls and denied writes do not produce violation entries
    await openFrame('cccccccc-3333-4333-8333-cccccccccccc');
    expect(await W('cccccccc-3333-4333-8333-cccccccccccc', 'ok.md')).toBeNull();
    expect(denied(await W(SA, 'blocked.md'))).toBe(true);
    expect(violations()).toEqual([]);
    // A: unsupervised refused; B: supervised succeeds
    await setCalls(a, rec({ permission_mode: 'bypassPermissions' }));
    await setCalls(b, rec());
    expect((await forceCall(a, 'ga')).isError).toBe(true);
    expect((await forceCall(b, 'gb')).isError).toBeFalsy();
    const v = violations();
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'refused', tool: 'gate_force_close', session: host.toSessionKey(SA), gate: 'ga' });
    expect(v[0].ts).toBeTruthy();
    expect(gateStatus(SA, 'ga')).toBe('pending');
    expect(gateStatus(SB, 'gb')).toBe('force_closed');
    // operator log has B only
    expect(operator.readJsonl(operator.operatorLogFile(tmp)).map((r) => r.session)).toEqual([host.toSessionKey(SB)]);
  });

  it('many concurrent refusals produce complete, parseable JSONL lines (one per call, no interleaving)', async () => {
    const a = await pend(SA, 'ga'); const b = await pend(SB, 'gb');
    await setCalls(a, rec({ permission_mode: 'auto' })); await setCalls(b, rec({ permission_mode: null }));
    await Promise.all(Array.from({ length: 12 }, (_, i) => forceCall(i % 2 ? a : b, i % 2 ? 'ga' : 'gb')));
    const raw = fs.readFileSync(operator.violationsFile(tmp), 'utf8').split('\n').filter(Boolean);
    expect(raw).toHaveLength(12);
    for (const l of raw) expect(() => JSON.parse(l)).not.toThrow();
    const v = violations();
    expect(v.filter((x) => x.session === host.toSessionKey(SA))).toHaveLength(6);
    expect(v.filter((x) => x.session === host.toSessionKey(SB))).toHaveLength(6);
    expect(tmpFiles(path.join(tmp, '.shards'))).toEqual([]);
  });

  it('CLI "gates violations --json" reports them; clean root says no violations', async () => {
    const cap = async (argv) => {
      const lines = []; const orig = console.log; console.log = (...a) => lines.push(a.join(' '));
      try { const code = await gatesCli.run(argv); return { code, out: lines.join('\n') }; } finally { console.log = orig; }
    };
    expect((await cap(['violations', '--root', tmp])).out).toMatch(/no violations/);
    const a = await pend(SA, 'ga');
    await setCalls(a, rec({ permission_mode: 'bypassPermissions' }));
    await forceCall(a, 'ga');
    const r = await cap(['violations', '--json', '--root', tmp]);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out);
    expect(j).toHaveLength(1);
    expect(j[0]).toMatchObject({ session: host.toSessionKey(SA), gate: 'ga', tool: 'gate_force_close' });
  });

  it('invalid gate tool call (unknown gate) does not log a violation and does not mutate state', async () => {
    const a = await pend(SA, 'ga');
    await setCalls(a, rec());
    const r = await forceCall(a, 'nope');
    expect(r.isError).toBe(true);
    expect(gateStatus(SA, 'ga')).toBe('pending');
    expect(violations()).toEqual([]);
  });

  it('fanout_claim refusals are denied with a reason naming the problem', async () => {
    await openFrame(SA);
    const lease = await L.openLease(sessOf(SA), { owner: 'fanout', worker_type: 'ml-engineer', slices: [{ id: 's1', paths: ['models/a'] }] });
    const bad = await call(SA, CLAIM, { lease_id: lease.id, slice_id: 'zzz' }, { agent_id: 'w', agent_type: 'shards:ml-engineer' });
    expect(denied(bad)).toBe(true);
    expect(bad.permissionDecisionReason).toContain('no slice zzz');
    const ok = await call(SA, CLAIM, { lease_id: lease.id, slice_id: 's1' }, { agent_id: 'w', agent_type: 'shards:ml-engineer' });
    expect(ok).toBeNull();
  });
});

describe('5. auto / bypass permission modes', () => {
  const MODES = ['default', 'plan', 'acceptEdits', 'auto', 'bypassPermissions'];

  it('gate enforcement is permission-mode independent (a pending gate blocks writes in every mode)', async () => {
    await pend(SA);
    await openFrame(SB);
    for (const m of MODES) {
      expect(denied(await W(SA, 'f', { permission_mode: m })), m).toBe(true);
      expect(await W(SB, 'f', { permission_mode: m }), m).toBeNull();
      expect(await call(SA, 'Read', { file_path: 'x' }, { permission_mode: m }), m).toBeNull();
    }
  });

  it('auto-verify approvals and budget accounting are identical in every mode', async () => {
    const s = await openFrame(SA);
    await av.start(s, { agent: 'data-analyst', phase: 1, tool_budget: MODES.length, ttl_s: 60 });
    for (const m of MODES) expect(allowed(await call(SA, 'Read', { file_path: 'x' }, { permission_mode: m })), m).toBe(true);
    expect(av.get(s)).toMatchObject({ used: MODES.length, active: false, end_reason: 'budget_exhausted' });
  });

  it('write tools are never auto-approved by auto-verify even in bypass/auto mode', async () => {
    const s = await openFrame(SA);
    await av.start(s, { agent: 'data-analyst', phase: 1, tool_budget: 20, ttl_s: 60 });
    for (const m of ['auto', 'bypassPermissions']) {
      expect(allowed(await W(SA, 'f', { permission_mode: m }))).toBe(false);
      expect(allowed(await BASH(SA, 'dbt run', { permission_mode: m }))).toBe(false);
    }
    expect(av.get(s).used).toBe(0);
  });

  it('gate tool calls record the permission mode at call time (per session) and ask only on Claude', async () => {
    for (const m of MODES) {
      await call(SA, 'mcp__plugin_shards_shards__gate_advance', { id: 'g' }, { permission_mode: m });
      await call(SB, 'mcp__plugin_shards_shards__gate_force_close', { id: 'g' }, { permission_mode: m });
    }
    const ha = sessOf(SA).state.read('hooks'); const hb = sessOf(SB).state.read('hooks');
    expect(ha.gateCalls.map((c) => c.permission_mode)).toEqual(MODES);
    expect(hb.gateCalls.map((c) => c.permission_mode)).toEqual(MODES);
    expect(ha.gateCalls.every((c) => c.decision === 'ask' && c.tool.endsWith('gate_advance'))).toBe(true);
    expect(hb.gateCalls.every((c) => c.tool.endsWith('gate_force_close'))).toBe(true);
  });

  it('tier-2 force-close refused in auto/bypass/acceptEdits with violation logged per session; allowed in default/plan', async () => {
    const reg = new Registry(loadTools());
    const results = {};
    for (const m of MODES) {
      const sid = `dddddddd-0000-4000-8000-${String(MODES.indexOf(m)).padStart(12, '0')}`;
      const s = await pend(sid, 'g1');
      await s.state.withLock(() => fs.writeFileSync(s.state.file('hooks'), JSON.stringify({ gateCalls: [{ tool: 'mcp__plugin_shards_shards__gate_force_close', permission_mode: m, ts: new Date().toISOString(), host: 'claude-code', decision: 'ask' }] })));
      const r = await reg.call('gate_force_close', { id: 'g1' }, { root: tmp, getConfig: () => ({ config: {} }), state: s.state, sessionKey: s.sessionKey, host: 'claude-code' });
      results[m] = { err: !!r.isError, status: gateStatus(sid, 'g1') };
    }
    expect(results).toEqual({
      default: { err: false, status: 'force_closed' },
      plan: { err: false, status: 'force_closed' },
      acceptEdits: { err: true, status: 'pending' },
      auto: { err: true, status: 'pending' },
      bypassPermissions: { err: true, status: 'pending' },
    });
    const v = operator.readJsonl(operator.violationsFile(tmp));
    expect(v).toHaveLength(3);
    expect(new Set(v.map((x) => x.session)).size).toBe(3);
  });
});
