import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(__dirname, '..');
const HOOKS = path.join(ROOT, 'hooks');
const FIX = path.join(ROOT, 'test', 'fixtures', 'hooks');
const host = require('../hooks/lib/host');

let tmp;
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-hooks-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function fixture(name, vars = {}) {
  let t = fs.readFileSync(path.join(FIX, name), 'utf8').replace(/__CWD__/g, tmp);
  for (const [k, v] of Object.entries(vars)) t = t.replace(`__${k}__`, v);
  return t;
}
function run(shim, stdin, env = {}) {
  const e = { ...process.env, ...env };
  for (const k of ['CLAUDE_PROJECT_DIR', 'CLAUDE_PLUGIN_ROOT', 'CLAUDECODE', 'CODEX_HOME', 'SHARDS_HOST', 'SHARDS_PROJECT_ROOT']) if (!(k in env)) delete e[k];
  return spawnSync('node', [path.join(HOOKS, shim)], { input: stdin, cwd: tmp, env: e, encoding: 'utf8' });
}
const sdir = (id) => path.join(tmp, '.shards', 'state', 'sessions', id);
const readJsonl = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const C = '11111111-1111-4111-8111-111111111111';
const X = '22222222-2222-4222-8222-222222222222';

describe('host adapter', () => {
  it('detects hosts', () => {
    expect(host.detectHost({}, { CLAUDE_PLUGIN_ROOT: '/p' })).toBe('claude-code');
    expect(host.detectHost({ turn_id: 't' }, {})).toBe('codex');
    expect(host.detectHost({}, { CODEX_HOME: '/x' })).toBe('codex');
    expect(host.detectHost({}, { SHARDS_HOST: 'codex' })).toBe('codex');
  });
  it('matches gate tools only', () => {
    for (const t of ['mcp__shards__gate_advance', 'mcp__plugin_shards_shards-mcp__gate_force_close', 'mcp__shards__gate_confirm']) expect(host.isGateTool(t)).toBe(true);
    for (const t of ['Bash', 'mcp__other__gate_advance', 'mcp__shards__gate_request', 'mcp__shards__shards_status', undefined]) expect(host.isGateTool(t)).toBe(false);
  });
  it('maps session ids to safe keys', () => {
    expect(host.toSessionKey(C)).toBe(C);
    expect(host.toSessionKey('a/b..c')).toBe('a_b._c');
    expect(host.toSessionKey('')).toBe(null);
  });
  it('formats SessionStart output', () => {
    expect(host.sessionStartOutput('claude-code', '')).toBe('');
    expect(JSON.parse(host.sessionStartOutput('codex', 'ctx')).hookSpecificOutput).toEqual({ hookEventName: 'SessionStart', additionalContext: 'ctx' });
  });
});

