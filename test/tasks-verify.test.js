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
const specs = () => fs.readFileSync(path.join(root, 'analysis/p/project-specs.md'), 'utf8');
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
    fs.writeFileSync(path.join(root, 'analysis/p/project-specs.md'), '# S\n\n## Validation\n\n### Evidence\n\n| Check | Expected | Observed | Pass/Fail | Notes |\n|---|---|---|---|---|\n| old | x | y | ✓ | |\n\n## Other\n\ntext\n');
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
