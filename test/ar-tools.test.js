import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const L = require('../runtime/leases');
const R = require('../runtime/research');
const { makeRepo, write, sh, cleanup } = require('./git-binding-fixture');

const EVAL = `const fs = require('fs');
const t = fs.readFileSync('src/model.txt', 'utf8');
if (t.includes('crash')) { console.error('boom'); process.exit(3); }
if (t.includes('sleep')) { setInterval(() => {}, 1000); }
else {
  let v = parseFloat(t);
  if (process.env.JITTER) { let c = 0; try { c = +fs.readFileSync(process.env.JITTER, 'utf8'); } catch (_) {} fs.writeFileSync(process.env.JITTER, String(c + 1)); v += (c % 2) * 0.2; }
  console.log('training...'); console.log('score=' + v);
}
`;

let root; let state; let reg; let key;
const ctx = () => ({ root, getConfig: () => ({ config: {} }), state, sessionKey: key });
const call = async (name, args) => {
  const r = await reg.call(name, args, ctx());
  if (r.isError) throw new Error(r.content[1].text);
  const t = r.content[1].text;
  try { return JSON.parse(t); } catch (_) { return t; }
};
const model = (txt) => write(root, 'src/model.txt', txt);
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const startArgs = (o = {}) => ({
  project: 'shards/p', brief_path: 'shards/p/research_brief.md', run_id: 'r1',
  mutable: ['src/**'], immutable: ['eval'],
  eval: { command: 'node eval/score.js', metric_regex: 'score=([-0-9.eE]+)', name: 'score', direction: 'maximize', timeout_s: 20, repeats: 2 },
  budget: { iterations: 20 }, ...o,
});
const trailersOf = (ref) => sh(root, 'log', '--format=%(trailers:only,unfold)%x1e', ref);

beforeEach(() => {
  ({ root } = makeRepo());
  write(root, '.gitignore', '.shards/\n');
  write(root, 'eval/score.js', EVAL);
  write(root, 'src/model.txt', '1\n# a\n# b\n');
  write(root, 'shards/p/research_brief.md', '# brief\n');
  sh(root, 'add', '-A'); sh(root, 'commit', '-q', '-m', 'fixture');
  key = 'sess-ar';
  state = new StateStore(root, key);
  reg = new Registry(loadTools());
});
afterEach(() => cleanup());

