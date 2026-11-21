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
const operator = require('../runtime/gates/operator');

const TOOL = 'mcp__plugin_shards_shards__gate_force_close';
const ID = 'data-analyst-phase-1';
const OLD_HOME = process.env.HOME;
let root; let home; let state; let reg;
const session = () => ({ root, sessionKey: 's1', state });
const call = (host = 'claude-code', args = { id: ID }) => reg.call('gate_force_close', args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1', host });
const rec = (o = {}) => ({ tool: TOOL, permission_mode: 'default', ts: new Date().toISOString(), host: 'claude-code', decision: 'ask', ...o });
async function setCalls(...calls) {
  await state.withLock(() => {
    fs.mkdirSync(state.sessionDir, { recursive: true });
    fs.writeFileSync(state.file('hooks'), JSON.stringify({ gateCalls: calls, lastGateCall: calls[calls.length - 1] }));
  });
}
const status = () => gates.getGate(session(), ID).status;
const violations = () => operator.readJsonl(operator.violationsFile(root));

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gfc-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'gfch-'));
  process.env.HOME = home;
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
  await gates.requestGate(session(), { frame: state.read('frames').frames[0], id: ID, kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
});
afterEach(() => { process.env.HOME = OLD_HOME; fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(home, { recursive: true, force: true }); });

describe('operator.forceClose', () => {
  it('force-closes, resets auto-verify, logs, never confirms', async () => {
    const av = require('../runtime/auto-verify');
    await state.update('auto-verify', () => ({ active: true, agent: 'data-analyst', phase: 1, tool_budget: 5, used: 0, started_at: Date.now(), ttl_s: 600, expires_at: Date.now() + 600000 }));
    expect(av.get(session()).active).toBe(true);
    const closed = await operator.forceClose(root, null, 'all', { actor: 'me', via: 'operator-cli', reason: 'r' });
    expect(closed).toEqual([{ session: 's1', gate: ID, from: 'pending' }]);
    expect(status()).toBe('force_closed');
    expect(status()).not.toBe('confirmed');
    expect(av.get(session()).active).toBeFalsy();
    expect(av.get(session()).end_reason).toBe('force_close');
    const log = operator.readJsonl(operator.operatorLogFile(root));
    expect(log[0]).toMatchObject({ action: 'force-close', session: 's1', gate: ID, actor: 'me', via: 'operator-cli', reason: 'r' });
  });
  it('does not satisfy load_phase and can be re-requested', async () => {
    await operator.forceClose(root, 's1', ID, { actor: 'me', via: 'operator-cli' });
    const g = gates.getGate(session(), ID);
    expect(g.status).not.toBe('confirmed');
    // frame has no open gate: a different gate can be requested
    const frame = state.read('frames').frames[0];
    const r2 = await gates.requestGate(session(), { frame, id: 'data-analyst-phase-2', kind: 'phase', phase: 2 });
    expect(r2.result).toBe('opened');
    await operator.forceClose(root, 's1', 'all', { actor: 'me', via: 'operator-cli' });
    const r = await gates.requestGate(session(), { frame, id: ID, kind: 'phase', phase: 1, summary: 'again' });
    expect(r.result).toBe('reopened');
    expect(status()).toBe('pending');
    expect(gates.getGate(session(), ID).history.map((h) => h.to)).toEqual(['pending', 'force_closed', 'pending']);
  });
  it('confirmGate on a force_closed gate throws', async () => {
    await operator.forceClose(root, 's1', ID, { actor: 'me', via: 'operator-cli' });
    await expect(gates.confirmGate(session(), ID, { decision: 'confirmed', proof: { tier: 'operator-cli' } })).rejects.toThrow(/force_closed/);
  });
});

describe('gate_force_close tool', () => {
  it('supervised + ask record force-closes only the named gate', async () => {
    await setCalls(rec());
    const r = await call();
    expect(r.isError).toBeFalsy();
    expect(status()).toBe('force_closed');
    const log = operator.readJsonl(operator.operatorLogFile(root));
    expect(log[0].via).toBe('host-prompt');
    expect(violations()).toHaveLength(0);
  });
  for (const [name, mk, host] of [
    ['bypass', () => rec({ permission_mode: 'bypassPermissions' }), 'claude-code'],
    ['auto', () => rec({ permission_mode: 'auto' }), 'claude-code'],
    ['acceptEdits', () => rec({ permission_mode: 'acceptEdits' }), 'claude-code'],
    ['null mode', () => rec({ permission_mode: null }), 'claude-code'],
    ['no ask', () => rec({ decision: 'allow' }), 'claude-code'],
    ['codex', () => rec({ host: 'codex' }), 'codex'],
  ]) {
    it(`refuses ${name} and logs a violation`, async () => {
      await setCalls(mk());
      const r = await call(host);
      expect(r.isError).toBe(true);
      expect(status()).toBe('pending');
      expect(violations()).toHaveLength(1);
      expect(violations()[0]).toMatchObject({ tool: 'gate_force_close', gate: ID });
    });
  }
  it('refuses with no recorded prompt', async () => {
    expect((await call()).isError).toBe(true);
    expect(status()).toBe('pending');
  });
});
