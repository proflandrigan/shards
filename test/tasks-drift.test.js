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
const G = require('../runtime/gates');

let root; let state; let reg;
const sess = () => ({ root, sessionKey: 's1', state });
const call = (name, args) => reg.call(name, args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1' });
const text = (r) => r.content[1].text;
const task = (id, o = {}) => ({ id, goal: `goal ${id}`, plan_ref: 'project-specs.md#p', inputs: ['in.csv'], owned_paths: [`out/${id}/`], acceptance: { command: 'true', expected: 'exit 0' }, worker: 'bi-engineer', size: 10, ...o });
const manifest = (...t) => ({ version: 1, tasks: t });
const result = (o = {}) => ({ status: 'done', files_changed: [], check: { command: 'true', exit_code: 0, output_excerpt: 'ok' }, deviations: [], open_questions: [], ...o });
const frame = { id: 'f1', agent: 'data-analyst', phase: 1, track: null, project: 'p' };
const gateReq = (id) => ({ frame, id, kind: 'phase', phase: 1, summary: 's', record_ref: 'r', validates: null });
const deps = { commitGate: async () => ({ outcome: 'committed', sha: 'abc1234' }), replayPending: async () => {}, loadConfig: () => ({ git: {} }), resolveOutputDirs: () => ['analysis/p'] };
const st = () => state.read('tasks');

async function driftSetup() {
  await call('tasks_set', { manifest: manifest(task('a'), task('b', { depends_on: ['a'] }), task('c', { depends_on: ['b'] }), task('d')) });
  await call('task_dispatch', { ids: ['a', 'd'] });
  await call('task_report', { id: 'a', result: result({ deviations: ['schema differs'] }) });
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});

describe('plan drift', () => {
  it('pauses transitive dependents only, opens nothing', async () => {
    await driftSetup();
    const before = JSON.stringify(st().manifest);
    expect(st().tasks.b.status).toBe('paused');
    expect(st().tasks.c.status).toBe('paused');
    expect(st().tasks.b.paused_reason).toBe('dependency a reported deviation');
    expect(st().tasks.d.status).toBe('dispatched');
    expect(st().tasks.a.status).toBe('reported');
    expect(st().drift.open).toBe(true);
    expect(G.listGates(sess())).toEqual([]);
    expect(JSON.stringify(st().manifest)).toBe(before);
    const r = await call('task_status', {});
    expect(text(r)).not.toMatch(/"ready": \[[^\]]*"b"/);
  });
  it('paused tasks refuse dispatch', async () => {
    await driftSetup();
    const r = await call('task_dispatch', { ids: ['b'] });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/paused/);
  });
  it('no deviations means no pause', async () => {
    await call('tasks_set', { manifest: manifest(task('a'), task('b', { depends_on: ['a'] })) });
    await call('task_dispatch', { ids: ['a'] });
    await call('task_report', { id: 'a', result: result() });
    expect(st().tasks.b.status).toBe('pending');
    expect(st().drift).toBeFalsy();
  });
  it('replacement after drift needs a confirmed, unused amendment gate', async () => {
    await driftSetup();
    const m2 = manifest(task('a'), task('b'));
    let r = await call('tasks_set', { manifest: m2 });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/plan_drift/);
    await G.requestGate(sess(), gateReq('data-analyst-amend-1'));
    r = await call('tasks_set', { manifest: m2, amendment_gate: 'data-analyst-amend-1' });
    expect(text(r)).toMatch(/pending/);
    await G.confirmGate(sess(), 'data-analyst-amend-1', { decision: 'confirmed', proof: { tier: 'cli' } }, deps);
    r = await call('tasks_set', { manifest: m2, amendment_gate: 'nope-amend-9' });
    expect(r.isError).toBe(true);
    r = await call('tasks_set', { manifest: m2, amendment_gate: 'data-analyst-amend-1' });
    expect(r.isError).toBeFalsy();
    expect(st().consumed_amendments).toEqual(['data-analyst-amend-1']);
    expect(st().drift).toBeFalsy();
    expect(st().tasks.b.status).toBe('pending');
    // started again, reuse refused
    await call('task_dispatch', { ids: ['a'] });
    r = await call('tasks_set', { manifest: m2, amendment_gate: 'data-analyst-amend-1' });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/already used/);
  });
  it('pre-dispatch replacement is allowed without a gate', async () => {
    await call('tasks_set', { manifest: manifest(task('a')) });
    const r = await call('tasks_set', { manifest: manifest(task('a'), task('b')) });
    expect(r.isError).toBeFalsy();
    expect(st().manifest.tasks).toHaveLength(2);
  });
});
