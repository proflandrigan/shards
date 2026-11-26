import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');

function mkAgent(core, id, { activation, output_dir = null, entries = {}, bad = false }) {
  const d = path.join(core, 'agents', id);
  fs.mkdirSync(d, { recursive: true });
  if (bad) { fs.writeFileSync(path.join(d, 'agent.yaml'), 'id: [unclosed'); return; }
  const ce = Object.keys(entries).length ? 'consult_entries:\n' + Object.entries(entries).map(([k, v]) => `  ${k}: ${v}`).join('\n') + '\n' : '';
  fs.writeFileSync(path.join(d, 'agent.yaml'), `id: ${id}\ndisplay_name: "${id} name"\ndescription: "d"\nrole: specialist\nactivation: [${activation.join(', ')}]\n${ce}output_dir: ${output_dir ? `"${output_dir}"` : 'null'}\n`);
  fs.writeFileSync(path.join(d, 'persona-summary.md'), `persona of ${id}`);
}

let root, core, reg, prevEnv;
const stores = {};
const call = (name, args, key = 'sA') => {
  stores[key] = stores[key] || new StateStore(root, key);
  return reg.call(name, args, { root, getConfig: () => ({ config: {} }), state: stores[key], sessionKey: key });
};
const body = (r) => JSON.parse(r.content[1].text);
const header = (r) => r.content[0].text;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'));
  core = fs.mkdtempSync(path.join(os.tmpdir(), 'core-'));
  for (const k of Object.keys(stores)) delete stores[k];
  mkAgent(core, 'syn', { activation: ['switch', 'consult'], entries: { final_review: 'modes/final_review.md' } });
  mkAgent(core, 'analytics-engineer', { activation: ['switch', 'consult', 'fanout_worker'], output_dir: 'data_models/{project}/' });
  mkAgent(core, 'bi-engineer', { activation: ['switch'], output_dir: 'dashboards/{project}/' });
  mkAgent(core, 'researcher', { activation: ['consult'] });
  mkAgent(core, 'broken', { activation: [], bad: true });
  prevEnv = process.env.SHARDS_CORE_DIR;
  process.env.SHARDS_CORE_DIR = core;
  reg = new Registry(loadTools());
});
afterEach(() => { if (prevEnv === undefined) delete process.env.SHARDS_CORE_DIR; else process.env.SHARDS_CORE_DIR = prevEnv; });

describe('list_agents', () => {
  it('lists agents from SHARDS_CORE_DIR, tolerating malformed yaml', async () => {
    const r = await call('list_agents', {});
    const d = body(r);
    expect(d.core_dir).toBe(path.resolve(core));
    expect(d.agents.map((a) => a.id).sort()).toEqual(['analytics-engineer', 'bi-engineer', 'broken', 'researcher', 'syn']);
    expect(d.agents.find((a) => a.id === 'broken').error).toBeTruthy();
    expect(d.agents.find((a) => a.id === 'syn').consult_entries).toEqual(['final_review']);
    expect(d.agents.find((a) => a.id === 'bi-engineer').output_dir).toBe('dashboards/{project}/');
  });
  it('real core/ has all 16 agents', async () => {
    delete process.env.SHARDS_CORE_DIR;
    const d = body(await call('list_agents', {}));
    expect(d.agents.length).toBe(16);
    for (const a of d.agents) { expect(a.error).toBeUndefined(); expect(a.display_name).toBeTruthy(); }
  });
});

