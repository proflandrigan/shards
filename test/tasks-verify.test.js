import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');

let root; let state; let reg;
const call = (name, args) => reg.call(name, args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1' });
const text = (r) => r.content[1].text;
const task = (id, o = {}) => ({ id, goal: `goal ${id}`, plan_ref: 'project-specs.md#p', inputs: ['in.csv'], owned_paths: [`out/${id}/`], acceptance: { command: 'true', expected: 'exit 0' }, worker: 'bi-engineer', size: 10, ...o });
const result = (o = {}) => ({ status: 'done', files_changed: [], check: { command: 'true', exit_code: 0, output_excerpt: 'ok' }, deviations: [], open_questions: [], ...o });
const st = () => state.read('tasks').tasks;
const specs = () => fs.readFileSync(path.join(root, 'shards/p/project-specs.md'), 'utf8');
const verify = (id, pass, extra = {}) => call('task_verify', { id, pass, expected: 'exit 0', observed: pass ? 'exit 0' : 'exit 1: boom', ...extra });
const runOnce = async (id, status = 'done') => { await call('task_dispatch', { ids: [id] }); await call('task_report', { id, result: result({ status }) }); };

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
  await call('tasks_set', { manifest: { version: 1, tasks: [task('a'), task('b', { depends_on: ['a'] })] } });
});

