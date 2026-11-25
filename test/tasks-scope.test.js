import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const T = require('../runtime/tasks');

let root; let state; let reg;
const call = (name, args) => reg.call(name, args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1' });
const text = (r) => r.content[1].text;
const task = (id, o = {}) => ({ id, goal: `goal ${id}`, plan_ref: 'project-specs.md#p', inputs: ['in.csv'], owned_paths: [`out/${id}/`], acceptance: { command: 'true', expected: 'exit 0' }, worker: 'bi-engineer', size: 10, ...o });
const result = () => ({ status: 'done', files_changed: [], check: { command: 'true', exit_code: 0, output_excerpt: 'ok' }, deviations: [], open_questions: [] });
const A = 'shards/alpha'; const B = 'shards/beta';
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
});

describe('task scopes', () => {
  it('state names are valid, deterministic and distinct', () => {
    expect(T.stateNameFor()).toBe('tasks');
    const a = T.stateNameFor(A);
    expect(a).toMatch(/^tasks-scope-[a-p]+$/);
    expect(T.stateNameFor('./shards/alpha/')).toBe(a);
    expect(T.stateNameFor(B)).not.toBe(a);
  });

  it('two scopes run the full loop independently with identical task ids', async () => {
    const m = () => ({ version: 1, tasks: [task('a'), task('b', { depends_on: ['a'] })] });
    for (const s of [A, B]) {
      const r = await call('tasks_set', { manifest: m(), scope: s });
      expect(r.isError).toBeFalsy();
      expect(fs.existsSync(path.join(root, s, 'tasks.yaml'))).toBe(true);
    }
    // work in A only
    expect((await call('task_dispatch', { ids: ['a'], scope: A })).isError).toBeFalsy();
    expect(state.read(T.stateNameFor(A)).tasks.a.status).toBe('dispatched');
    expect(state.read(T.stateNameFor(B)).tasks.a.status).toBe('pending');
    expect((await call('task_report', { id: 'a', result: result(), scope: A })).isError).toBeFalsy();
    expect((await call('task_verify', { id: 'a', pass: true, expected: 'exit 0', observed: 'exit 0', scope: A })).isError).toBeFalsy();
    expect(state.read(T.stateNameFor(A)).tasks.a.status).toBe('done');
    expect(state.read(T.stateNameFor(B)).tasks.a.status).toBe('pending');
    expect(read(`${A}/project-specs.md`)).toMatch(/\| a: goal a/);
    expect(fs.existsSync(path.join(root, B, 'project-specs.md'))).toBe(false);
    // B independent
    expect(text(await call('task_dispatch', { ids: ['b'], scope: B }))).toMatch(/unmet dependencies: a \(pending\)/);
    expect((await call('task_dispatch', { ids: ['a'], scope: B })).isError).toBeFalsy();
    await call('task_report', { id: 'a', result: result(), scope: B });
    await call('task_verify', { id: 'a', pass: true, expected: 'exit 0', observed: 'exit 0', scope: B });
    expect(read(`${B}/project-specs.md`)).toMatch(/\| a: goal a/);
    expect(text(await call('task_status', { scope: B }))).toMatch(/"ready"/);
    // replacing A's manifest after work started is refused; B unaffected and unscoped state untouched
    expect((await call('tasks_set', { manifest: m(), scope: A })).isError).toBe(true);
    expect(state.read('tasks').manifest).toBeFalsy();
    expect(text(await call('task_status', {}))).toMatch(/No task manifest/);
  });

  it('mirrors TASKS.md into the scope dir, and leases carry scope meta', async () => {
    await call('tasks_set', { manifest: { version: 1, tasks: [task('a')] }, scope: A });
    expect(read(`${A}/TASKS.md`)).toMatch(/- \[ \] a \(bi-engineer\)/);
    expect(fs.existsSync(path.join(root, 'TASKS.md'))).toBe(false);
    await call('task_dispatch', { ids: ['a'], scope: A });
    const lid = state.read(T.stateNameFor(A)).tasks.a.lease_id;
    const leases = JSON.stringify(state.read('leases'));
    expect(leases).toContain(lid);
    expect(leases).toContain(A);
  });

  it('with scope and path, output stays where the file is', async () => {
    fs.mkdirSync(path.join(root, 'x'), { recursive: true });
    fs.writeFileSync(path.join(root, 'x/tasks.yaml'), T.stringifyYaml({ version: 1, tasks: [task('a')] }));
    expect((await call('tasks_set', { path: 'x/tasks.yaml', scope: A })).isError).toBeFalsy();
    expect(state.read(T.stateNameFor(A)).path).toBe('x/tasks.yaml');
    expect(read(`${A}/TASKS.md`)).toContain('a (bi-engineer)');
  });

  it('unscoped behaviour is unchanged', async () => {
    const r = await call('tasks_set', { manifest: { version: 1, tasks: [task('a')] }, output_dir: 'shards/p' });
    expect(r.isError).toBeFalsy();
    expect(state.read('tasks').tasks.a.status).toBe('pending');
    expect(read('TASKS.md')).toContain('a (bi-engineer)');
  });

  it('refuses bad scopes on every tool', async () => {
    for (const scope of ['../x', '/abs/path', 'a/../../b']) {
      expect((await call('tasks_set', { manifest: { version: 1, tasks: [task('a')] }, scope })).isError).toBe(true);
      expect((await call('task_dispatch', { ids: ['a'], scope })).isError).toBe(true);
      expect((await call('task_report', { id: 'a', result: result(), scope })).isError).toBe(true);
      expect((await call('task_status', { scope })).isError).toBe(true);
      expect((await call('task_verify', { id: 'a', pass: true, expected: 'e', observed: 'o', scope })).isError).toBe(true);
    }
  });
});
