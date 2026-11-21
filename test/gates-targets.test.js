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
const gates = require('../runtime/gates');

let root; let state; let reg; let session;
const call = (args) => reg.call('gate_request', args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1' });
const ok = (over = {}) => ({ id: 'data-analyst-phase-1', kind: 'phase', phase: 1, summary: 'scoped', record_ref: 'analysis/p/project-specs.md', ...over });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gtg-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  session = { root, sessionKey: 's1', state };
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});

describe('gate_request targets', () => {
  it('stores normalised targets on the gate', async () => {
    const r = await call(ok({ targets: ['src/churn/model.py', 'src/churn/'] }));
    expect(r.isError).toBeFalsy();
    expect(gates.getGate(session, 'data-analyst-phase-1').targets).toEqual(['src/churn/model.py', 'src/churn']);
  });
  it('rejects targets outside the root', async () => {
    for (const t of ['../x', '/etc/x', '.']) {
      const r = await call(ok({ targets: [t] }));
      expect(r.isError).toBe(true);
      expect(r.content.map((c) => c.text).join('\n')).toMatch(/targets/);
      expect(gates.getGate(session, 'data-analyst-phase-1')).toBeNull();
    }
  });
  it('defaults to []', async () => {
    await call(ok());
    expect(gates.getGate(session, 'data-analyst-phase-1').targets).toEqual([]);
  });
});

describe('defaultResolveOutputDirs', () => {
  const seed = (gs) => state.update('gates', (cur) => { cur.gates = cur.gates || {}; Object.assign(cur.gates, gs); return cur; });
  it('returns output dir, entry targets and earlier confirmed targets in scope', async () => {
    const od = require('../runtime/agents').loadAgents().get('ml-engineer').output_dir.replace('{project}', 'p1');
    await seed({
      g0: { id: 'g0', status: 'confirmed', agent: 'ml-engineer', project: 'p1', targets: ['dbt/models/marts/fct_x.sql'] },
      g1: { id: 'g1', status: 'confirmed', agent: 'ml-engineer', project: 'p2', targets: ['other/y.py'] },
    });
    const entry = { agent: 'ml-engineer', project: 'p1', targets: ['src/churn', '../x'] };
    expect(gates.defaultResolveOutputDirs(root, entry, session)).toEqual([od, 'src/churn', 'dbt/models/marts/fct_x.sql']);
  });
  it('works with no output_dir', () => {
    expect(gates.defaultResolveOutputDirs(root, { agent: 'syn', targets: ['a/b.py'] }, session)).toEqual(['a/b.py']);
  });
});

describe('target path edge cases', () => {
  it('accepts a name that merely starts with two dots', async () => {
    const r = await call(ok({ targets: ['..notes/x.md'] }));
    expect(r.isError).toBeFalsy();
    expect(gates.getGate(session, 'data-analyst-phase-1').targets).toEqual(['..notes/x.md']);
    expect(gates.defaultResolveOutputDirs(root, { agent: 'syn', targets: ['..notes/x.md'] }, session)).toEqual(['..notes/x.md']);
  });
});
