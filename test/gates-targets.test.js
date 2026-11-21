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
  it('leaves targets unset when none are passed', async () => {
    await call(ok());
    expect(gates.getGate(session, 'data-analyst-phase-1').targets).toBeUndefined();
  });
});

describe('defaultResolveOutputDirs', () => {
  const seed = (gs) => state.update('gates', (cur) => { cur.gates = cur.gates || {}; Object.assign(cur.gates, gs); return cur; });
  const od = () => require('../runtime/agents').loadAgents().get('ml-engineer').output_dir.replace('{project}', 'p1');
  it("uses the gate's own targets and drops earlier ones it no longer lists", async () => {
    await seed({
      g0: { id: 'g0', status: 'confirmed', agent: 'ml-engineer', project: 'p1', decided_at: '2026-01-01T00:00:00.000Z', targets: ['dbt/models/marts/fct_x.sql'] },
    });
    const entry = { id: 'g2', agent: 'ml-engineer', project: 'p1', targets: ['src/churn', '../x'] };
    expect(gates.defaultResolveOutputDirs(root, entry, session)).toEqual([od(), 'src/churn']);
  });
  it('inherits the latest confirmed list in scope when the gate passes none', async () => {
    await seed({
      g0: { id: 'g0', status: 'confirmed', agent: 'ml-engineer', project: 'p1', decided_at: '2026-01-01T00:00:00.000Z', targets: ['old/a.py', 'old/b.py'] },
      g1: { id: 'g1', status: 'confirmed', agent: 'ml-engineer', project: 'p1', decided_at: '2026-01-02T00:00:00.000Z', targets: ['old/a.py'] },
      g2: { id: 'g2', status: 'confirmed', agent: 'ml-engineer', project: 'p1', decided_at: '2026-01-03T00:00:00.000Z' },
      g3: { id: 'g3', status: 'confirmed', agent: 'ml-engineer', project: 'p2', decided_at: '2026-01-04T00:00:00.000Z', targets: ['other/y.py'] },
      g4: { id: 'g4', status: 'changes_requested', agent: 'ml-engineer', project: 'p1', decided_at: '2026-01-05T00:00:00.000Z', targets: ['rejected/z.py'] },
    });
    expect(gates.defaultResolveOutputDirs(root, { id: 'g5', agent: 'ml-engineer', project: 'p1' }, session)).toEqual([od(), 'old/a.py']);
  });
  it('an explicit empty list clears the targets', async () => {
    await seed({
      g0: { id: 'g0', status: 'confirmed', agent: 'ml-engineer', project: 'p1', decided_at: '2026-01-01T00:00:00.000Z', targets: ['old/a.py'] },
    });
    expect(gates.defaultResolveOutputDirs(root, { id: 'g1', agent: 'ml-engineer', project: 'p1', targets: [] }, session)).toEqual([od()]);
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

describe('target hardening', () => {
  it('treats backslashes as separators', async () => {
    const bad = await call(ok({ targets: ['src\\..\\..\\x'] }));
    expect(bad.isError).toBe(true);
    const r = await call(ok({ targets: ['src\\churn', 'src/churn/', './src/churn'] }));
    expect(r.isError).toBeFalsy();
    expect(gates.getGate(session, 'data-analyst-phase-1').targets).toEqual(['src/churn']);
  });
  it('rejects targets under .git or .shards', async () => {
    for (const t of ['.shards', '.shards/state', '.git/config']) {
      const r = await call(ok({ targets: [t] }));
      expect(r.isError).toBe(true);
    }
    expect((await call(ok({ targets: ['.shardsx/a'] }))).isError).toBeFalsy();
  });
  it('says so when targets are passed to an already confirmed gate', async () => {
    await call(ok());
    await state.update('gates', (cur) => { cur.gates['data-analyst-phase-1'].status = 'confirmed'; return cur; });
    const r = await call(ok({ targets: ['src/x.py'] }));
    expect(r.content.map((c) => c.text).join('\n')).toMatch(/NOT recorded/);
  });
});
