import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const SHIM = path.join(ROOT, 'hooks', 'pre-tool-use.js');
const av = require('../runtime/auto-verify');
const { StateStore } = require('../runtime/state/store');
const { compile } = require('../build/compile');

const C = '11111111-1111-4111-8111-111111111111';
const GA = 'mcp__plugin_shards_shards__gate_advance';
const GF = 'mcp__plugin_shards_shards__gate_force_close';
const GC = 'mcp__plugin_shards_shards__gate_confirm';
const GS = 'mcp__plugin_shards_shards__gate_suspend';

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-pre-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function run(payload, { host = 'claude', raw } = {}) {
  const e = { ...process.env };
  for (const k of ['CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT', 'CLAUDECODE', 'CODEX_HOME', 'SHARDS_HOST', 'SHARDS_PROJECT_ROOT']) delete e[k];
  e.SHARDS_HOST = host === 'codex' ? 'codex' : 'claude-code';
  const input = raw !== undefined ? raw : JSON.stringify({ session_id: C, cwd: tmp, hook_event_name: 'PreToolUse', permission_mode: 'default', tool_use_id: 't1', tool_input: {}, ...payload });
  return spawnSync('node', [SHIM], { input, cwd: tmp, env: e, encoding: 'utf8' });
}
const hooksJson = () => JSON.parse(fs.readFileSync(path.join(tmp, '.shards', 'state', 'sessions', C, 'hooks.json'), 'utf8'));
const out = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null);
const session = () => ({ root: tmp, sessionKey: C });
const stateExists = () => fs.existsSync(path.join(tmp, '.shards'));

describe('gate tools', () => {
  it('asks for gate_advance and gate_force_close on claude and records decision', () => {
    for (const t of [GA, GF]) {
      const r = run({ tool_name: t });
      expect(r.status).toBe(0);
      expect(out(r)).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'ask' });
      expect(out(r).permissionDecisionReason).toContain('human');
    }
    const h = hooksJson();
    expect(h.gateCalls.map((g) => g.decision)).toEqual(['ask', 'ask']);
    expect(h.lastGateCall).toMatchObject({ tool: GF, permission_mode: 'default', decision: 'ask' });
  });
  it('no ask on codex, decision empty', () => {
    const r = run({ tool_name: 'mcp__shards__gate_advance' }, { host: 'codex' });
    expect(r.stdout).toBe('');
    expect(hooksJson().lastGateCall).toMatchObject({ host: 'codex', decision: '' });
  });
  it('gate_confirm records without ask', () => {
    const r = run({ tool_name: GC });
    expect(r.stdout).toBe('');
    expect(hooksJson().lastGateCall).toMatchObject({ tool: GC, decision: '' });
  });
  it('gate_suspend records permission_mode without ask', () => {
    const r = run({ tool_name: GS, permission_mode: 'acceptEdits' });
    expect(r.stdout).toBe('');
    expect(hooksJson().lastGateCall).toMatchObject({ tool: GS, permission_mode: 'acceptEdits', decision: '' });
  });
  it('records bypassPermissions / auto as-is', () => {
    run({ tool_name: GA, permission_mode: 'bypassPermissions' });
    run({ tool_name: GA, permission_mode: 'auto' });
    expect(hooksJson().gateCalls.map((g) => g.permission_mode)).toEqual(['bypassPermissions', 'auto']);
  });
  it('malformed JSON never crashes', () => {
    for (const raw of ['{not json', '', 'null', '[]']) expect(run({}, { raw }).status).toBe(0);
  });
});

describe('auto-verify', () => {
  it('non-gate tool without a block prints nothing and writes nothing', () => {
    const r = run({ tool_name: 'Bash', tool_input: { command: 'git status' } });
    expect(r.status).toBe(0); expect(r.stdout).toBe(''); expect(stateExists()).toBe(false);
  });
  it('approves allowlisted calls inside a block, not others, and respects the budget', async () => {
    await av.start(session(), { agent: 'data-modeller', phase: 3, tool_budget: 2, ttl_s: 600 });
    const ok = out(run({ tool_name: 'Bash', tool_input: { command: 'git status' } }));
    expect(ok.permissionDecision).toBe('allow');
    expect(ok.permissionDecisionReason).toContain('shards auto-verify');
    expect(run({ tool_name: 'Bash', tool_input: { command: 'rm -rf x' } }).stdout).toBe('');
    expect(out(run({ tool_name: 'Bash', tool_input: { command: 'git status' } })).permissionDecision).toBe('allow');
    expect(run({ tool_name: 'Bash', tool_input: { command: 'git status' } }).stdout).toBe('');
    expect(av.get(session()).active).toBe(false);
  });
  it('works on codex', async () => {
    await av.start(session(), { agent: 'a', phase: 1, tool_budget: 5, ttl_s: 600 });
    expect(out(run({ tool_name: 'Bash', tool_input: { command: 'git status' } }, { host: 'codex' })).permissionDecision).toBe('allow');
  });
  it('never auto-approves gate tools', async () => {
    await av.start(session(), { agent: 'a', phase: 1, tool_budget: 5, ttl_s: 600 });
    const r = run({ tool_name: GC });
    expect(r.stdout).toBe('');
    expect(av.get(session()).used).toBe(0);
  });
  it('a pending gate stops approval', async () => {
    await av.start(session(), { agent: 'a', phase: 1, tool_budget: 5, ttl_s: 600 });
    const st = new StateStore(tmp, C);
    await st.update('frames', () => ({ frames: [{ id: 'f1' }] }));
    await st.update('gates', () => ({ gates: { g1: { id: 'g1', frame: 'f1', status: 'pending' } } }));
    expect(run({ tool_name: 'Bash', tool_input: { command: 'git status' } }).stdout).toBe('');
    expect(av.get(session()).active).toBe(false);
  });
});

describe('emission', () => {
  const build = (target) => {
    const out = path.join(tmp, target === 'claude' ? 'claude-code' : target);
    expect(compile({ target, outDir: out, dev: true }).errors).toEqual([]);
    return out;
  };
  const rd = (d, rel) => fs.readFileSync(path.join(d, rel), 'utf8');
  it('claude hooks match all tools and add no allow rule for gate tools', () => {
    const out = build('claude');
    const hj = JSON.parse(rd(out, 'hooks/hooks.json'));
    expect(new RegExp(hj.hooks.PreToolUse[0].matcher).test('Bash')).toBe(true);
    expect(hj.hooks.PreToolUse[0].matcher).toBe('.*');
    expect(rd(out, 'hooks/hooks.json')).not.toMatch(/allow/i);
    expect(fs.existsSync(path.join(out, 'settings.json'))).toBe(false);
  });
  it('codex config prompts for gate tools and hooks match all tools', () => {
    const out = build('codex');
    const toml = rd(out, '.codex/config.toml');
    for (const t of ['gate_advance', 'gate_force_close']) expect(toml).toContain(`[mcp_servers.shards.tools.${t}]\napproval_mode = "prompt"`);
    expect(toml).not.toContain('gate_confirm');
    expect(toml).toContain('UNVERIFIED');
    expect(JSON.parse(rd(out, '.codex/hooks.json')).hooks.PreToolUse[0].matcher).toBe('.*');
  });
});
