import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

// Host detection and enforcement with the hook payloads Codex CLI 0.169.0 really sends (test/fixtures/codex).
// Bug fixed: Codex sets CLAUDE_PLUGIN_ROOT for plugin hook commands, so env-first detection saw claude-code and the
// `ask` decisions (which Codex ignores) failed open.
const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const host = require('../hooks/lib/host');
const { handler, decide } = require('../hooks/pre-tool-use');
const subagentStop = require('../hooks/subagent-stop');
const L = require('../runtime/leases');
const { StateStore } = require('../runtime/state/store');
const { detectHostName } = require('../runtime/session/correlate');
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/codex/payloads-0.169.0.json'), 'utf8'));

// Env Codex 0.169 gives a plugin hook command (verified), plus what a Codex launched from a Claude Code terminal inherits.
const CODEX_HOOK_ENV = { PLUGIN_ROOT: '/h/plugins/cache/shards-local/shards/2.0.0', CLAUDE_PLUGIN_ROOT: '/h/plugins/cache/shards-local/shards/2.0.0', PLUGIN_DATA: '/h/plugins/data/shards-shards-local' };
const INHERITED = { ...CODEX_HOOK_ENV, CLAUDECODE: '1' };
const CLAUDE_ENV = { CLAUDE_PROJECT_DIR: '/proj', CLAUDE_PLUGIN_ROOT: '/c/plugins/shards' };

describe('detectHost on real Codex 0.169.0 payloads', () => {
  it('payloads with turn_id are codex even when Claude env vars are present', () => {
    for (const k of ['pre_tool_use_apply_patch', 'pre_tool_use_subagent_apply_patch', 'pre_tool_use_mcp', 'pre_tool_use_gate_advance', 'user_prompt_submit', 'subagent_stop']) {
      expect(host.detectHost(P[k], CODEX_HOOK_ENV, []), k).toBe('codex');
      expect(host.detectHost(P[k], INHERITED, []), k).toBe('codex');
    }
  });
  it('SessionStart (no turn_id) is codex via PLUGIN_ROOT without CLAUDE_PROJECT_DIR', () => {
    expect(P.session_start.turn_id).toBeUndefined();
    expect(host.detectHost(P.session_start, CODEX_HOOK_ENV, [])).toBe('codex');
    expect(host.detectHost(P.session_start, INHERITED, [])).toBe('codex');
  });
  it('the --host argv marker wins over everything', () => {
    expect(host.detectHost({}, CLAUDE_ENV, ['--host', 'codex'])).toBe('codex');
    expect(host.detectHost({}, CLAUDE_ENV, ['--host=codex'])).toBe('codex');
    expect(host.detectHost(P.pre_tool_use_mcp, {}, ['--host', 'claude-code'])).toBe('claude-code');
    expect(host.detectHost({}, CLAUDE_ENV, ['--host', 'bogus'])).toBe('claude-code');
  });
  it('Claude Code payloads (no turn_id, CLAUDE_PROJECT_DIR set) stay claude-code', () => {
    const cc = { session_id: 's', cwd: '/proj', hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: {}, permission_mode: 'default' };
    expect(host.detectHost(cc, CLAUDE_ENV, [])).toBe('claude-code');
    expect(host.detectHost(cc, { ...CLAUDE_ENV, PLUGIN_ROOT: '/x' }, [])).toBe('claude-code');
  });
  it('normalize keeps agent_id/agent_type and the apply_patch command string', () => {
    const n = host.normalize(P.pre_tool_use_subagent_apply_patch, CODEX_HOOK_ENV, []);
    expect(n).toMatchObject({ host: 'codex', agentId: P.pre_tool_use_subagent_apply_patch.agent_id, agentType: 'default', toolName: 'apply_patch', permissionMode: 'bypassPermissions' });
    expect(n.toolInput.command).toContain('*** Add File: sub.txt');
  });
  it('gate tools get no ask on Codex (Codex ignores ask; approval_mode prompt is the substitute)', () => {
    expect(decide(host.normalize(P.pre_tool_use_gate_advance, INHERITED, [])).decision).toBe('');
  });
});

describe('MCP server host detection (runtime/session/correlate)', () => {
  const SCRUBBED = { HOME: '/u', LANG: 'C', LOGNAME: 'u', PATH: '/bin', SHELL: '/bin/zsh', TERM: 'dumb', TMPDIR: '/tmp', USER: 'u' };
  it('the args marker or SHARDS_HOST from shards install --codex identify Codex in the scrubbed env', () => {
    expect(detectHostName(SCRUBBED, ['--host', 'codex'])).toBe('codex');
    expect(detectHostName({ ...SCRUBBED, SHARDS_HOST: 'codex' }, [])).toBe('codex');
    expect(detectHostName(SCRUBBED, [])).toBe('claude-code'); // why the marker is needed
  });
});

