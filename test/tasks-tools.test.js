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
const leases = require('../runtime/leases');

let root; let state; let reg;
const sess = () => ({ root, sessionKey: 's1', state });
const cfg = (jobs) => () => ({ config: jobs ? { jobs } : {} });
const call = (name, args, getConfig = cfg()) => reg.call(name, args, { root, getConfig, state, sessionKey: 's1' });
const text = (r) => r.content[1].text;
const task = (id, o = {}) => ({ id, goal: `goal ${id}`, plan_ref: 'project-specs.md#p', inputs: ['in.csv'], owned_paths: [`out/${id}/`], acceptance: { command: 'true', expected: 'exit 0' }, worker: 'bi-engineer', size: 10, ...o });
const manifest = (...t) => ({ version: 1, tasks: t });
const result = (o = {}) => ({ status: 'done', files_changed: ['out/a/x'], check: { command: 'true', exit_code: 0, output_excerpt: 'ok' }, deviations: [], open_questions: [], ...o });
const cards = (r) => JSON.parse(text(r).slice(text(r).indexOf('{\n  "cards"'))).cards;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'tk-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});

describe('tasks_set', () => {
  it('writes tasks.yaml under the frame output_dir and mirrors TASKS.md', async () => {
    const r = await call('tasks_set', { manifest: manifest(task('a'), task('b', { depends_on: ['a'] })) });
    expect(r.isError).toBeFalsy();
    expect(fs.existsSync(path.join(root, 'analysis/p/tasks.yaml'))).toBe(true);
    const md = fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8');
    expect(md).toContain('<!-- generated from analysis/p/tasks.yaml by shards; edit tasks.yaml, not this file -->');
    expect(md).toContain('- [ ] a (bi-engineer): goal a (pending)');
    expect(text(r)).toContain('"ready": [\n    "a"\n  ]');
  });
  it('reads a YAML path', async () => {
    const YAML = require('yaml');
    fs.mkdirSync(path.join(root, 'x'));
    fs.writeFileSync(path.join(root, 'x/tasks.yaml'), YAML.stringify(manifest(task('a'))));
    const r = await call('tasks_set', { path: 'x/tasks.yaml' });
    expect(r.isError).toBeFalsy();
    expect(fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8')).toContain('generated from x/tasks.yaml');
  });
  it('lists all problems and stores nothing', async () => {
    const r = await call('tasks_set', { manifest: manifest(task('a', { depends_on: ['zz'], owned_paths: ['/abs'] }), task('a')) });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/duplicate[\s\S]*unknown task "zz"[\s\S]*unsafe/);
    expect(state.read('tasks').manifest).toBeFalsy();
  });
  it('requires exactly one of manifest|path and resolvable output_dir; skips non-git binding', async () => {
    expect((await call('tasks_set', {})).isError).toBe(true);
    expect((await call('tasks_set', { manifest: manifest(task('a')), path: 'x' })).isError).toBe(true);
    const other = new StateStore(root, 's2');
    const r = await reg.call('tasks_set', { manifest: manifest(task('a')) }, { root, getConfig: cfg(), state: other, sessionKey: 's2' });
    expect(text(r)).toMatch(/cannot resolve output_dir/);
    const r2 = await call('tasks_set', { manifest: manifest(task('a')) }, cfg({ tasks: { binding: 'linear', options: {} } }));
    expect(r2.isError).toBeFalsy();
    expect(fs.existsSync(path.join(root, 'TASKS.md'))).toBe(false);
    expect(text(r2)).toContain('mirror_note');
  });
  it('rejects mirror path escaping root', async () => {
    const r = await call('tasks_set', { manifest: manifest(task('a')) }, cfg({ tasks: { binding: 'git', options: { path: '../evil.md' } } }));
    expect(r.isError).toBe(true);
  });
  it('calls assertMayReplace when a manifest exists', async () => {
    const T = require('../runtime/tasks');
    await call('tasks_set', { manifest: manifest(task('a')) });
    T.setHooks({ assertMayReplace() { throw new Error('plan locked'); } });
    try {
      const r = await call('tasks_set', { manifest: manifest(task('a')) });
      expect(text(r)).toContain('plan locked');
    } finally { T.setHooks({ assertMayReplace() {} }); }
  });
});

