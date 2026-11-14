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
const tier2 = require('../runtime/gates/tier2');

const TOOL = 'mcp__plugin_shards_shards__gate_advance';
const ID = 'data-analyst-phase-1';
const OLD_HOME = process.env.HOME;
let root; let home; let state; let reg;
const session = () => ({ root, sessionKey: 's1', state });
const advance = (host, args = { id: ID }) => reg.call('gate_advance', args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1', host });
const text = (r) => r.content[1].text;
const rec = (o = {}) => ({ tool: TOOL, permission_mode: 'default', ts: new Date().toISOString(), host: 'claude-code', decision: 'ask', ...o });
async function setCalls(...calls) {
  await state.withLock(() => {
    fs.mkdirSync(state.sessionDir, { recursive: true });
    fs.writeFileSync(state.file('hooks'), JSON.stringify({ gateCalls: calls, lastGateCall: calls[calls.length - 1] }));
  });
}
const status = () => gates.getGate(session(), ID).status;

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gt2-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'gt2h-'));
  process.env.HOME = home;
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
  await gates.requestGate(session(), { frame: state.read('frames').frames[0], id: ID, kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
});
afterEach(() => { process.env.HOME = OLD_HOME; fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

describe('tier 2 gate_advance', () => {
  it('supervised default+ask confirms with host-prompt proof', async () => {
    await setCalls(rec());
    const r = await advance('claude-code');
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('confirmed');
    expect(gates.getGate(session(), ID).proof).toMatchObject({ tier: 'host-prompt', level: 2, permission_mode: 'default' });
  });
  it('plan mode confirms', async () => {
    await setCalls(rec({ permission_mode: 'plan' }));
    expect((await advance('claude-code')).isError).toBeFalsy();
    expect(status()).toBe('confirmed');
  });
  for (const m of ['acceptEdits', 'auto', 'bypassPermissions', 'dontAsk', null]) {
    it(`mode ${m} never confirms`, async () => {
      await setCalls(rec({ permission_mode: m }));
      const r = await advance('claude-code');
      expect(r.isError).toBe(true);
      expect(text(r)).toMatch(/tier 1/);
      expect(status()).toBe('pending');
    });
  }
  it('decision empty never confirms', async () => {
    await setCalls(rec({ decision: '' }));
    expect((await advance('claude-code')).isError).toBe(true);
    expect(status()).toBe('pending');
  });
  it('allow-always rule in settings never confirms', async () => {
    fs.mkdirSync(path.join(root, '.claude'));
    fs.writeFileSync(path.join(root, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['mcp__plugin_shards_shards__*'] } }));
    await setCalls(rec());
    const r = await advance('claude-code');
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/allow rule/);
    expect(status()).toBe('pending');
  });
  it('mode switched mid-turn never confirms', async () => {
    await setCalls(rec(), rec({ permission_mode: 'auto' }));
    expect((await advance('claude-code')).isError).toBe(true);
    expect(status()).toBe('pending');
  });
  it('stale record never confirms', async () => {
    await setCalls(rec({ ts: new Date(Date.now() - 130000).toISOString() }));
    expect((await advance('claude-code')).isError).toBe(true);
    expect(status()).toBe('pending');
  });
  it('same record cannot confirm twice', async () => {
    await setCalls(rec());
    const v1 = await tier2.verifySupervisedCall(session(), { tool: 'gate_advance', host: 'claude-code', settingsRoots: { root, home } });
    const v2 = await tier2.verifySupervisedCall(session(), { tool: 'gate_advance', host: 'claude-code', settingsRoots: { root, home } });
    expect(v1.ok).toBe(true);
    expect(v2.ok).toBe(false);
    expect(state.read('hooks').gateCalls[0].consumed).toBe(true);
  });
  it('Codex refused with tier 1 or 3 text', async () => {
    await setCalls(rec({ host: 'codex' }));
    const r = await advance('codex');
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('gate_advance is unavailable on Codex; use tier 1 (form) or tier 3 (reply in chat then gate_confirm)');
    expect((await advance('claude-code')).isError).toBe(true);
    expect(status()).toBe('pending');
  });
  it('no record refuses; gate not pending refuses; unknown gate refuses', async () => {
    expect((await advance('claude-code')).isError).toBe(true);
    await gates.confirmGate(session(), ID, { decision: 'confirmed', proof: { tier: 'test' } });
    await setCalls(rec());
    const r = await advance('claude-code');
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not pending/);
    expect(state.read('hooks').gateCalls[0].consumed).toBeFalsy();
    expect((await advance('claude-code', { id: 'nope' })).isError).toBe(true);
  });
  it('latest prompt mode unsupervised refuses', async () => {
    fs.writeFileSync(path.join(state.sessionDir, 'prompts.jsonl'), JSON.stringify({ prompt_id: 1, permission_mode: 'bypassPermissions' }) + '\n');
    await setCalls(rec());
    expect((await advance('claude-code')).isError).toBe(true);
  });
  it('allowRuleCoversTool matches exact, server, wildcard, home', () => {
    fs.mkdirSync(path.join(home, '.claude'));
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['mcp__other', 'mcp__plugin_shards_shards'] } }));
    expect(tier2.allowRuleCoversTool({ root, home }, [TOOL]).length).toBe(1);
    expect(tier2.allowRuleCoversTool({ root, home: root }, [TOOL])).toEqual([]);
  });
});