describe('UserPromptSubmit recorder', () => {
  it('records NFC-normalised text, stable hash and monotonic ids (Claude)', () => {
    const r1 = run('user-prompt-submit.js', fixture('claude-user-prompt.json'));
    const r2 = run('user-prompt-submit.js', fixture('claude-user-prompt.json'));
    expect(r1.status).toBe(0); expect(r1.stdout).toBe('');
    expect(r2.status).toBe(0);
    const recs = readJsonl(path.join(sdir(C), 'prompts.jsonl'));
    expect(recs.map((r) => r.prompt_id)).toEqual([1, 2]);
    const text = 'Hello café world'; // composed e-acute
    expect(recs[0].text).toBe(text);
    expect(recs[0].sha256).toBe(crypto.createHash('sha256').update(text, 'utf8').digest('hex'));
    expect(recs[1].sha256).toBe(recs[0].sha256);
    expect(recs[0]).toMatchObject({ v: 1, session_id: C, host: 'claude-code', permission_mode: 'default' });
    expect(Number.isNaN(Date.parse(recs[0].ts))).toBe(false);
  });
  it('records Codex payloads', () => {
    expect(run('user-prompt-submit.js', fixture('codex-user-prompt.json')).status).toBe(0);
    const [rec] = readJsonl(path.join(sdir(X), 'prompts.jsonl'));
    expect(rec).toMatchObject({ host: 'codex', turn_id: 'turn-1', text: 'go ahead', prompt_id: 1 });
  });
  it('keeps sessions separate and does not bump the session version', () => {
    run('user-prompt-submit.js', fixture('claude-user-prompt.json'));
    run('user-prompt-submit.js', fixture('codex-user-prompt.json'));
    expect(readJsonl(path.join(sdir(C), 'prompts.jsonl'))).toHaveLength(1);
    expect(readJsonl(path.join(sdir(X), 'prompts.jsonl'))).toHaveLength(1);
    expect(fs.existsSync(path.join(sdir(C), 'session.json'))).toBe(false);
  });
  it('survives concurrent invocations with unique ids', async () => {
    const { spawn } = require('child_process');
    const one = () => new Promise((res) => { const p = spawn('node', [path.join(HOOKS, 'user-prompt-submit.js')], { cwd: tmp, stdio: ['pipe', 'ignore', 'ignore'] }); p.on('close', res); p.stdin.end(fixture('claude-user-prompt.json')); });
    await Promise.all(Array.from({ length: 6 }, one));
    const ids = readJsonl(path.join(sdir(C), 'prompts.jsonl')).map((r) => r.prompt_id).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('PreToolUse shim', () => {
  it('records permission_mode at call time for gate tools', () => {
    const r = run('pre-tool-use.js', fixture('claude-pretool-gate.json'));
    expect(r.status).toBe(0); expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
    const h = JSON.parse(fs.readFileSync(path.join(sdir(C), 'hooks.json'), 'utf8'));
    expect(h.lastGateCall).toMatchObject({ tool: 'mcp__plugin_shards_shards-mcp__gate_advance', permission_mode: 'bypassPermissions', host: 'claude-code', tool_use_id: 'toolu_1' });
    run('pre-tool-use.js', fixture('claude-pretool-gate.json').replace('bypassPermissions', 'default'));
    const h2 = JSON.parse(fs.readFileSync(path.join(sdir(C), 'hooks.json'), 'utf8'));
    expect(h2.gateCalls.map((g) => g.permission_mode)).toEqual(['bypassPermissions', 'default']);
  });
  it('records Codex gate calls', () => {
    run('pre-tool-use.js', fixture('codex-pretool-gate.json'));
    const h = JSON.parse(fs.readFileSync(path.join(sdir(X), 'hooks.json'), 'utf8'));
    expect(h.lastGateCall).toMatchObject({ tool: 'mcp__shards__gate_confirm', permission_mode: 'acceptEdits', host: 'codex' });
  });
  it('passes non-gate tools through with no output and no state', () => {
    const r = run('pre-tool-use.js', fixture('claude-pretool-other.json'));
    expect(r.status).toBe(0); expect(r.stdout).toBe(''); expect(r.stderr).toBe('');
    expect(fs.existsSync(path.join(tmp, '.shards'))).toBe(false);
  });
});

describe('SessionStart shim', () => {
  for (const source of ['startup', 'resume', 'compact', 'clear']) {
    it(`writes a handshake for ${source}`, () => {
      const r = run('session-start.js', fixture('claude-session-start.json', { SOURCE: source }));
      expect(r.status).toBe(0);
      expect(r.stdout).toBe(''); // reground is a stub until E11.7
      const dir = path.join(tmp, '.shards', 'state', 'handshake');
      const files = fs.readdirSync(dir);
      expect(files).toHaveLength(1);
      const rec = JSON.parse(fs.readFileSync(path.join(dir, files[0]), 'utf8'));
      expect(files[0]).toBe(`${rec.pid}.json`);
      expect(rec).toMatchObject({ session_id: C, source, cwd: tmp });
      expect(Number.isInteger(rec.pid)).toBe(true);
      expect(Array.isArray(rec.ppid_chain) && rec.ppid_chain.length >= 1).toBe(true);
      expect(rec.ppid_chain[0]).toBe(process.pid); // hook was spawned by this test process
      expect(Number.isNaN(Date.parse(rec.ts))).toBe(false);
    });
  }
  it('handles Codex payloads and ignores unsupported sources', () => {
    run('session-start.js', fixture('codex-session-start.json', { SOURCE: 'startup' }));
    const dir = path.join(tmp, '.shards', 'state', 'handshake');
    expect(fs.readdirSync(dir)).toHaveLength(1);
    fs.rmSync(dir, { recursive: true });
    run('session-start.js', fixture('claude-session-start.json', { SOURCE: 'fork' }));
    expect(fs.existsSync(dir)).toBe(false);
  });
  it('ppidChain returns a chain ending before pid 1', () => {
    const { ppidChain } = require('../hooks/lib/common');
    const c = ppidChain();
    expect(c[0]).toBe(process.ppid);
    expect(c.every((p) => Number.isInteger(p) && p > 1)).toBe(true);
  });
});

describe('robustness', () => {
  const shims = ['user-prompt-submit.js', 'pre-tool-use.js', 'session-start.js'];
  for (const shim of shims) {
    for (const [label, input] of [['malformed JSON', '{not json'], ['empty stdin', ''], ['wrong shape', '[1,2]'], ['missing fields', '{"hook_event_name":"x"}']]) {
      it(`${shim}: ${label} -> exit 0, no stdout`, () => {
        const r = run(shim, input);
        expect(r.status).toBe(0); expect(r.stdout).toBe('');
      });
    }
  }
  it('logs internal errors to hook-errors.log', () => {
    run('user-prompt-submit.js', '{bad');
    const log = fs.readFileSync(path.join(tmp, '.shards', 'state', 'hook-errors.log'), 'utf8');
    expect(JSON.parse(log.trim().split('\n')[0])).toMatchObject({ hook: 'user-prompt-submit' });
  });
  it('exits 0 and logs when state is corrupt', () => {
    fs.mkdirSync(sdir(C), { recursive: true });
    fs.writeFileSync(path.join(sdir(C), 'hooks.json'), '{corrupt');
    const r = run('user-prompt-submit.js', fixture('claude-user-prompt.json'));
    expect(r.status).toBe(0);
    expect(fs.readFileSync(path.join(tmp, '.shards', 'state', 'hook-errors.log'), 'utf8')).toMatch(/Corrupt state file/);
  });
});