describe('task_verify', () => {
  it('reported does not satisfy dependencies; verify pass does and writes evidence', async () => {
    await runOnce('a');
    expect(st().a.status).toBe('reported');
    expect(text(await call('task_dispatch', { ids: ['b'] }))).toMatch(/unmet dependencies: a \(reported\)/);
    const r = await verify('a', true);
    expect(r.isError).toBeFalsy();
    expect(st().a.status).toBe('done');
    expect(specs()).toMatch(/## Validation\n\n### Evidence\n\n\| Check \| Expected \| Observed \| Pass\/Fail \| Notes \|\n\|---\|---\|---\|---\|---\|\n\| a: goal a \[true\] \| exit 0 \| exit 0 \| \u2713 \| +\|/);
    expect((await call('task_dispatch', { ids: ['b'] })).isError).toBeFalsy();
  });
  it('appends to the last existing Validation evidence table', async () => {
    fs.writeFileSync(path.join(root, 'shards/p/project-specs.md'), '# S\n\n## Validation\n\n### Evidence\n\n| Check | Expected | Observed | Pass/Fail | Notes |\n|---|---|---|---|---|\n| old | x | y | ✓ | |\n\n## Other\n\ntext\n');
    await runOnce('a'); await verify('a', true);
    const s = specs();
    expect(s.indexOf('| old')).toBeLessThan(s.indexOf('| a: goal a'));
    expect(s.indexOf('| a: goal a')).toBeLessThan(s.indexOf('## Other'));
  });
  it('requires reported status', async () => {
    expect((await verify('a', true)).isError).toBe(true);
    expect((await verify('zz', true)).isError).toBe(true);
  });
  it('failing task is retried with feedback then escalated after 2 retries', async () => {
    await runOnce('a'); await verify('a', false);
    expect(st().a).toMatchObject({ status: 'failed', feedback: 'exit 1: boom' });
    let r = await call('task_dispatch', { ids: ['a'] });
    expect(JSON.parse(text(r).slice(text(r).indexOf('{\n  "cards"'))).cards[0].feedback).toBe('exit 1: boom');
    await call('task_report', { id: 'a', result: result() }); await verify('a', false);
    expect(st().a.status).toBe('failed');
    await call('task_dispatch', { ids: ['a'] });
    expect(st().a.attempts).toBe(3);
    await call('task_report', { id: 'a', result: result() });
    r = await verify('a', false);
    expect(st().a).toMatchObject({ status: 'blocked', escalated: true });
    expect(text(r)).toMatch(/ask the user/);
    expect((await call('task_dispatch', { ids: ['a'] })).isError).toBe(true);
    expect((specs().match(/✗/g) || []).length).toBe(3);
    expect(JSON.parse(text(await call('task_status', {}))).tasks[0]).toMatchObject({ escalated: true, feedback: 'exit 1: boom' });
  });
  it('worker claiming success but failing re-check is caught', async () => {
    await runOnce('a');
    expect(st().a.status).toBe('reported');
    await verify('a', false);
    expect(st().a.status).toBe('failed');
    expect(st().a.feedback).toBeTruthy();
  });
  it('every done task has an evidence row', async () => {
    await runOnce('a'); await verify('a', true);
    await runOnce('b'); await verify('b', true);
    const s = specs();
    for (const [id, v] of Object.entries(st())) if (v.status === 'done') expect(s).toContain(`| ${id}: goal ${id}`);
  });
  it('worker-reported failed at 3 attempts is blocked and escalated', async () => {
    await runOnce('a', 'failed');
    await runOnce('a', 'failed');
    expect(st().a.status).toBe('failed');
    await runOnce('a', 'failed');
    expect(st().a).toMatchObject({ status: 'blocked', escalated: true });
    expect((await call('task_dispatch', { ids: ['a'] })).isError).toBe(true);
  });
});

describe('task_verify AR iteration outcome (issue #91, bug 22)', () => {
  const WT = '.shards/worktrees/r1/a';
  const arTask = (n, o = {}) => task(`it${n}`, {
    goal: `AR iteration ${n}`, owned_paths: [`${WT}/src/`], worker: 'ml-engineer',
    acceptance: { command: 'node eval/score.js', expected: 'prints score=<x>', cwd: WT },
    ar: { run_id: 'r1', branch: 'a', iteration: n }, ...(n > 1 ? { depends_on: [`it${n - 1}`] } : {}), ...o,
  });
  const arVerify = (id, extra) => call('task_verify', { id, pass: true, expected: 'eval ran', observed: 'score=0.5', ...extra });
  const seedRun = (iterations) => state.update('research', (cur) => {
    cur.runs = { 'r1/a': { run_id: 'r1', branch: 'a', status: 'active', ref: 'refs/shards/research/p/r1/a', iterations } };
    return cur;
  });
  beforeEach(async () => {
    state = new StateStore(root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-ar-')), 's1');
    await pushFrame(state, { agent: 'ml-engineer', project: 'p' });
    await call('tasks_set', { manifest: { version: 1, tasks: [arTask(1)] }, scope: 'shards/p/experiments/branches/a' });
  });
  const sc = { scope: 'shards/p/experiments/branches/a' };
  const stS = () => state.read(require('../runtime/tasks').stateNameFor(sc.scope)).tasks;

  it('a RED is done(reverted), not failed, and uses no retry; cards append one at a time', async () => {
    let r = await call('task_dispatch', { ids: ['it1'], ...sc });
    const card = JSON.parse(text(r).slice(text(r).indexOf('{\n  "cards"'))).cards[0];
    expect(card).toMatchObject({ ar: { run_id: 'r1', branch: 'a', iteration: 1 }, acceptance: { cwd: WT }, owned_paths: [`${WT}/src/`] });
    await call('task_report', { id: 'it1', result: result({ check: { command: 'node eval/score.js', exit_code: 0, output_excerpt: 'score=0.5' }, metric: { name: 'score', value: 0.5 } }), ...sc });
    r = await arVerify('it1', { metric_outcome: 'red', ...sc });
    expect(r.isError).toBeFalsy();
    expect(stS().it1).toMatchObject({ status: 'done', ar_outcome: { metric_outcome: 'red', result: 'reverted' }, attempts: 1 });
    expect(text(r)).toMatch(/not a failure: no retry/);
    expect(fs.readFileSync(path.join(root, 'shards/p/experiments/branches/a/project-specs.md'), 'utf8')).toMatch(/AR RED: reverted/);
    expect(fs.readFileSync(path.join(root, 'shards/p/experiments/branches/a/TASKS.md'), 'utf8')).toMatch(/\[x\] it1 .*\(AR red: reverted\)/);
    // the next iteration card is appended without an amendment gate and is ready (reverted = done)
    r = await call('tasks_set', { manifest: { version: 1, tasks: [arTask(2)] }, append: true, ...sc });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/ready: it2/);
    expect(stS().it1.status).toBe('done');
    expect((await call('tasks_set', { manifest: { version: 1, tasks: [task('plain')] }, append: true, ...sc })).isError).toBe(true);
    expect((await call('tasks_set', { manifest: { version: 1, tasks: [arTask(3, { depends_on: [] })] }, append: true, ...sc })).isError).toBe(true); // overlaps it2 in parallel
  });

  it('derives the outcome from the ar_iterate record and rejects contradictions', async () => {
    await seedRun([{ n: 1, decision: 'yellow', kept: true, commit: 'c1' }]);
    await call('task_dispatch', { ids: ['it1'], ...sc }); await call('task_report', { id: 'it1', result: result(), ...sc });
    expect((await arVerify('it1', { ar_iteration: 1, metric_outcome: 'red', ...sc })).isError).toBe(true);
    expect((await arVerify('it1', { ar_iteration: 2, ...sc })).isError).toBe(true);
    expect((await arVerify('it1', { ar_iteration: 1, ...sc })).isError).toBeFalsy();
    expect(stS().it1).toMatchObject({ status: 'done', ar_outcome: { metric_outcome: 'yellow', result: 'kept', iteration: 1, commit: 'c1' } });
  });

  it('an AR card needs the AR arguments, its own iteration, and an iteration backs one card', async () => {
    await seedRun([{ n: 1, decision: 'green', kept: true, commit: 'c1' }, { n: 2, decision: 'red', kept: false, commit: 'c2' }]);
    await call('task_dispatch', { ids: ['it1'], ...sc }); await call('task_report', { id: 'it1', result: result(), ...sc });
    expect(text(await arVerify('it1', { ...sc }))).toMatch(/AR iteration card: call ar_iterate/);
    expect(text(await arVerify('it1', { ar_iteration: 2, ...sc }))).toMatch(/card for iteration 1, not 2/);
    expect((await arVerify('it1', { ar_iteration: 1, ...sc })).isError).toBeFalsy();
    await call('tasks_set', { manifest: { version: 1, tasks: [arTask(2, { ar: { run_id: 'r1', branch: 'a' } })] }, append: true, ...sc });
    await call('task_dispatch', { ids: ['it2'], ...sc }); await call('task_report', { id: 'it2', result: result(), ...sc });
    expect(text(await arVerify('it2', { ar_iteration: 1, ...sc }))).toMatch(/already recorded on task it1/);
  });

  it('validates the outcome arguments', async () => {
    await call('task_dispatch', { ids: ['it1'], ...sc }); await call('task_report', { id: 'it1', result: result(), ...sc });
    expect(text(await arVerify('it1', { metric_outcome: 'yellow', ...sc }))).toMatch(/YELLOW outcome needs kept/);
    expect(text(await arVerify('it1', { metric_outcome: 'red', kept: true, ...sc }))).toMatch(/impossible/);
    expect((await arVerify('it1', { metric_outcome: 'yellow', kept: false, ...sc })).isError).toBeFalsy();
    expect(stS().it1.ar_outcome.result).toBe('reverted');
  });

  it('metric_outcome is refused for a non-AR card; pass=false there still fails and retries', async () => {
    await call('tasks_set', { manifest: { version: 1, tasks: [task('a')] }, output_dir: 'shards/q' });
    await runOnce('a');
    expect(text(await verify('a', true, { metric_outcome: 'green' }))).toMatch(/only valid for an AR iteration card/);
    await verify('a', false);
    expect(st().a.status).toBe('failed');
  });
});
