import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const { buildHeader, headerInfoFromStore } = require('../runtime/header');
const copies = require('../runtime/copies');

let root; let state; let reg;
const ctx = () => ({ root, getConfig: () => ({ config: {} }), state, sessionKey: 's1' });
const report = (a) => reg.call('copy_report', a, ctx());
const text = (r) => r.content[1].text;
const hdr = () => buildHeader(headerInfoFromStore(state));
const data = (r) => JSON.parse(text(r).slice(text(r).lastIndexOf('\n\n{') + 2));
const confirm = (id, status = 'confirmed') => state.update('gates', (c) => { c.gates = c.gates || {}; c.gates[id] = { id, status, kind: 'phase', frame: 'f' }; return c; });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('copy_report', () => {
  it('is registered with a required-field schema', () => {
    const t = reg.list().find((x) => x.name === 'copy_report');
    expect(t.inputSchema.required).toEqual(['gate_id', 'target', 'ok']);
  });
  it('rejects unknown and unconfirmed gates', async () => {
    let r = await report({ gate_id: 'nope', target: 'confluence', ok: true });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/unknown gate/);
    await confirm('g1', 'pending');
    r = await report({ gate_id: 'g1', target: 'confluence', ok: true });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/only made for confirmed gates/);
  });
  it('a success records done and leaves the queue empty', async () => {
    await confirm('g1');
    const r = await report({ gate_id: 'g1', target: 'confluence', ok: true });
    expect(data(r)).toMatchObject({ result: 'done', attempts: 0, queue: [] });
    expect(hdr()).toContain('q=0');
  });
  it('a failure is queued, shown in the header, and cleared when a retry succeeds', async () => {
    await confirm('g1');
    const r = await report({ gate_id: 'g1', target: 'confluence', ok: false, error: 'offline' });
    expect(data(r)).toMatchObject({ result: 'queued', attempts: 1 });
    expect(data(r).queue).toEqual([{ gate_id: 'g1', target: 'confluence', status: 'queued', attempts: 1, last_error: 'offline' }]);
    expect(hdr()).toMatch(/q=1\]$/);
    await report({ gate_id: 'g1', target: 'confluence', ok: true });
    expect(hdr()).toMatch(/q=0\]$/);
    expect(copies.queued({ root, sessionKey: 's1' })).toEqual([]);
  });
  it('is stuck after 5 failed attempts, shown in the header, and stays stuck', async () => {
    await confirm('g1');
    const results = [];
    for (let i = 0; i < 5; i++) results.push(data(await report({ gate_id: 'g1', target: 'jira', ok: false, error: `e${i}` })).result);
    expect(results).toEqual(['queued', 'queued', 'queued', 'queued', 'stuck']);
    expect(hdr()).toMatch(/q=0 stuck=1\]$/);
    expect(data(await report({ gate_id: 'g1', target: 'jira', ok: false })).result).toBe('stuck');
    expect(copies.stuck({ root, sessionKey: 's1' })[0]).toMatchObject({ gate_id: 'g1', target: 'jira', attempts: 6 });
  });
  it('tracks gates and targets independently', async () => {
    await confirm('g1'); await confirm('g2');
    await report({ gate_id: 'g1', target: 'confluence', ok: false, error: 'x' });
    await report({ gate_id: 'g1', target: 'jira', ok: true });
    await report({ gate_id: 'g2', target: 'confluence', ok: false, error: 'y' });
    expect(copies.queued({ root, sessionKey: 's1' }).map((q) => `${q.gate_id}|${q.target}`)).toEqual(['g1|confluence', 'g2|confluence']);
    expect(hdr()).toMatch(/q=2\]$/);
  });
  it('header stays within the token limit with a stuck count', () => {
    const { estimateTokens, HEADER_TOKEN_LIMIT } = require('../runtime/header');
    const h = buildHeader({ version: 123456789, agent: 'x'.repeat(60), phase: 'p'.repeat(60), gate: 'g'.repeat(60), queued: 12, stuck: 3 });
    expect(estimateTokens(h)).toBeLessThanOrEqual(HEADER_TOKEN_LIMIT);
  });
});

describe('gate_request surfaces the copy queue', () => {
  const gateArgs = (id) => ({ id, kind: 'phase', phase: 1, summary: 's', record_ref: 'analysis/p/project-specs.md' });
  it('lists queued copies (text and copy_queue) on a new pending gate and on an already-confirmed gate', async () => {
    await confirm('g0');
    await report({ gate_id: 'g0', target: 'confluence', ok: false, error: 'offline' });
    let r = await reg.call('gate_request', gateArgs('g1'), ctx());
    expect(text(r)).toMatch(/Queued external copies to retry now.*g0->confluence/);
    expect(data(r).copy_queue).toEqual([expect.objectContaining({ gate_id: 'g0', target: 'confluence', attempts: 1 })]);
    r = await reg.call('gate_request', gateArgs('g0'), ctx());
    expect(data(r)).toMatchObject({ result: 'already_confirmed' });
    expect(data(r).copy_queue).toHaveLength(1);
  });
  it('lists stuck copies separately and nothing when the queue is empty', async () => {
    let r = await reg.call('gate_request', gateArgs('g1'), ctx());
    expect(data(r).copy_queue).toEqual([]);
    expect(data(r).copy_stuck).toBeUndefined();
    await confirm('g0');
    for (let i = 0; i < 5; i++) await report({ gate_id: 'g0', target: 'jira', ok: false, error: 'x' });
    r = await reg.call('gate_request', gateArgs('g1'), ctx());
    expect(data(r).copy_queue).toEqual([]);
    expect(data(r).copy_stuck).toEqual([expect.objectContaining({ gate_id: 'g0', target: 'jira', status: 'stuck' })]);
    expect(text(r)).toMatch(/Stuck copies/);
  });
});