describe('activate / return', () => {
  it('activate resolves a fixed output_dir (no {project}) without a project and creates it', async () => {
    mkAgent(core, 'academic', { activation: ['switch', 'consult'], output_dir: 'shards/academic_reports/' });
    const r = await call('activate', { agent: 'academic', mode: 'switch' });
    expect(body(r).output_dir).toBe('shards/academic_reports/');
    expect(body(r).output_dir_created).toBe(true);
    expect(fs.existsSync(path.join(root, 'shards/academic_reports'))).toBe(true);
  });

  it('syn -> ae -> bi, return to syn; header tracks top', async () => {
    let r = await call('activate', { agent: 'syn', mode: 'switch' });
    expect(header(r)).toMatch(/agent=syn /);
    expect(body(r).persona_summary.content).toBe('persona of syn');
    r = await call('activate', { agent: 'analytics-engineer', mode: 'switch', project: 'proj1' });
    expect(header(r)).toMatch(/agent=analytics-engineer /);
    expect(body(r).output_dir).toBe('data_models/proj1/');
    expect(body(r).output_dir_created).toBe(true);
    expect(body(r).frame.id).toBe('f2-analytics-engineer');
    expect(fs.existsSync(path.join(root, 'data_models/proj1'))).toBe(true);
    r = await call('activate', { agent: 'bi-engineer', mode: 'switch' });
    expect(body(r).output_dir).toBeNull();
    expect(body(r).output_dir_template).toBe('dashboards/{project}/');
    expect(body(r).stack).toEqual(['syn', 'analytics-engineer', 'bi-engineer']);
    r = await call('return', { to: 'syn' });
    expect(header(r)).toMatch(/agent=syn /);
    const d = body(r);
    expect(d.popped).toEqual(['analytics-engineer', 'bi-engineer']);
    expect(d.top).toBe('syn');
    expect(d.persona_summary.content).toBe('persona of syn');
    expect(d.state_summary).toMatchObject({ agent: 'syn', pending_gates: [] });
    const a = body(await call('active', {}));
    expect(a.depth).toBe(1); expect(a.top.agent).toBe('syn');
  });
  it('return() pops one, base protected, pop_base works', async () => {
    await call('activate', { agent: 'syn', mode: 'switch' });
    await call('activate', { agent: 'bi-engineer', mode: 'switch' });
    expect(body(await call('return', {})).popped).toEqual(['bi-engineer']);
    const r = await call('return', {});
    expect(r.isError).toBe(true); expect(r.content[1].text).toMatch(/base frame/);
    expect(body(await call('active', {})).depth).toBe(1);
    expect(body(await call('return', { pop_base: true })).popped).toEqual(['syn']);
    expect(header(await call('active', {}))).toMatch(/agent=- /);
    expect(body(await call('active', {}))).toMatchObject({ depth: 0, top: null });
  });
  it('return to unknown agent refused; to=top is no-op; to+pop_base invalid', async () => {
    await call('activate', { agent: 'syn', mode: 'switch' });
    await call('activate', { agent: 'bi-engineer', mode: 'switch' });
    let r = await call('return', { to: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.content[1].text).toBe('Agent nope is not on the stack: [syn > bi-engineer]');
    r = await call('return', { to: 'bi-engineer' });
    expect(r.isError).toBeUndefined(); expect(body(r).popped).toEqual([]);
    r = await call('return', { to: 'syn', pop_base: true });
    expect(r.isError).toBe(true);
    expect(body(await call('active', {})).depth).toBe(2);
  });
  it('refusals: invalid mode, unknown agent, duplicate top, bad project', async () => {
    let r = await call('activate', { agent: 'researcher', mode: 'switch' });
    expect(r.isError).toBe(true); expect(r.content[1].text).toMatch(/Allowed modes: consult/);
    r = await call('activate', { agent: 'analytics-engineer', mode: 'fanout_worker' });
    expect(r.isError).toBe(true);
    r = await call('activate', { agent: 'ghost', mode: 'switch' });
    expect(r.content[1].text).toMatch(/Unknown agent.*syn/);
    await call('activate', { agent: 'syn', mode: 'switch' });
    r = await call('activate', { agent: 'syn', mode: 'switch' });
    expect(r.content[1].text).toMatch(/already active/);
    for (const p of ['../x', 'a/b', '.hidden', '']) {
      r = await call('activate', { agent: 'bi-engineer', mode: 'switch', project: p });
      expect(r.isError).toBe(true);
    }
    expect(body(await call('active', {})).depth).toBe(1);
  });
  it('consult pushes nothing and writes no state', async () => {
    await call('activate', { agent: 'syn', mode: 'switch' });
    const s = stores.sA; const v = s.getVersion();
    let r = await call('activate', { agent: 'researcher', mode: 'consult' });
    expect(body(r)).toMatchObject({ agent: 'researcher', mode: 'consult', note: 'consult does not hold gates' });
    expect(body(r).persona_summary.content).toBeUndefined();
    r = await call('activate', { agent: 'syn', mode: 'consult', entry: 'final_review' });
    expect(body(r).entry).toBe('agents/syn/modes/final_review.md');
    expect(body(r).consult_entries.final_review).toBe('agents/syn/modes/final_review.md');
    r = await call('activate', { agent: 'syn', mode: 'consult', entry: 'bogus' });
    expect(r.isError).toBe(true);
    expect(s.getVersion()).toBe(v);
    expect(s.read('frames').frames.length).toBe(1);
  });
  it('project dir only created on switch with project; existing left alone', async () => {
    await call('activate', { agent: 'analytics-engineer', mode: 'consult', project: 'c1' });
    expect(fs.existsSync(path.join(root, 'data_models'))).toBe(false);
    fs.mkdirSync(path.join(root, 'dashboards/p2'), { recursive: true });
    const r = await call('activate', { agent: 'bi-engineer', mode: 'switch', project: 'p2' });
    expect(body(r).output_dir_created).toBe(false);
  });
  it('return refused with pending gate until confirmed', async () => {
    await call('activate', { agent: 'syn', mode: 'switch' });
    const r0 = await call('activate', { agent: 'analytics-engineer', mode: 'switch' });
    const s = stores.sA;
    await s.update('gates', () => ({ gates: { g1: { id: 'g1', status: 'pending', frame: body(r0).frame.id, agent: 'analytics-engineer' } } }));
    expect(header(await call('active', {}))).toMatch(/gate=g1/);
    let r = await call('return', {});
    expect(r.isError).toBe(true); expect(r.content[1].text).toMatch(/g1/);
    expect(body(await call('active', {})).depth).toBe(2);
    await s.update('gates', (c) => { c.gates.g1.status = 'confirmed'; return c; });
    r = await call('return', {});
    expect(body(r).popped).toEqual(['analytics-engineer']);
  });
  it('sessions are isolated', async () => {
    await call('activate', { agent: 'syn', mode: 'switch' }, 'sA');
    await call('activate', { agent: 'bi-engineer', mode: 'switch' }, 'sA');
    await call('activate', { agent: 'syn', mode: 'switch' }, 'sB');
    expect(body(await call('active', {}, 'sA')).depth).toBe(2);
    expect(body(await call('active', {}, 'sB')).depth).toBe(1);
    await call('return', {}, 'sA');
    expect(body(await call('active', {}, 'sB')).depth).toBe(1);
  });
});
