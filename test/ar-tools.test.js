import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const L = require('../runtime/leases');
const R = require('../runtime/research');
const { makeRepo, write, sh, cleanup } = require('./git-binding-fixture');

const EVAL = `const fs = require('fs');
console.log('budget=' + (process.env.SHARDS_AR_COMPUTE_BUDGET_S || 'none') + ' kind=' + (process.env.SHARDS_AR_EVAL || ''));
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
  it('refuses a mutable scope that covers the AR project dir or .shards/', async () => {
    await expect(call('ar_start', startArgs({ mutable: ['**/*.md'] }))).rejects.toThrow(/covers the AR project dir shards\/p/);
    await expect(call('ar_start', startArgs({ mutable: ['shards'] }))).rejects.toThrow(/covers the AR project dir/);
    await expect(call('ar_start', startArgs({ mutable: ['.shards/state'] }))).rejects.toThrow(/covers \.shards\//);
  });
});

describe('parseMetric', () => {
  const j = (out) => R.parseMetric({ json_path: '$.acc' }, out, '');
  it('accepts only real numbers', () => {
    expect(j('{"acc": null}')).toBeNull();
    expect(j('{"acc": ""}')).toBeNull();
    expect(j('{"acc": true}')).toBeNull();
    expect(j('{"acc": "0.5"}')).toBe(0.5);
    expect(R.parseMetric({ metric_regex: 'acc=(\\d*)' }, 'acc=', '')).toBeNull();
  });
  it('skips later JSON lines that are not the metric line', () => {
    expect(j('{"acc": 0.9}\n7\n')).toBe(0.9);
    expect(j('{"acc": 0.9}\ntrue')).toBe(0.9);
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

describe('AR fan-out branch runs (git worktrees, issue #91 H4)', () => {
  const wt = (b, rel = '') => path.join(root, '.shards/worktrees/r1', b, rel);
  const bArgs = (b, o = {}) => startArgs({ branch: b, ...o });
  const S = () => ({ root, sessionKey: key, state });

  it('creates a detached worktree per branch, runs the eval there and journals to a branch ref', async () => {
    const head = sh(root, 'rev-parse', 'HEAD');
    const a = await call('ar_start', bArgs('a'));
    expect(a).toMatchObject({ run_id: 'r1', branch: 'a', worktree: '.shards/worktrees/r1/a', ref: 'refs/shards/research/p/r1/a', baseline: 1 });
    expect(fs.existsSync(wt('a', '.git'))).toBe(true);
    expect(sh(wt('a'), 'rev-parse', 'HEAD')).toBe(head);
    expect(sh(wt('a'), 'status', '--porcelain', '--branch').split('\n')[0]).toMatch(/HEAD \(no branch\)/);
    expect(sh(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main'); // user checkout untouched, no new branch
    expect(sh(root, 'branch', '--list').split('\n')).toHaveLength(1);
    expect(fs.existsSync(path.join(root, 'shards/p/experiments/branches/a/iter_0.log'))).toBe(true);
    // a second branch of the same run runs concurrently; the lease covers both, scoped to each worktree
    const b = await call('ar_start', bArgs('b'));
    expect(b.ref).toBe('refs/shards/research/p/r1/b');
    const lease = L.getActiveArLease(S());
    expect(Object.keys(lease.ar.branches)).toEqual(['a', 'b']);
    expect(lease.ar.mutable).toEqual(['.shards/worktrees/r1/a/src/**', '.shards/worktrees/r1/b/src/**']);
    expect(lease.ar.immutable).toEqual(expect.arrayContaining(['eval', '.shards/worktrees/r1/a/eval', '.shards/worktrees/r1/b/eval']));
    await expect(call('ar_start', bArgs('a'))).rejects.toThrow(/already exists/);
    await expect(call('ar_start', startArgs({ run_id: 'solo' }))).rejects.toThrow(/already active/);
    await expect(call('ar_start', startArgs({ branch: 'c', worktree: false }))).rejects.toThrow(/needs its own worktree/);
    await expect(call('ar_start', startArgs({ run_id: 'x', worktree: true }))).rejects.toThrow(/needs a branch/);

    // branch a improves, branch b regresses; each is judged and kept/reverted in its own worktree
    write(wt('a'), 'src/model.txt', '2\n# a\n# b\n');
    write(wt('b'), 'src/model.txt', '0.5\n# a\n# b\n');
    write(wt('b'), 'src/extra.txt', 'x\n');
    await expect(call('ar_iterate', { hypothesis: 'which?' })).rejects.toThrow(/2 AR branch runs are active.*pass branch/);
    const ia = await call('ar_iterate', { hypothesis: 'up', branch: 'a' });
    expect(ia).toMatchObject({ branch: 'a', iteration: 1, decision: 'green', kept: true, after: 2 });
    const ib = await call('ar_iterate', { hypothesis: 'down', run_id: 'r1', branch: 'b' });
    expect(ib).toMatchObject({ branch: 'b', decision: 'red', kept: false, deleted: ['src/extra.txt'] });
    expect(fs.readFileSync(wt('b', 'src/model.txt'), 'utf8')).toBe('1\n# a\n# b\n');
    expect(fs.readFileSync(wt('a', 'src/model.txt'), 'utf8')).toBe('2\n# a\n# b\n');
    expect(read('src/model.txt')).toBe('1\n# a\n# b\n'); // main tree untouched
    expect(sh(root, 'status', '--porcelain', '--', 'src')).toBe('');
    expect(sh(root, 'show', 'refs/shards/research/p/r1/a:src/model.txt')).toBe('2\n# a\n# b');
    expect(trailersOf('refs/shards/research/p/r1/a')).toContain('AR-Branch: a');
    expect(read('shards/p/experiments/branches/a/iter_1.log')).toMatch(/score=2/);

    // arbitration view: every branch, ranked
    const st = await call('ar_status', { run_id: 'r1' });
    expect(st.branched).toBe(true);
    expect(st.leaderboard.map((x) => [x.branch, x.bestSoFar])).toEqual([['a', 2], ['b', 1]]);
    expect(st.branches.every((x) => x.lease_active)).toBe(true);
    expect((await call('ar_status', { run_id: 'r1', branch: 'b' })).decisions).toMatchObject({ red: 1 });

    // ending a branch removes its worktree and its part of the lease; the other branch keeps running
    const ea = await call('ar_end', { reason: 'budget-exhausted', branch: 'a' });
    expect(ea).toMatchObject({ branch: 'a', worktree_removed: true, lease_closed: null });
    expect(ea.promote).toContain(`${head} ${ia.commit}`);
    expect(fs.existsSync(wt('a'))).toBe(false);
    expect(sh(root, 'worktree', 'list').split('\n')).toHaveLength(2);
    expect(Object.keys(L.getActiveArLease(S()).ar.branches)).toEqual(['b']);
    write(wt('b'), 'src/model.txt', '3\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'up b' })).toMatchObject({ branch: 'b', decision: 'green' });
    const eb = await call('ar_end', { reason: 'plateau', keep_worktree: true });
    expect(eb).toMatchObject({ branch: 'b', worktree_removed: false, lease_closed: expect.stringMatching(/^lease-ar-/) });
    expect(fs.existsSync(wt('b', 'src/model.txt'))).toBe(true);
    expect(L.getActiveArLease(S())).toBeNull();
    // promotion at the human gate: apply the winner's kept diff onto the user branch
    execSync(ea.promote, { cwd: root, shell: '/bin/sh' });
    expect(read('src/model.txt')).toBe('2\n# a\n# b\n');
  });

  it('adds .shards/worktrees/ to info/exclude, links untracked immutable data and pins it', async () => {
    sh(root, 'rm', '-q', '--cached', '.gitignore'); fs.rmSync(path.join(root, '.gitignore'));
    write(root, '.git/info/exclude', 'data/\n.shards/state/\n');
    write(root, 'data/x.txt', '5\n');
    write(root, 'eval/score.js', `${EVAL}\nconsole.log('data=' + require('fs').readFileSync('data/x.txt', 'utf8').trim());\n`);
    sh(root, 'add', '-A'); sh(root, 'commit', '-q', '-m', 'data eval');
    const s = await call('ar_start', bArgs('a', { immutable: ['eval', 'data'], eval: { ...startArgs().eval, metric_regex: 'data=([0-9.]+)' } }));
    expect(s).toMatchObject({ baseline: 5, linked_immutable: ['data'] });
    expect(fs.readFileSync(path.join(root, '.git/info/exclude'), 'utf8')).toMatch(/^\/\.shards\/worktrees\/$/m);
    expect(sh(root, 'status', '--porcelain')).not.toMatch(/worktrees/);
    expect(fs.lstatSync(wt('a', 'data')).isSymbolicLink()).toBe(true);
    write(root, 'data/x.txt', '9\n'); // tampering with the main-tree data a branch reads
    expect(await call('ar_iterate', { hypothesis: 'h', branch: 'a' })).toMatchObject({ failure: 'tamper', tampered: ['data'] });
    await call('ar_end', { reason: 'tamper', branch: 'a' });
    expect(fs.existsSync(path.join(root, 'data/x.txt'))).toBe(true); // removing the worktree never follows the link
  });

  it('rebuilds a branch run from its ref in a new session and recreates a lost worktree on resume', async () => {
    await call('ar_start', bArgs('a'));
    write(wt('a'), 'src/model.txt', '2\n# a\n# b\n');
    const g = await call('ar_iterate', { hypothesis: 'up', branch: 'a' });
    key = 'sess-other'; state = new StateStore(root, key);
    sh(root, 'worktree', 'remove', '--force', wt('a'));
    const st = await call('ar_status', { run_id: 'r1', branch: 'a' });
    expect(st).toMatchObject({ source: 'ref', branch: 'a', lastKeptCommit: g.commit, lease_active: false });
    const res = await call('ar_status', { run_id: 'r1', branch: 'a', resume: true });
    expect(res).toMatchObject({ resumed: true, lease_active: true, worktree_recreated: true });
    expect(fs.readFileSync(wt('a', 'src/model.txt'), 'utf8')).toBe('2\n# a\n# b\n'); // kept state restored
    write(wt('a'), 'src/model.txt', '3\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'up 3', branch: 'a' })).toMatchObject({ iteration: 2, decision: 'green', before: 2 });
  });

  it('caps concurrent branches and keeps solo and branched refs apart', async () => {
    for (const b of ['a', 'b', 'c', 'd']) await call('ar_start', bArgs(b, { eval: { ...startArgs().eval, repeats: 1 } }));
    await expect(call('ar_start', bArgs('e'))).rejects.toThrow(/cap 4/);
    for (const b of ['a', 'b', 'c', 'd']) await call('ar_end', { reason: 'x', branch: b });
    expect(fs.existsSync(path.join(root, '.shards/worktrees/r1'))).toBe(false);
    await expect(call('ar_start', startArgs())).rejects.toThrow(/already has branch runs/);
    await call('ar_start', startArgs({ run_id: 'solo', eval: { ...startArgs().eval, repeats: 1 } }));
    await call('ar_end', { reason: 'x' });
    await expect(call('ar_start', startArgs({ run_id: 'solo', branch: 'a' }))).rejects.toThrow(/already exists|is a solo run/);
  });
});

describe('branch run with the project root below the git top level', () => {
  it('creates the worktree at the session root and works in its prefixed copy', async () => {
    const r0 = makeRepo({ sub: 'proj' });
    root = r0.root;
    write(root, 'eval/score.js', EVAL); write(root, 'src/model.txt', '1\n'); write(root, 'shards/p/research_brief.md', '#\n');
    write(r0.top, '.gitignore', 'proj/.shards/\n');
    sh(r0.top, 'add', '-A'); sh(r0.top, 'commit', '-q', '-m', 'sub');
    state = new StateStore(root, key);
    const s = await call('ar_start', startArgs({ branch: 'a' }));
    expect(s.work_root).toBe('.shards/worktrees/r1/a/proj');
    expect(L.getActiveArLease({ root, sessionKey: key, state }).ar.mutable).toEqual(['.shards/worktrees/r1/a/proj/src/**']);
    write(root, '.shards/worktrees/r1/a/proj/src/model.txt', '2\n');
    expect(await call('ar_iterate', { hypothesis: 'up', branch: 'a' })).toMatchObject({ decision: 'green', kept: true });
    expect(sh(root, 'show', 'refs/shards/research/p/r1/a:proj/src/model.txt')).toBe('2');
    expect(read('src/model.txt')).toBe('1\n');
    const e = await call('ar_end', { reason: 'done', branch: 'a' });
    expect(e.worktree_removed).toBe(true);
    execSync(e.promote, { cwd: root, shell: '/bin/sh' });
    expect(read('src/model.txt')).toBe('2\n');
  });
});

// ---------- issue #91 H5 + bug 8: sealed holdout, fixed compute budget, proxy/full evals ----------

// Holdout: model value x the holdout data factor; counts its runs in $HC (outside the repo's tracked files).
const HOLDOUT = `const fs = require('fs');
if (process.env.HC) { let c = 0; try { c = +fs.readFileSync(process.env.HC, 'utf8'); } catch (_) {} fs.writeFileSync(process.env.HC, String(c + 1)); }
const v = parseFloat(fs.readFileSync('src/model.txt', 'utf8'));
const k = parseFloat(fs.readFileSync('holdout/data.txt', 'utf8'));
console.log('holdout score=' + (v * k));
`;
// Proxy: src/proxy.txt (mutable) when present, else the model value; lets an iteration fool the proxy only.
const PROXY = `const fs = require('fs');
let t; try { t = fs.readFileSync('src/proxy.txt', 'utf8'); } catch (_) { t = fs.readFileSync('src/model.txt', 'utf8'); }
console.log('kind=' + process.env.SHARDS_AR_EVAL); console.log('score=' + parseFloat(t));
`;

describe('sealed holdout (issue #91 H5)', () => {
  let hc;
  beforeEach(() => {
    write(root, 'eval/holdout.js', HOLDOUT);
    write(root, 'holdout/data.txt', '0.777\n');
    sh(root, 'add', '-A'); sh(root, 'commit', '-q', '-m', 'holdout');
    hc = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ar-hc-')), 'n');
  });
  const hArgs = (o = {}) => startArgs({ holdout: { command: `HC=${hc} node eval/holdout.js`, metric_regex: 'holdout score=([-0-9.eE]+)' }, holdout_paths: ['holdout'], ...o });
  const runs = () => Number(fs.readFileSync(hc, 'utf8'));
  const SECRET = /0\.777/;

  it('evaluates the pre-loop state at ar_start, seals it, never runs it in ar_iterate and reveals it only at ar_end', async () => {
    const s = await call('ar_start', hArgs());
    expect(runs()).toBe(1);
    expect(s.holdout).toEqual({ sealed: true, paths: ['holdout'], baseline_evaluated: true });
    expect(s.pinned).toEqual(['eval', 'holdout']);
    expect(L.getActiveArLease({ root, sessionKey: key, state }).ar.immutable).toEqual(['eval', 'holdout']);
    expect(JSON.stringify(s)).not.toMatch(SECRET);
    expect(fs.existsSync(path.join(root, R.SEALED, 'p/r1.json'))).toBe(true);

    model('2\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'up' })).toMatchObject({ decision: 'green', kept: true });
    expect(runs()).toBe(1); // ar_iterate never runs the holdout
    const st = await call('ar_status', {});
    expect(st.holdout).toMatchObject({ sealed: true });
    expect(JSON.stringify(st)).not.toMatch(SECRET);
    expect(trailersOf('refs/shards/research/p/r1')).not.toMatch(SECRET);
    for (const f of fs.readdirSync(path.join(root, 'shards/p/experiments'))) expect(read(`shards/p/experiments/${f}`)).not.toMatch(SECRET);

    const e = await call('ar_end', { reason: 'done' });
    expect(runs()).toBe(2);
    expect(e.holdout).toMatchObject({ metric: 'score', baseline: 0.777, final: 1.554 });
    expect(e.holdout.delta).toBeCloseTo(0.777, 10);
    expect(sh(root, 'log', '-1', '--format=%(trailers:key=AR-Holdout,valueonly)', 'refs/shards/research/p/r1')).toBe('score=0.777->1.554 (delta 0.777)');
    expect(read('shards/p/experiments/holdout.log')).toMatch(/holdout score=1\.554/);
    // the rebuilt (ended) run carries the result; status after the end shows it
    expect((await R.rebuildFromRef(root, 'refs/shards/research/p/r1')).holdout_result).toMatchObject({ baseline: 0.777, final: 1.554, delta: 0.777 });
    expect((await call('ar_status', { run_id: 'r1' })).holdout).toMatchObject({ final: 1.554 });
  });

  it('a changed holdout path is a tamper and ar_end refuses to score the holdout', async () => {
    await call('ar_start', hArgs());
    write(root, 'holdout/data.txt', '5\n');
    expect(await call('ar_iterate', { hypothesis: 'peek' })).toMatchObject({ decision: 'red', failure: 'tamper', tampered: ['holdout'], stop_reason: 'tamper' });
    const e = await call('ar_end', { reason: 'tamper' });
    expect(runs()).toBe(1);
    expect(e.holdout).toMatchObject({ tampered: ['holdout'], final: null });
    expect(sh(root, 'log', '-1', '--format=%(trailers:key=AR-Holdout,valueonly)', 'refs/shards/research/p/r1')).toBe('tampered (holdout)');
  });

  it('validates the holdout configuration and supports skip_holdout', async () => {
    await expect(call('ar_start', startArgs({ holdout_paths: ['holdout'] }))).rejects.toThrow(/holdout_paths needs a holdout command/);
    await expect(call('ar_start', hArgs({ mutable: ['holdout/**'] }))).rejects.toThrow(/inside an immutable \(holdout\) path/);
    await call('ar_start', hArgs({ holdout: { command: `HC=${hc} node eval/holdout.js`, metric_regex: 'holdout score=([-0-9.eE]+)', baseline: false } }));
    expect(fs.existsSync(hc)).toBe(false);
    const e = await call('ar_end', { reason: 'user-interrupt', skip_holdout: true });
    expect(e.holdout).toMatchObject({ skipped: true });
    expect(fs.existsSync(hc)).toBe(false);
    expect(sh(root, 'log', '-1', '--format=%(trailers:key=AR-Holdout,valueonly)', 'refs/shards/research/p/r1')).toBe('skipped');
  });

  it('branch run: the holdout runs in the worktree on the branch kept state before the worktree is removed', async () => {
    const s = await call('ar_start', hArgs({ branch: 'a' }));
    expect(s.holdout).toMatchObject({ sealed: true });
    expect(fs.existsSync(path.join(root, R.SEALED, 'p/r1/a.json'))).toBe(true);
    write(path.join(root, '.shards/worktrees/r1/a'), 'src/model.txt', '3\n');
    await call('ar_iterate', { hypothesis: 'up', branch: 'a' });
    const e = await call('ar_end', { reason: 'done', branch: 'a' });
    expect(e.holdout).toMatchObject({ baseline: 0.777, final: 2.331 });
    expect(e.worktree_removed).toBe(true);
    expect(read('shards/p/experiments/branches/a/holdout.log')).toMatch(/holdout score=2\.331/);
    expect(read('src/model.txt')).toBe('1\n# a\n# b\n'); // the main tree was never scored or touched
  });
});

describe('fixed compute budget (Karpathy mode, issue #91 H5)', () => {
  it('passes SHARDS_AR_COMPUTE_BUDGET_S, derives the kill timeout and records it in AR-Config', async () => {
    const s = await call('ar_start', startArgs({ eval: { command: 'node eval/score.js', metric_regex: 'score=([-0-9.eE]+)', name: 'score', direction: 'maximize', repeats: 1, fixed_budget_s: 7 } }));
    expect(s).toMatchObject({ compute_budget_s: 7, timeout_s: 67 });
    expect(read('shards/p/experiments/iter_0.log')).toMatch(/budget=7 kind=full/);
    expect(trailersOf('refs/shards/research/p/r1')).toMatch(/AR-Config: .*"fixed_budget_s":7,"timeout_grace_s":60/);
    model('2\n# a\n# b\n');
    await call('ar_iterate', { hypothesis: 'up' });
    expect(read('shards/p/experiments/iter_1.log')).toMatch(/budget=7 kind=full/);
    expect(await call('ar_status', {})).toMatchObject({ compute_budget_s: 7, timeout_s: 67 });
  });

  it('kills an eval that overruns the budget plus grace (a timeout RED) and validates the budget', async () => {
    await expect(call('ar_start', startArgs({ eval: { ...startArgs().eval, fixed_budget_s: 30, timeout_s: 20 } }))).rejects.toThrow(/must exceed fixed_budget_s/);
    await expect(call('ar_start', startArgs({ eval: { ...startArgs().eval, fixed_budget_s: 3, compute_budget_s: 4 } }))).rejects.toThrow(/aliases/);
    const { timeout_s: _t, ...ev } = startArgs().eval;
    const s = await call('ar_start', startArgs({ eval: { ...ev, repeats: 1, compute_budget_s: 0.5, timeout_grace_s: 0.5 } }));
    expect(s).toMatchObject({ compute_budget_s: 0.5, timeout_s: 1 });
    model('sleep\n');
    expect(await call('ar_iterate', { hypothesis: 'ignores the budget' })).toMatchObject({ decision: 'red', failure: 'timeout', kept: false });
  }, 20000);
});

describe('proxy / full evals and unwind (issue #91, bug 8)', () => {
  beforeEach(() => {
    write(root, 'eval/proxy.js', PROXY);
    sh(root, 'add', '-A'); sh(root, 'commit', '-q', '-m', 'proxy');
  });
  const pArgs = (o = {}) => startArgs({ eval: { ...startArgs().eval, proxy: { command: 'node eval/proxy.js', metric_regex: 'score=([-0-9.eE]+)' }, full_every: 3 }, ...o });
  const lastTr = (k, ref = 'refs/shards/research/p/r1') => sh(root, 'log', '-1', `--format=%(trailers:key=${k},valueonly)`, ref);

  it('runs the proxy by default, the full eval every K-th iteration, and unwinds a proxy chain the full eval does not confirm', async () => {
    const s = await call('ar_start', pArgs());
    expect(s.proxy).toMatchObject({ baseline: 1, epsilon_abs: 0.01, full_every: 3 });
    expect(read('shards/p/experiments/iter_0.log')).toMatch(/kind=proxy/);
    write(root, 'src/proxy.txt', '2\n');
    const i1 = await call('ar_iterate', { hypothesis: 'fool proxy 2' });
    expect(i1).toMatchObject({ eval_type: 'proxy', decision: 'green', kept: true, before: 1, after: 2, proxy_reference: 2, bestSoFar: 1 });
    expect(lastTr('AR-Eval')).toBe('proxy');
    write(root, 'src/proxy.txt', '3\n');
    expect(await call('ar_iterate', { hypothesis: 'fool proxy 3' })).toMatchObject({ eval_type: 'proxy', decision: 'green', kept: true });
    expect((await call('ar_status', {})).proxy.unverified_kept).toEqual([1, 2]);
    // iteration 3 is full: the model never improved, so the full eval disagrees with the proxy chain
    const i3 = await call('ar_iterate', { hypothesis: 'no-op' });
    expect(i3).toMatchObject({ eval_type: 'full', decision: 'yellow', kept: false, before: 1, after: 1, unwound: [1, 2], proxy_reference: 1, lastFullCommit: sh(root, 'rev-parse', 'HEAD') });
    expect(fs.existsSync(path.join(root, 'src/proxy.txt'))).toBe(false);
    expect(lastTr('AR-Unwind')).toBe('1,2');
    expect(lastTr('AR-Revert')).toBe(sh(root, 'rev-parse', 'HEAD'));
    expect(sh(root, 'log', '-1', '--skip=1', '--format=%(trailers:key=AR-Eval,valueonly)', 'refs/shards/research/p/r1')).toBe('full');
    let st = await call('ar_status', {});
    expect(st).toMatchObject({ lastKeptCommit: sh(root, 'rev-parse', 'HEAD'), lastGreenCommit: sh(root, 'rev-parse', 'HEAD'), decisions: { unwound: 2 }, proxy: { reference: 1, unverified_kept: [] } });
    // a real improvement: proxy GREENs, then the full eval confirms the chain (kept, proxy re-anchored)
    model('2\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'model 2' })).toMatchObject({ iteration: 4, eval_type: 'proxy', decision: 'green' });
    model('3\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'model 3' })).toMatchObject({ iteration: 5, eval_type: 'proxy', decision: 'green' });
    const i6 = await call('ar_iterate', { hypothesis: 'verify' });
    expect(i6).toMatchObject({ iteration: 6, eval_type: 'full', decision: 'green', kept: true, before: 1, after: 3, bestSoFar: 3, proxy_reference: 3, unwound: [] });
    expect(i6.lastFullCommit).toBe(i6.commit);
    // full: true forces a full eval out of cadence
    model('2.5\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'worse', full: true })).toMatchObject({ iteration: 7, eval_type: 'full', decision: 'red', kept: false, unwound: [] });
    expect(read('src/model.txt')).toBe('3\n# a\n# b\n');
    st = await call('ar_status', {});
    // rebuild in a new session gives the same pointers and references
    key = 'sess-proxy'; state = new StateStore(root, key);
    const rb = await call('ar_status', { run_id: 'r1' });
    expect(rb).toMatchObject({ source: 'ref', lastKeptCommit: st.lastKeptCommit, lastGreenCommit: st.lastGreenCommit, comparisonReference: 3, decisions: { unwound: 2 }, proxy: { reference: 3, lastFullCommit: i6.commit, unverified_kept: [] } });
    expect(rb.recent.filter((x) => x.unwound).map((x) => x.n)).toEqual([1, 2]);
    await call('ar_status', { run_id: 'r1', resume: true });
    model('4\n# a\n# b\n');
    expect(await call('ar_iterate', { hypothesis: 'model 4' })).toMatchObject({ iteration: 8, eval_type: 'proxy', decision: 'green', before: 3, after: 4 });
  });

  it('a retro-revert in proxy mode moves the full-verified pointer back too', async () => {
    await call('ar_start', pArgs({ eval: { ...pArgs().eval, full_every: 2 } }));
    model('2\n# a\n# b\n'); await call('ar_iterate', { hypothesis: 'p2' });
    const f2 = await call('ar_iterate', { hypothesis: 'verify' });
    expect(f2).toMatchObject({ eval_type: 'full', decision: 'green', kept: true });
    model('3\n# a\n# b\n'); await call('ar_iterate', { hypothesis: 'p3' });
    await call('ar_defer', { kind: 'retro_revert', retro_to_iteration: 1, detail: 'leak' });
    const st = await call('ar_status', {});
    expect(st).toMatchObject({ comparisonReference: 1, proxy: { reference: 1, lastFullCommit: sh(root, 'rev-parse', 'HEAD') } });
    expect(read('src/model.txt')).toBe('1\n# a\n# b\n');
  });

  it('validates the proxy configuration', async () => {
    await expect(call('ar_start', startArgs({ eval: { ...startArgs().eval, full_every: 2 } }))).rejects.toThrow(/full_every needs eval.proxy/);
    await expect(call('ar_start', pArgs({ eval: { ...pArgs().eval, proxy: { command: 'node eval/proxy.js' } } }))).rejects.toThrow(/eval.proxy needs exactly one of/);
  });

  it('branch run: proxy and full evals run in the worktree and an unwind restores the worktree', async () => {
    await call('ar_start', pArgs({ branch: 'a', eval: { ...pArgs().eval, full_every: 2 } }));
    const w = path.join(root, '.shards/worktrees/r1/a');
    write(w, 'src/proxy.txt', '5\n');
    expect(await call('ar_iterate', { hypothesis: 'fool', branch: 'a' })).toMatchObject({ eval_type: 'proxy', decision: 'green' });
    expect(await call('ar_iterate', { hypothesis: 'verify', branch: 'a' })).toMatchObject({ eval_type: 'full', kept: false, unwound: [1] });
    expect(fs.existsSync(path.join(w, 'src/proxy.txt'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'shards/p/experiments/branches/a/iter_2.log'))).toBe(true);
    expect(lastTr('AR-Unwind', 'refs/shards/research/p/r1/a')).toBe('1');
    await call('ar_end', { reason: 'done', branch: 'a' });
  });
});