describe('ar_start', () => {
  it('measures the baseline noise floor, pins hashes, opens the lease and creates the research ref', async () => {
    const jitter = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ar-jit-')), 'c');
    write(root, 'notes.txt', 'user wip\n'); // pre-loop dirty, outside the mutable scope
    const s = await call('ar_start', startArgs({ eval: { ...startArgs().eval, command: `JITTER=${jitter} node eval/score.js`, repeats: 3 } }));
    expect(s.noise.values).toEqual([1, 1.2, 1]);
    expect(s.noise.stddev).toBeGreaterThan(0.1);
    expect(s.epsilon_abs).toBeCloseTo(2 * s.noise.stddev, 10); // 2 sd beats 1% of baseline
    expect(s.ref).toBe('refs/shards/research/p/r1');
    expect(s.preLoopDirty).toContain('notes.txt');
    expect(s.pinned).toEqual(['eval']);
    expect(L.getActiveArLease({ root, sessionKey: key, state }).ar).toMatchObject({ run_id: 'r1', mutable: ['src/**'], immutable: ['eval'] });
    const tr = trailersOf(s.ref);
    expect(tr).toMatch(/AR-Iter: 0/);
    expect(tr).toMatch(/AR-Decision: baseline/);
    expect(tr).toMatch(/AR-Config: \{/);
    expect(sh(root, 'rev-parse', `${s.ref}^`)).toBe(sh(root, 'rev-parse', 'HEAD'));
    expect(fs.existsSync(path.join(root, 'shards/p/experiments/iter_0.log'))).toBe(true);
    await expect(call('ar_start', startArgs({ run_id: 'r2' }))).rejects.toThrow(/already active/);
  });

  it('reports the plan budget raised to cover the AR budget when the run has a plan approval', async () => {
    const at = new Date().toISOString();
    await state.update('gates', (cur) => { cur.gates = { 'ml-engineer-research-phase-1': { id: 'ml-engineer-research-phase-1', kind: 'execute', status: 'confirmed', plan_run: 'r1', requested_at: at, decided_at: at } }; return cur; });
    const s = await call('ar_start', startArgs({ budget: { iterations: 150, minutes: 600 } }));
    expect(s.plan).toMatchObject({ gate: 'ml-engineer-research-phase-1', status: 'confirmed', max_gates: 152, max_minutes: null });
  });

  it('refuses a dirty mutable scope and a failing baseline', async () => {
    model('5\n');
    await expect(call('ar_start', startArgs())).rejects.toThrow(/mutable scope has uncommitted changes.*src\/model.txt/);
    sh(root, 'checkout', '--', 'src/model.txt');
    sh(root, 'commit', '-q', '--allow-empty', '-m', 'x');
    write(root, 'src/model.txt', 'crash\n'); sh(root, 'commit', '-qam', 'crash');
    await expect(call('ar_start', startArgs())).rejects.toThrow(/baseline eval run 1 failed \(crash/);
    expect(L.getActiveArLease({ root, sessionKey: key, state })).toBeNull();
  });
});

describe('ar_iterate', () => {
  beforeEach(async () => { await call('ar_start', startArgs()); });

  it('GREEN keeps the change, commits it with trailers and moves the pointers', async () => {
    const head = sh(root, 'rev-parse', 'HEAD');
    model('2\n# a\n# b\n');
    const r = await call('ar_iterate', { hypothesis: 'bump to 2', source: 'adaptive' });
    expect(r).toMatchObject({ iteration: 1, decision: 'green', kept: true, before: 1, after: 2, converged: false });
    expect(read('src/model.txt')).toBe('2\n# a\n# b\n');
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head); // user branch untouched
    const tr = trailersOf('refs/shards/research/p/r1');
    for (const t of ['AR-Iter: 1', 'AR-Decision: green', 'AR-Metric: score=1->2', 'AR-Eval: full', 'AR-Hypothesis-Source: adaptive', 'AR-Run: r1', 'AR-Kept: true']) expect(tr).toContain(t);
    expect(sh(root, 'show', 'refs/shards/research/p/r1:src/model.txt')).toBe('2\n# a\n# b');
    const st = await call('ar_status', {});
    expect(st).toMatchObject({ lastKeptCommit: r.commit, lastGreenCommit: r.commit, comparisonReference: 2, iterations: 1 });
    expect(read('shards/p/experiments/iter_1.log')).toMatch(/score=2/);
  });

  it('RED reverts tracked edits and deletes new untracked files, keeping pre-loop dirt and the user index', async () => {
    model('0.5\n# a\n# b\n');
    write(root, 'src/new_helper.txt', 'new\n');
    const r = await call('ar_iterate', { hypothesis: 'worse' });
    expect(r).toMatchObject({ decision: 'red', kept: false, after: 0.5 });
    expect(r.deleted).toEqual(['src/new_helper.txt']);
    expect(r.restored).toEqual(['src/model.txt']);
    expect(read('src/model.txt')).toBe('1\n# a\n# b\n');
    expect(fs.existsSync(path.join(root, 'src/new_helper.txt'))).toBe(false);
    expect(sh(root, 'status', '--porcelain', '--', 'src')).toBe('');
    // the RED's diff stays inspectable on the ref, followed by a revert commit
    expect(sh(root, 'show', `${r.commit}:src/new_helper.txt`)).toBe('new');
    expect(sh(root, 'log', '-1', '--format=%(trailers:key=AR-Revert,valueonly)', 'refs/shards/research/p/r1')).toBe(sh(root, 'rev-parse', 'HEAD'));
    expect(sh(root, 'rev-parse', 'refs/shards/research/p/r1^')).toBe(r.commit);
  });

  it('YELLOW is kept only when the mutable diff is simpler', async () => {
    model('1\n# a\n');
    const a = await call('ar_iterate', { hypothesis: 'drop a comment' });
    expect(a).toMatchObject({ decision: 'yellow', kept: true });
    expect(a.loc.net).toBe(-1);
    model('1\n# a\n# c\n# d\n');
    const b = await call('ar_iterate', { hypothesis: 'add comments' });
    expect(b).toMatchObject({ decision: 'yellow', kept: false });
    expect(read('src/model.txt')).toBe('1\n# a\n'); // back to the kept YELLOW, not the pre-loop state
    expect((await call('ar_status', {})).lastKeptCommit).toBe(a.commit);
  });

  it('a timeout is a RED that counts against the budget and is reverted', async () => {
    await call('ar_end', { reason: 'restart' });
    await call('ar_start', startArgs({ run_id: 'r2', eval: { ...startArgs().eval, timeout_s: 1, repeats: 1 } }));
    model('sleep\n');
    const t0 = Date.now();
    const r = await call('ar_iterate', { hypothesis: 'hang' });
    expect(Date.now() - t0).toBeLessThan(10000);
    expect(r).toMatchObject({ decision: 'red', failure: 'timeout', kept: false });
    expect(r.budget_remaining.iterations).toBe(19);
    expect(read('src/model.txt')).toBe('1\n# a\n# b\n');
    expect(read('shards/p/experiments/iter_1.log')).toMatch(/TIMEOUT/);
  }, 20000);

  it('three consecutive crashes stop the run with error-limit', async () => {
    for (let i = 0; i < 3; i++) { model('crash\n'); await call('ar_iterate', { hypothesis: `c${i}` }); }
    const st = await call('ar_status', {});
    expect(st).toMatchObject({ converged: true, stop_reason: 'error-limit', status: 'converged' });
    await expect(call('ar_iterate', { hypothesis: 'more' })).rejects.toThrow(/has stopped \(error-limit\)/);
  });

  it('a changed immutable file is a tamper: RED, revert, run halts without running the eval', async () => {
    write(root, 'eval/score.js', `${EVAL}\n// easier\n`);
    model('9\n');
    const r = await call('ar_iterate', { hypothesis: 'cheat' });
    expect(r).toMatchObject({ decision: 'red', failure: 'tamper', kept: false, converged: true, stop_reason: 'tamper', tampered: ['eval'] });
    expect(read('src/model.txt')).toBe('1\n# a\n# b\n');
    expect(trailersOf('refs/shards/research/p/r1')).toContain('AR-Failure: tamper');
  });
});

describe('convergence, status rebuild and end', () => {
  it('stops at the iteration budget', async () => {
    await call('ar_start', startArgs({ budget: { iterations: 2 } }));
    model('2\n'); expect((await call('ar_iterate', { hypothesis: 'a' })).converged).toBe(false);
    model('3\n');
    const r = await call('ar_iterate', { hypothesis: 'b' });
    expect(r).toMatchObject({ converged: true, stop_reason: 'budget-exhausted', budget_remaining: { iterations: 0 } });
  });

  it('rebuilds state from the research ref in a new session and resumes', async () => {
    await call('ar_start', startArgs());
    model('2\n# a\n# b\n'); const g = await call('ar_iterate', { hypothesis: 'up', source: 'steering' });
    model('0\n'); await call('ar_iterate', { hypothesis: 'down' });
    // new session: no state file for the run, lease belongs to the old session
    key = 'sess-new'; state = new StateStore(root, key);
    const st = await call('ar_status', { run_id: 'r1' });
    expect(st).toMatchObject({ source: 'ref', run_id: 'r1', iterations: 2, decisions: { green: 1, red: 1, kept: 1, reverted: 1 }, lastKeptCommit: g.commit, comparisonReference: 2, baseline: 1, lease_active: false, status: 'active' });
    expect(st.recent.map((x) => x.hypothesis)).toEqual(['up', 'down']);
    expect(st.recent[0]).toMatchObject({ decision: 'green', kept: true });
    const res = await call('ar_status', { run_id: 'r1', resume: true });
    expect(res).toMatchObject({ resumed: true, lease_active: true });
    model('3\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'up again' })).toMatchObject({ iteration: 3, decision: 'green', before: 2, after: 3 });
  });

  it('ar_end records the stop reason on the ref and closes the lease; shards_status shows the run', async () => {
    await call('ar_start', startArgs());
    expect((await call('shards_status', {})).arRun).toMatchObject({ run_id: 'r1', status: 'active' });
    const e = await call('ar_end', { reason: 'user-interrupt' });
    expect(e).toMatchObject({ status: 'ended', stop_reason: 'user-interrupt', lease_closed: expect.stringMatching(/^lease-ar-/) });
    expect(L.getActiveArLease({ root, sessionKey: key, state })).toBeNull();
    expect(sh(root, 'log', '-1', '--format=%(trailers:key=AR-Stop,valueonly)', 'refs/shards/research/p/r1')).toBe('user-interrupt');
    await expect(call('ar_end', { reason: 'again' })).rejects.toThrow(/already ended/);
    await expect(call('ar_iterate', { hypothesis: 'x' })).rejects.toThrow(/no active AR run/);
    // a rebuilt view of an ended run reports it ended
    const run = await R.rebuildFromRef(root, 'refs/shards/research/p/r1');
    expect(run).toMatchObject({ status: 'ended', stop_reason: 'user-interrupt' });
    // a new run can start now
    expect((await call('ar_start', startArgs({ run_id: 'r2' }))).ref).toBe('refs/shards/research/p/r2');
  });
});

describe('ar_defer (deferred-decision queue)', () => {
  beforeEach(async () => { await call('ar_start', startArgs()); });

  it('retro_revert restores the kept state before M, records needs-human and the loop continues', async () => {
    model('2\n# a\n# b\n'); const g1 = await call('ar_iterate', { hypothesis: 'up 2' });
    model('3\n# a\n# b\n'); write(root, 'src/leak.txt', 'leak\n'); const g2 = await call('ar_iterate', { hypothesis: 'leaky 3' });
    model('4\n# a\n# b\n'); write(root, 'src/leak.txt', 'leak\n'); await call('ar_iterate', { hypothesis: 'leaky 4' });
    expect(g2.decision).toBe('green');
    const d = await call('ar_defer', { kind: 'retro_revert', retro_to_iteration: 2, detail: 'iter 2 GREEN used test labels' });
    expect(d.deferred).toMatchObject({ id: 'd1', kind: 'retro_revert', retro_to_iteration: 2, revert_to: g1.commit, at_iteration: 3, status: 'pending' });
    expect(d.retro_revert).toMatchObject({ lastKeptCommit: g1.commit, lastGreenCommit: g1.commit, comparisonReference: 2, deleted: ['src/leak.txt'] });
    expect(read('src/model.txt')).toBe('2\n# a\n# b\n');
    expect(fs.existsSync(path.join(root, 'src/leak.txt'))).toBe(false);
    const tr = sh(root, 'log', '-1', '--format=%(trailers:only,unfold)', 'refs/shards/research/p/r1');
    for (const t of ['AR-Decision: needs-human', 'AR-Needs-Human: retro_revert', 'AR-Retro-To: 2', `AR-Revert: ${g1.commit}`, 'AR-Detail: iter 2 GREEN used test labels']) expect(tr).toContain(t);
    expect(sh(root, 'show', 'refs/shards/research/p/r1:src/model.txt')).toBe('2\n# a\n# b');
    // The loop continues from the reverted state: iteration 4 is judged against 2.
    model('2.5\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'honest 2.5' })).toMatchObject({ iteration: 4, decision: 'green', before: 2, after: 2.5 });
    await call('ar_defer', { kind: 'pause', detail: 'reviewer wants a look at feature drift' });
    const st = await call('ar_status', {});
    expect(st.deferred.map((x) => x.kind)).toEqual(['retro_revert', 'pause']);
    // A rebuild from the ref sees the same queue and pointers.
    key = 'sess-new2'; state = new StateStore(root, key);
    const rb = await call('ar_status', { run_id: 'r1' });
    expect(rb).toMatchObject({ source: 'ref', comparisonReference: 2.5, iterations: 4 });
    expect(rb.deferred.map((x) => [x.kind, x.retro_to_iteration])).toEqual([['retro_revert', 2], ['pause', undefined]]);
    const run = await R.rebuildFromRef(root, 'refs/shards/research/p/r1');
    expect(run.iterations.filter((x) => x.retroInvalidated).map((x) => x.n)).toEqual([2, 3]);
  });

  it('ar_end lists pending deferred items for the Phase 3 gate', async () => {
    await call('ar_defer', { kind: 'floor_breach', detail: 'full eval 0.4 below floor 0.5' });
    const e = await call('ar_end', { reason: 'budget-exhausted' });
    expect(e.deferred).toEqual([expect.objectContaining({ kind: 'floor_breach', status: 'pending' })]);
    expect(e.note).toMatch(/deferred decisions/);
    await expect(call('ar_defer', { kind: 'other', detail: 'x' })).rejects.toThrow(/already ended/);
  });

  it('validates retro_to_iteration', async () => {
    await expect(call('ar_defer', { kind: 'retro_revert', detail: 'x' })).rejects.toThrow(/retro_to_iteration between 1 and 0/);
    await expect(call('ar_defer', { kind: 'pause', detail: 'x', retro_to_iteration: 1 })).rejects.toThrow(/only valid with kind=retro_revert/);
  });
});

describe('shards research status (CLI)', () => {
  const { spawnSync } = require('child_process');
  const CLI = path.resolve(__dirname, '..', 'cli', 'shards.js');
  const cli = (...a) => { const r = spawnSync('node', [CLI, 'research', 'status', '--root', root, ...a], { encoding: 'utf8' }); return { code: r.status, out: r.stdout, err: r.stderr }; };

  it('reports the run, done once converged or ended, and falls back to the ref', async () => {
    expect(cli('--json').code).toBe(1);
    await call('ar_start', startArgs({ budget: { iterations: 2 } }));
    model('2\n'); await call('ar_iterate', { hypothesis: 'a' });
    let r = cli('--json');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ found: true, run_id: 'r1', status: 'active', done: false, iterations: 1, source: 'state', session: key });
    await call('ar_defer', { kind: 'pause', detail: 'look' });
    model('3\n'); await call('ar_iterate', { hypothesis: 'b' });
    r = JSON.parse(cli('--json').out);
    expect(r).toMatchObject({ status: 'converged', done: true, stop_reason: 'budget-exhausted' });
    expect(r.deferred).toHaveLength(1);
    expect(cli().out).toMatch(/status converged \(done\)/);
    // No session state at all: rebuilt from the research ref.
    fs.rmSync(path.join(root, '.shards', 'state'), { recursive: true, force: true });
    r = JSON.parse(cli('--run', 'r1', '--json').out);
    expect(r).toMatchObject({ source: 'ref', run_id: 'r1', done: true, iterations: 2 });
    expect(cli('--run', 'nope', '--json').code).toBe(1);
    expect(spawnSync('node', [CLI, 'research', 'bogus'], { encoding: 'utf8' }).status).toBe(2);
  });
});

describe('project root below the git top level', () => {
  it('keeps and reverts with prefixed paths', async () => {
    const r0 = makeRepo({ sub: 'proj' });
    root = r0.root;
    write(root, 'eval/score.js', EVAL); write(root, 'src/model.txt', '1\n'); write(root, 'shards/p/research_brief.md', '#\n');
    write(r0.top, '.gitignore', '.shards/\n');
    sh(r0.top, 'add', '-A'); sh(r0.top, 'commit', '-q', '-m', 'sub');
    state = new StateStore(root, key);
    await call('ar_start', startArgs());
    model('2\n'); expect(await call('ar_iterate', { hypothesis: 'up' })).toMatchObject({ decision: 'green', kept: true });
    expect(sh(root, 'show', 'refs/shards/research/p/r1:proj/src/model.txt')).toBe('2');
    model('0\n'); write(root, 'src/x.txt', 'x');
    expect(await call('ar_iterate', { hypothesis: 'down' })).toMatchObject({ decision: 'red', deleted: ['src/x.txt'] });
    expect(read('src/model.txt')).toBe('2\n');
    expect(fs.existsSync(path.join(root, 'src/x.txt'))).toBe(false);
  });
});

describe('pure helpers', () => {
  it('hooks treat ar_start/ar_iterate as exec (blocked by a pending gate, not write-checked)', () => {
    const { writesOf } = require('../hooks/lib/writes');
    for (const t of ['mcp__plugin_shards_shards__ar_iterate', 'mcp__shards__ar_start', 'mcp__shards__ar_defer']) expect(writesOf({ toolName: t, toolInput: {} })).toMatchObject({ write: false, exec: true });
    expect(writesOf({ toolName: 'mcp__shards__ar_status', toolInput: {} })).toMatchObject({ write: false, exec: false });
  });
  it('parses metrics by regex and JSON path', () => {
    expect(R.parseMetric({ metric_regex: 'acc=([0-9.]+)' }, 'acc=0.1\nacc=0.7\n', '')).toBe(0.7);
    expect(R.parseMetric({ metric_regex: 'acc=([0-9.]+)' }, '', 'acc=0.3')).toBe(0.3);
    expect(R.parseMetric({ metric_regex: 'acc=([0-9.]+)' }, 'nothing', '')).toBeNull();
    expect(R.parseMetric({ json_path: '$.m.auc' }, 'log line\n{"m":{"auc":0.81}}\n', '')).toBe(0.81);
    expect(R.parseMetric({ json_path: 'scores[1]' }, '{"scores":[1,2]}', '')).toBe(2);
  });
  it('plateau fires after the activation floor when no GREEN in the window', () => {
    const run = { eval: { direction: 'maximize' }, baseline: 1, epsilon_abs: 0.01, budget: { iterations: 100 }, convergence: { plateau_window: 5, diminishing_returns_pct: null }, started_at: new Date().toISOString(), iterations: [] };
    for (let i = 1; i <= 19; i++) run.iterations.push({ n: i, decision: i <= 14 ? 'green' : 'red', bestSoFar: 1 + i * 0.1 });
    expect(R.stopReason(run)).toBeNull();
    run.iterations.push({ n: 20, decision: 'yellow', bestSoFar: 2.4 });
    expect(R.stopReason(run)).toBe('plateau');
  });
});
