import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const gates = require('../runtime/gates');
const policy = require('../runtime/gates/policy');
const { validateConfig } = require('../runtime/config');

let root; let state; let reg; let cfg;
const gateDeps = { commitGate: async () => ({ outcome: 'committed', sha: 'abc1234' }), replayPending: async () => [], loadConfig: () => ({}), resolveOutputDirs: () => [] };
const call = (args) => reg.call('gate_request', args, { root, getConfig: () => ({ config: { gates: cfg } }), state, sessionKey: 's1', gateDeps });
const data = (r) => { const t = r.content[1].text; return JSON.parse(t.slice(t.indexOf('{'))); };
const mk = (over) => ({ id: 'g1', kind: 'checkpoint', phase: 1, summary: 's', record_ref: 'analysis/p/project-specs.md', ...over });
const sess = () => ({ root, sessionKey: 's1', state });
const gate = (id) => gates.getGate(sess(), id);
const PASS = { status: 'pass', summary: 'ok' };

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  cfg = { policy: 'phase' };
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});

describe('decide', () => {
  it('maps policy and kind', () => {
    expect(policy.decide('strict', 'checkpoint')).toBe('human');
    expect(policy.decide('phase', 'checkpoint')).toBe('evidence');
    expect(policy.decide('phase', 'confirm')).toBe('evidence');
    for (const k of ['phase', 'final', 'execute', 'handoff']) expect(policy.decide('phase', k)).toBe('human');
    expect(policy.decide('plan', 'final')).toBe('notice');
  });
});

describe('strict and phase', () => {
  it('strict needs a human for checkpoint even with pass evidence', async () => {
    cfg = { policy: 'strict' };
    const r = await call(mk({ evidence: PASS }));
    expect(data(r).status).toBe('pending');
    expect(gate('g1').status).toBe('pending');
  });
  it('phase auto-records checkpoint and confirm with pass evidence', async () => {
    for (const [id, kind] of [['c1', 'checkpoint'], ['c2', 'confirm']]) {
      const d = data(await call(mk({ id, kind, evidence: { ...PASS, checks: ['a'] } })));
      expect(d).toMatchObject({ result: 'recorded_evidence', status: 'confirmed', tier: 'auto-evidence' });
      const g = gate(id);
      expect(g.status).toBe('confirmed');
      expect(g.proof).toMatchObject({ tier: 'auto-evidence', level: 0, policy: 'phase' });
      expect(g.evidence.status).toBe('pass');
      expect(g.commit.outcome).toBe('skipped');
    }
    const t = (await call(mk({ id: 'c3', evidence: PASS }))).content[1].text;
    expect(t).toContain('recorded as evidence, continue');
  });
  it('phase checkpoint with fail/anomaly or no evidence stays pending', async () => {
    for (const [id, evidence] of [['f1', { status: 'fail' }], ['f2', { status: 'anomaly' }], ['f3', undefined]]) {
      const d = data(await call(mk({ id, ...(evidence ? { evidence } : {}) })));
      expect(d.status).toBe('pending');
      expect(gate(id).status).toBe('pending');
      await gates.confirmGate(sess(), id, { decision: 'confirmed', proof: { tier: 'operator-cli' } });
    }
    expect(gate('f1').evidence.status).toBe('fail');
  });
  it('phase-kind gate needs a human even with pass evidence', async () => {
    for (const kind of ['phase', 'final', 'execute']) {
      const id = `k-${kind}`;
      expect(data(await call(mk({ id, kind, evidence: PASS }))).status).toBe('pending');
      await gates.confirmGate(sess(), id, { decision: 'confirmed', proof: { tier: 'operator-cli' } }, gateDeps);
    }
  });
});

describe('plan', () => {
  beforeEach(() => { cfg = { policy: 'plan', budget: { max_gates: 3 } }; });
  const approvePlan = async () => {
    expect(data(await call(mk({ id: 'plan-approval', kind: 'phase', summary: 'plan+budget' }))).status).toBe('pending');
    await gates.confirmGate(sess(), 'plan-approval', { decision: 'confirmed', proof: { tier: 'operator-cli' } }, gateDeps);
  };
  it('records notices for all kinds after plan approval, with commits for advancing kinds', async () => {
    await approvePlan();
    const out = {};
    for (const [id, kind] of [['n1', 'phase'], ['n2', 'checkpoint'], ['n3', 'final']]) {
      cfg = { policy: 'plan', budget: { max_gates: 10 } };
      out[id] = data(await call(mk({ id, kind })));
      expect(out[id]).toMatchObject({ result: 'notice', status: 'confirmed', tier: 'plan-notice' });
      expect(gate(id).proof).toMatchObject({ tier: 'plan-notice', level: 0, plan_gate: 'plan-approval' });
    }
    expect(out.n1.commit.sha).toBe('abc1234');
    expect(out.n3.commit.sha).toBe('abc1234');
    expect(out.n2.commit.outcome).toBe('skipped');
    expect(state.read('policy').notices).toBe(3);
  });
  it('stops on fail evidence', async () => {
    await approvePlan();
    expect(data(await call(mk({ id: 'x1', kind: 'phase', evidence: { status: 'fail' } }))).status).toBe('pending');
  });
  it('stops when max_gates is exhausted', async () => {
    await approvePlan();
    for (const id of ['b1', 'b2', 'b3']) expect(data(await call(mk({ id, kind: 'execute' }))).result).toBe('notice');
    expect(data(await call(mk({ id: 'b4', kind: 'execute' }))).status).toBe('pending');
  });
  it('behaves like phase without a confirmed plan-approval', async () => {
    expect(data(await call(mk({ id: 'p1', kind: 'phase' }))).status).toBe('pending');
    await gates.confirmGate(sess(), 'p1', { decision: 'confirmed', proof: { tier: 'operator-cli' } }, gateDeps);
    expect(data(await call(mk({ id: 'p2', kind: 'checkpoint', evidence: PASS }))).result).toBe('recorded_evidence');
  });
});

describe('count-approvals', () => {
  it('counts by tier and kind; --check-max-human exits 1', async () => {
    cfg = { policy: 'phase' };
    await call(mk({ id: 'a1', kind: 'checkpoint', evidence: PASS }));
    await call(mk({ id: 'a2', kind: 'phase' }));
    await gates.confirmGate(sess(), 'a2', { decision: 'confirmed', proof: { tier: 'elicitation' } }, gateDeps);
    const script = path.join(__dirname_, 'scripts', 'count-approvals.js');
    const j = JSON.parse(execFileSync('node', [script, root, '--json']).toString());
    expect(j.human).toBe(1);
    expect(j['auto-evidence']).toBe(1);
    expect(j.by_kind.checkpoint['auto-evidence']).toBe(1);
    expect(j.by_kind.phase.human).toBe(1);
    expect(spawnSync('node', [script, root, '--check-max-human', '0']).status).toBe(1);
    expect(spawnSync('node', [script, root, '--check-max-human', '1']).status).toBe(0);
  });
});

describe('config schema', () => {
  it('accepts budget and rejects bad values', () => {
    expect(validateConfig({ gates: { policy: 'plan', budget: { max_gates: 5, max_tool_calls: 10, max_minutes: 30 } } }).ok).toBe(true);
    expect(validateConfig({ gates: { budget: { max_gates: 0 } } }).ok).toBe(false);
    expect(validateConfig({ gates: { budget: { max_minutes: 1.5 } } }).ok).toBe(false);
    expect(validateConfig({ gates: { budget: { bogus: 1 } } }).ok).toBe(false);
  });
});

const __dirname_ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