let tmp;
const SID = P.pre_tool_use_subagent_apply_patch.session_id;
const AGENT = P.pre_tool_use_subagent_apply_patch.agent_id;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-cxhost-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

const at = (payload, over = {}) => ({ ...payload, cwd: tmp, session_id: SID, ...over });
const run = async (payload) => {
  const out = await handler(host.normalize(payload, INHERITED, []), tmp);
  return out ? JSON.parse(out).hookSpecificOutput : null;
};
const patch = (file) => ({ command: `*** Begin Patch\n*** Add File: ${file}\n+x\n*** End Patch` });
async function pendGate() {
  const st = new StateStore(tmp, SID);
  await st.update('frames', () => ({ frames: [{ id: 'f1-syn', agent: 'syn', gates: ['g1'] }] }));
  await st.update('gates', () => ({ gates: { g1: { id: 'g1', frame: 'f1-syn', agent: 'syn', status: 'pending' } } }));
}

describe('enforcement on Codex payloads', () => {
  it('a pending gate denies apply_patch from the main thread (deny, never ask)', async () => {
    await pendGate();
    const o = await run(at(P.pre_tool_use_apply_patch));
    expect(o.permissionDecision).toBe('deny');
    expect(o.permissionDecisionReason).toContain('g1');
  });
  it('the shim with --host codex records the gate call as codex with no ask', () => {
    const r = spawnSync('node', [path.join(ROOT, 'hooks', 'pre-tool-use.js'), '--host', 'codex'], {
      input: JSON.stringify(at(P.pre_tool_use_gate_advance)), encoding: 'utf8', cwd: tmp,
      env: { ...process.env, ...CLAUDE_ENV, CLAUDE_PROJECT_DIR: tmp, SHARDS_HOST: '' },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('');
    const rec = JSON.parse(fs.readFileSync(path.join(new StateStore(tmp, SID).file('hooks')), 'utf8')).lastGateCall;
    expect(rec).toMatchObject({ tool: 'mcp__shards__gate_advance', host: 'codex', decision: '', permission_mode: 'bypassPermissions' });
  });
});

// Unit-level only: the Codex fan-out binding has not been exercised live (a model run spawning a worker that calls
// fanout_claim). The payload shape (agent_id/agent_type on PreToolUse in a subagent) is the live-verified part.
describe('fan-out binding on Codex (real-shaped payloads, not live-verified)', () => {
  it('mcp__shards__fanout_claim binds the subagent; its slice writes pass a pending gate, others are denied; SubagentStop releases', async () => {
    expect(require('../hooks/lib/enforce').CLAIM_RE.test('mcp__shards__fanout_claim')).toBe(true);
    const lease = await L.openLease({ root: tmp, sessionKey: SID }, { owner: 'fanout', worker_type: 'ml-engineer', slices: [{ id: 's1', paths: ['models/a'] }, { id: 's2', paths: ['models/b'] }] });
    const claim = at(P.pre_tool_use_subagent_apply_patch, { tool_name: 'mcp__shards__fanout_claim', tool_input: { lease_id: lease.id, slice_id: 's1' } });
    // a Codex custom agent of another type is still refused; the built-in "default" role is not compared
    expect((await run({ ...claim, agent_id: 'other', agent_type: 'researcher' })).permissionDecision).toBe('deny');
    expect(await run(claim)).toBeNull();
    await pendGate();
    const ok = await run(at(P.pre_tool_use_subagent_apply_patch, { tool_input: patch("models/a/x.py") }));
    expect(ok, JSON.stringify(ok)).toBeNull();
    expect((await run(at(P.pre_tool_use_subagent_apply_patch, { tool_input: patch('models/b/x.py') }))).permissionDecision).toBe('deny');
    expect((await run(at(P.pre_tool_use_apply_patch, { tool_input: patch('models/a/y.py') }))).permissionDecision).toBe('deny'); // lead
    await subagentStop.handler(host.normalize(at(P.subagent_stop), INHERITED, []), tmp);
    expect(L.findWorkerLease({ root: tmp, sessionKey: SID, state: new StateStore(tmp, SID) }, AGENT, Date.now())).toBeNull();
  });
});
