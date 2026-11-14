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
const gates = require('../runtime/gates');
const schema = require('../core/schema/gate-request.schema.json');

let root; let state; let reg;
const call = (args, key = 's1', st = state) => reg.call('gate_request', args, { root, getConfig: () => ({ config: {} }), state: st, sessionKey: key });
const header = (r) => r.content[0].text;
const text = (r) => r.content[1].text;
const ok = (over = {}) => ({ id: 'data-analyst-phase-1', kind: 'phase', phase: 1, summary: 'scoped', record_ref: 'analysis/p/project-specs.md', ...over });
const PROOF = { tier: 'test' };

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});

describe('gate_request tool', () => {
  it('schema matches inputSchema; no confirm/advance tool exists (D8)', () => {
    const t = reg.list().find((x) => x.name === 'gate_request');
    expect(t.inputSchema).toEqual(schema);
    const names = reg.list().map((x) => x.name);
    // Stage 5 adds tiered confirmation tools (gate_confirm E11.5; the agent still cannot confirm without a real user reply).
    expect(names).toContain('gate_request');
  });
  it('opens a gate, header shows gate id, text names CLI, copy_queue empty', async () => {
    const r = await call(ok());
    expect(r.isError).toBeFalsy();
    expect(header(r)).toContain('data-analyst-phase-1');
    expect(text(r)).toContain('node cli/shards.js gates confirm data-analyst-phase-1 --session s1');
    expect(text(r)).toContain('STOP');
    const data = JSON.parse(text(r).slice(text(r).indexOf('{')));
    expect(data).toMatchObject({ result: 'opened', gate_id: 'data-analyst-phase-1', kind: 'phase', phase: 1, status: 'pending', copy_queue: [], confirm: { milestone: 'A' } });
    expect(data.frame).toMatch(/^f\d+-data-analyst$/);
    expect(gates.getGate({ root, sessionKey: 's1', state }, 'data-analyst-phase-1').agent).toBe('data-analyst');
  });
  it('refuses with an empty stack (consult/fan-out never hold gates)', async () => {
    const other = new StateStore(root, 's2');
    const r = await call(ok(), 's2', other);
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/consult and fan-out workers never hold gates/);
  });
  it('rejects unknown kind, missing record_ref, bad id, extra props, bad phase', async () => {
    for (const bad of [ok({ kind: 'bogus' }), (() => { const o = ok(); delete o.record_ref; return o; })(), ok({ id: '../x' }), ok({ extra: 1 }), ok({ phase: 'x' }), ok({ phase: -1 }), ok({ summary: '' })]) {
      const r = await call(bad);
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('Invalid arguments');
    }
    expect(state.read('gates').gates).toEqual({});
  });
  it('accepts string phase like 6-5', async () => {
    const r = await call(ok({ id: 'ml-engineer-phase-6-5', phase: '6-5' }));
    expect(r.isError).toBeFalsy();
    expect(gates.getGate({ root, sessionKey: 's1', state }, 'ml-engineer-phase-6-5').phase).toBe('6-5');
  });
  it('repeat request of a pending id -> already_pending', async () => {
    await call(ok());
    const r = await call(ok({ summary: 'updated' }));
    expect(text(r)).toContain('"result": "already_pending"');
    expect(gates.getGate({ root, sessionKey: 's1', state }, 'data-analyst-phase-1').summary).toBe('updated');
  });
  it('one pending gate per frame', async () => {
    await call(ok());
    const r = await call(ok({ id: 'data-analyst-phase-2', phase: 2 }));
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('already has pending gate');
  });
  it('confirmed gate: repeat returns "already confirmed" and does not reopen or validate', async () => {
    await call(ok());
    await gates.confirmGate({ root, sessionKey: 's1', state }, 'data-analyst-phase-1', { decision: 'confirmed', proof: PROOF }, {
      commitGate: async () => ({ outcome: 'committed', sha: 'abcdef1234567' }), replayPending: async () => [],
      loadConfig: () => ({}), resolveOutputDirs: () => ['x'],
    });
    const r = await call(ok({ validates: 'data-analyst', record_ref: 'missing.md' }));
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('already confirmed (abcdef1)');
    expect(gates.getGate({ root, sessionKey: 's1', state }, 'data-analyst-phase-1').status).toBe('confirmed');
  });
  it('changes_requested then re-request reopens and echoes the note', async () => {
    await call(ok());
    await gates.confirmGate({ root, sessionKey: 's1', state }, 'data-analyst-phase-1', { decision: 'changes_requested', proof: PROOF, note: 'redo the join' });
    const r = await call(ok());
    expect(text(r)).toContain('"result": "reopened"');
    expect(text(r)).toContain('redo the join');
    expect(gates.getGate({ root, sessionKey: 's1', state }, 'data-analyst-phase-1').status).toBe('pending');
  });
  it('non-advancing kinds are pending and say they do not commit', async () => {
    const r = await call(ok({ id: 'cp-1', kind: 'checkpoint' }));
    expect(text(r)).toContain('non-advancing');
    expect(gates.getGate({ root, sessionKey: 's1', state }, 'cp-1').status).toBe('pending');
  });
});
