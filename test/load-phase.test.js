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
const { regroundHook } = require('../runtime/reground');
// Same quoting rule as runtime/gates/confirm-command.js (Windows paths contain backslashes).
const q = (s) => (/[\s"'$`\\]/.test(s) ? JSON.stringify(s) : s);

const PROOF = { tier: 'test' };
const DEPS = { commitGate: async () => ({ outcome: 'committed', sha: 'abcdef1234567' }), replayPending: async () => [], loadConfig: () => ({}), resolveOutputDirs: () => ['x'] };

let root; let reg; const stores = {};
const store = (k) => (stores[k] = stores[k] || new StateStore(root, k));
const call = (args, { key = 's1', host, policy } = {}) => reg.call('load_phase', args, {
  root, getConfig: () => ({ config: policy ? { gates: { policy } } : {} }), state: store(key), sessionKey: key, ...(host ? { host } : {}),
});
const text = (r) => r.content[1].text;
const header = (r) => r.content[0].text;
const sess = (k = 's1') => ({ root, sessionKey: k, state: store(k) });
const frames = (k = 's1') => store(k).read('frames').frames;

async function gate(id, phase, agent, { kind = 'phase', confirm = false, key = 's1' } = {}) {
  const frame = frames(key).find((f) => f.agent === agent);
  await gates.requestGate(sess(key), { frame, id, kind, phase, summary: 's' });
  if (confirm) await gates.confirmGate(sess(key), id, { decision: 'confirmed', proof: PROOF }, DEPS);
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-'));
  for (const k of Object.keys(stores)) delete stores[k];
  reg = new Registry(loadTools());
  await pushFrame(store('s1'), { agent: 'ml-engineer', project: 'p' });
});

describe('load_phase', () => {
  it('registered with the specified schema', () => {
    const t = reg.list().find((x) => x.name === 'load_phase');
    expect(t.inputSchema.additionalProperties).toBe(false);
    expect(t.inputSchema.required).toEqual(['agent', 'n']);
  });

  it('phase 1 loads without a gate; no unexpanded macros; frame updated; re-ground appended', async () => {
    const r = await call({ agent: 'ml-engineer', n: 1 });
    expect(r.isError).toBeFalsy();
    expect(text(r)).not.toMatch(/\{\{phase/);
    expect(text(r)).toContain('mcp__plugin_shards_shards__load_phase');
    expect(text(r)).toContain('--- Re-ground ---');
    expect(text(r)).toContain('Agent: ml-engineer');
    expect(frames()[0].phase).toBe(1);
    expect(frames()[0].track).toBe(null);
    expect(header(r)).toContain('ph=1');
  });

  it('phase 2 refused with the fixed message while phase-1 pending, allowed once confirmed', async () => {
    await call({ agent: 'ml-engineer', n: '1' });
    await gate('ml-engineer-phase-1', 1, 'ml-engineer');
    const r = await call({ agent: 'ml-engineer', n: '2' });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe('load_phase refused: gate ml-engineer-phase-1 for phase 1 is not confirmed (status: pending). Ask the user to confirm it: npx @proflandrigan/shards@next gates confirm ml-engineer-phase-1 --session s1'
      + ` (repo checkout: node ${q(path.join(__dirname, '..', 'cli', 'shards.js'))} gates confirm ml-engineer-phase-1 --session s1)`);
    expect(frames()[0].phase).toBe(1);
    await gates.confirmGate(sess(), 'ml-engineer-phase-1', { decision: 'confirmed', proof: PROOF }, DEPS);
    const ok = await call({ agent: 'ml-engineer', n: '2' });
    expect(ok.isError).toBeFalsy();
    expect(text(ok)).toContain('ml-engineer-phase-1 sha=abcdef123456');
    expect(frames()[0].phase).toBe(2);
  });

  it('missing and changes_requested statuses are reported', async () => {
    let r = await call({ agent: 'ml-engineer', n: 2 });
    expect(text(r)).toContain('(status: missing)');
    await gate('ml-engineer-phase-1', 1, 'ml-engineer');
    await gates.confirmGate(sess(), 'ml-engineer-phase-1', { decision: 'changes_requested', proof: PROOF, note: 'x' });
    r = await call({ agent: 'ml-engineer', n: 2 });
    expect(text(r)).toContain('(status: changes_requested)');
  });

  it('a checkpoint gate for the phase never satisfies the requirement', async () => {
    await gate('ml-engineer-phase-1.cp', 1, 'ml-engineer', { kind: 'checkpoint', confirm: true });
    const r = await call({ agent: 'ml-engineer', n: 2 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('load_phase refused: gate ml-engineer-phase-1 ');
  });

  it('gate matched by {agent, phase} when the id differs', async () => {
    await gate('custom-id', 1, 'ml-engineer', { confirm: true });
    expect((await call({ agent: 'ml-engineer', n: 2 })).isError).toBeFalsy();
  });

  it('subphase order: 6 -> 6-5 -> 7', async () => {
    await gate('ml-engineer-phase-6', 6, 'ml-engineer');
    let r = await call({ agent: 'ml-engineer', n: '6-5' });
    expect(text(r)).toContain('gate ml-engineer-phase-6 for phase 6 is not confirmed (status: pending)');
    await gates.confirmGate(sess(), 'ml-engineer-phase-6', { decision: 'confirmed', proof: PROOF }, DEPS);
    r = await call({ agent: 'ml-engineer', n: '6-5' });
    expect(r.isError).toBeFalsy();
    expect(frames()[0].phase).toBe('6-5');
    r = await call({ agent: 'ml-engineer', n: 7 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('gate ml-engineer-phase-6-5 for phase 6-5');
    await gate('ml-engineer-phase-6-5', '6-5', 'ml-engineer', { confirm: true });
    expect((await call({ agent: 'ml-engineer', n: 7 })).isError).toBeFalsy();
  });

  it('phase-0 gate: ignored when absent, enforced when present and unconfirmed', async () => {
    await gate('ml-engineer-phase-0', 0, 'ml-engineer');
    let r = await call({ agent: 'ml-engineer', n: 1 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('gate ml-engineer-phase-0 for phase 0 is not confirmed (status: pending)');
    await gates.confirmGate(sess(), 'ml-engineer-phase-0', { decision: 'confirmed', proof: PROOF }, DEPS);
    r = await call({ agent: 'ml-engineer', n: 1 });
    expect(r.isError).toBeFalsy();
  });

  it('dual-track: track required, deep gate ids carry the track, quick works', async () => {
    await pushFrame(store('s1'), { agent: 'analytics-engineer' });
    let r = await call({ agent: 'analytics-engineer', n: 1 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('dual-track');
    r = await call({ agent: 'analytics-engineer', n: 1, track: 'deep' });
    expect(r.isError).toBeFalsy();
    expect(frames()[1].track).toBe('deep');
    r = await call({ agent: 'analytics-engineer', n: 2, track: 'deep' });
    expect(text(r)).toContain('gate analytics-engineer-deep-phase-1 for phase 1 is not confirmed (status: missing)');
    await gate('analytics-engineer-deep-phase-1', 1, 'analytics-engineer', { confirm: true });
    expect((await call({ agent: 'analytics-engineer', n: 2, track: 'deep' })).isError).toBeFalsy();
    r = await call({ agent: 'analytics-engineer', n: 1, track: 'quick' });
    expect(r.isError).toBeFalsy();
    expect(frames()[1].track).toBe('quick');
    r = await call({ agent: 'analytics-engineer', n: 2, track: 'quick' });
    expect(text(r)).toContain('gate analytics-engineer-quick-phase-1 ');
  });

  it('track on a single-track agent is an error', async () => {
    const r = await call({ agent: 'ml-engineer', n: 1, track: 'deep' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('single-track');
  });

  it('unguarded preceding phase needs no gate', async () => {
    // analytics-engineer deep phase-7 -> 8: phase-7 has a gate; data-analyst/bi-engineer phase 1 has none for bi.
    await pushFrame(store('s1'), { agent: 'bi-engineer' });
    const r = await call({ agent: 'bi-engineer', n: 2 });
    const src = fs.readFileSync(path.join(__dirname, '..', 'core/agents/bi-engineer/phases/phase-1.md'), 'utf8');
    const gated = /^::GATE::|\{\{gate/m.test(src);
    expect(r.isError === true).toBe(gated);
  });

  it('unknown agent / phase / track list valid values', async () => {
    let r = await call({ agent: 'nope', n: 1 });
    expect(text(r)).toMatch(/Unknown agent "nope"\. Valid agents: .*ml-engineer/);
    r = await call({ agent: 'ml-engineer', n: 99 });
    expect(text(r)).toMatch(/Unknown phase "99".*Valid phases: 1, 2, 3, 4, 5, 6, 6-5, 7/);
    await pushFrame(store('s1'), { agent: 'analytics-engineer' });
    r = await call({ agent: 'analytics-engineer', n: 9, track: 'deep' });
    expect(text(r)).toContain('Valid phases: 1, 2, 3, 4, 5, 6, 7, 8');
    r = await call({ agent: 'analytics-engineer', n: 1, track: 'fast' });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Invalid arguments');
    r = await call({ agent: 'ml-engineer', n: 'x' });
    expect(r.isError).toBe(true);
  });

  it('refused unless the agent is the top frame', async () => {
    await pushFrame(store('s1'), { agent: 'data-analyst' });
    const r = await call({ agent: 'ml-engineer', n: 1 });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('Call activate');
    const none = await call({ agent: 'ml-engineer', n: 1 }, { key: 'empty' });
    expect(none.isError).toBe(true);
  });

  it('sessions are isolated', async () => {
    await pushFrame(store('s2'), { agent: 'ml-engineer' });
    await gate('ml-engineer-phase-1', 1, 'ml-engineer', { confirm: true });
    expect((await call({ agent: 'ml-engineer', n: 2 })).isError).toBeFalsy();
    expect((await call({ agent: 'ml-engineer', n: 2 }, { key: 's2' })).isError).toBe(true);
    expect(frames('s2')[0].phase).toBe(0);
  });

  it('policy plan behaves like phase; strict also enforces', async () => {
    await gate('ml-engineer-phase-1', 1, 'ml-engineer');
    for (const policy of ['plan', 'phase', 'strict']) {
      const r = await call({ agent: 'ml-engineer', n: 2 }, { policy });
      expect(r.isError).toBe(true);
      expect(text(r)).toContain('load_phase refused: gate ml-engineer-phase-1');
    }
  });

  it('claude vs codex host use the matching tool prefix', async () => {
    const c = text(await call({ agent: 'ml-engineer', n: 1 }, { host: 'claude-code' }));
    expect(c).toContain('mcp__plugin_shards_shards__');
    const x = text(await call({ agent: 'ml-engineer', n: 1 }, { host: 'codex' }));
    expect(x).toContain('`mcp__shards__load_phase`');
    expect(x).not.toContain('mcp__plugin_shards_shards__');
  });
});

describe('reground', () => {
  it('stays empty without a session; full for load_phase/activate; full for compact', async () => {
    expect(await regroundHook('activate', {})).toEqual({ event: 'activate', text: '' });
    await pushFrame(store('s1'), { agent: 'syn' });
    const a = await regroundHook('activate', { root, sessionKey: 's1' });
    expect(a.text).toContain('--- Re-ground ---');
    expect((await regroundHook('compact', { root, sessionKey: 's1' })).text).toContain('--- Re-ground ---');
  });
});