describe('dispatch / report / status', () => {
  beforeEach(async () => {
    await call('tasks_set', { manifest: manifest(task('a'), task('b', { depends_on: ['a'] }), task('c', { delegate: 'inline', phase: 9 })) });
  });
  it('dispatch opens a lease with owned_paths; inline opens none', async () => {
    const r = await call('task_dispatch', { ids: ['a', 'c'] });
    expect(r.isError).toBeFalsy();
    const cs = cards(r);
    expect(cs.find((c) => c.id === 'a')).toMatchObject({ inline: false, owned_paths: ['out/a/'], worker: 'bi-engineer', entry_file: 'Entry worker: read agents/bi-engineer/modes/worker.md first' });
    expect(cs.find((c) => c.id === 'c')).toMatchObject({ inline: true, lease_id: null });
    const active = leases.listActive(sess());
    expect(active).toHaveLength(1);
    expect(active[0].slices[0].paths).toEqual(['out/a']);
    const st = state.read('tasks').tasks;
    expect(st.a).toMatchObject({ status: 'dispatched', attempts: 1, lease_id: active[0].id });
    expect(fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8')).toContain('(dispatched)');
  });
  it('refuses unmet deps, unknown, and re-dispatch atomically', async () => {
    const r = await call('task_dispatch', { ids: ['a', 'b'] });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/b: unmet dependencies: a/);
    expect(leases.listActive(sess())).toHaveLength(0);
    expect(state.read('tasks').tasks.a.status).toBe('pending');
    await call('task_dispatch', { ids: ['a'] });
    const r2 = await call('task_dispatch', { ids: ['a'] });
    expect(text(r2)).toMatch(/a: status is dispatched/);
    expect(text(await call('task_dispatch', { ids: ['zz'] }))).toMatch(/unknown task/);
  });
  it('report validates, closes lease, maps status; dependents become ready', async () => {
    await call('task_dispatch', { ids: ['a'] });
    const bad = await call('task_report', { id: 'a', result: { status: 'done' } });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toContain('rejected');
    expect((await call('task_report', { id: 'b', result: result() })).isError).toBe(true);
    const r = await call('task_report', { id: 'a', result: result() });
    expect(r.isError).toBeFalsy();
    expect(leases.listActive(sess())).toHaveLength(0);
    expect(state.read('tasks').tasks.a.status).toBe('reported');
    const s = JSON.parse(text(await call('task_status', {})));
    expect(s.ready).toEqual(['c']);
    expect(s.counts.reported).toBe(1);
    expect(fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8')).toContain('- [ ] a (bi-engineer): goal a (reported)');
  });
  it('failed -> retry allowed; blocked stored', async () => {
    await call('task_dispatch', { ids: ['a'] });
    await call('task_report', { id: 'a', result: result({ status: 'failed' }) });
    expect(state.read('tasks').tasks.a.status).toBe('failed');
    expect((await call('task_dispatch', { ids: ['a'] })).isError).toBeFalsy();
    expect(state.read('tasks').tasks.a.attempts).toBe(2);
    await call('task_report', { id: 'a', result: result({ status: 'blocked' }) });
    expect(state.read('tasks').tasks.a.status).toBe('blocked');
  });
  it('done tasks check the box; status lists fields; no manifest message', async () => {
    const T = require('../runtime/tasks');
    await state.update('tasks', (c) => { c.tasks.a.status = 'done'; return c; });
    T.mirrorTasksMd({ root, getConfig: cfg() }, { ...T.readTasksState(state) });
    expect(fs.readFileSync(path.join(root, 'TASKS.md'), 'utf8')).toContain('- [x] a (bi-engineer): goal a');
    const s = JSON.parse(text(await call('task_status', {})));
    expect(s.tasks[0]).toMatchObject({ id: 'a', status: 'done', worker: 'bi-engineer', depends_on: [], attempts: 0, paused_reason: null });
    const other = new StateStore(root, 's3');
    const r = await reg.call('task_status', {}, { root, getConfig: cfg(), state: other, sessionKey: 's3' });
    expect(text(r)).toMatch(/No task manifest/);
  });
  it('paused tasks are not ready and cannot dispatch', async () => {
    await state.update('tasks', (c) => { c.tasks.a.paused_reason = 'deviation'; return c; });
    expect(JSON.parse(text(await call('task_status', {}))).ready).toEqual(['c']);
    expect(text(await call('task_dispatch', { ids: ['a'] }))).toMatch(/paused/);
  });
});
