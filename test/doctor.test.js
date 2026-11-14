import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const require = createRequire(import.meta.url);
const { run, runChecks, ruleCoversGateTools } = require('../cli/commands/doctor.js');

let root; let home; let empty;
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'));
const w = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const get = (checks, id) => checks.find((c) => c.id === id);
const check = async (id, extra = {}) => get(await runChecks({ root, home, repoRoot: empty, ...extra }), id);
const gitInit = () => {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: root });
};
const commit = () => { w(path.join(root, 'a.txt'), 'a'); execFileSync('git', ['add', 'a.txt'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'x'], { cwd: root }); };

beforeEach(() => { root = mk(); home = mk(); empty = mk(); });
afterEach(() => { for (const d of [root, home, empty]) fs.rmSync(d, { recursive: true, force: true }); });

describe('prerequisites', () => {
  it('node/python3/git pass here', async () => {
    const cs = await runChecks({ root, home, repoRoot: empty });
    expect(get(cs, 'node').status).toBe('PASS');
    expect(get(cs, 'git').status).toBe('PASS');
    expect(['PASS', 'WARN']).toContain(get(cs, 'python3').status);
  });
  it('node < 18 fails', async () => {
    const orig = process.versions.node;
    Object.defineProperty(process.versions, 'node', { value: '16.0.0', configurable: true });
    try { expect((await check('node')).status).toBe('FAIL'); } finally { Object.defineProperty(process.versions, 'node', { value: orig, configurable: true }); }
  });
});

describe('config', () => {
  it('absent file passes and is not created', async () => {
    expect((await check('config')).status).toBe('PASS');
    expect(fs.existsSync(path.join(root, 'shards.config.yaml'))).toBe(false);
  });
  it('valid passes', async () => {
    w(path.join(root, 'shards.config.yaml'), 'version: 1\ngates:\n  policy: phase\n');
    expect((await check('config')).status).toBe('PASS');
  });
  it('invalid schema fails with error', async () => {
    w(path.join(root, 'shards.config.yaml'), 'version: 1\ngates:\n  policy: bogus\n');
    const c = await check('config');
    expect(c.status).toBe('FAIL');
    expect(c.message).toMatch(/invalid/);
    expect(c.fix).toBeTruthy();
  });
  it('invalid YAML fails', async () => {
    w(path.join(root, 'shards.config.yaml'), 'a: [unclosed\n');
    expect((await check('config')).status).toBe('FAIL');
  });
});

describe('mcp + hooks', () => {
  it('mcp.claude warns when nothing found, passes with .mcp.json entry or dev build', async () => {
    const c = await check('mcp.claude');
    expect(c.status).toBe('WARN');
    expect(c.fix).toMatch(/build --target claude --dev/);
    w(path.join(root, '.mcp.json'), JSON.stringify({ mcpServers: { shards: { command: 'node' } } }));
    expect((await check('mcp.claude')).status).toBe('PASS');
  });
  it('mcp.claude passes with dev plugin under repoRoot', async () => {
    const d = path.join(empty, 'adapters', 'claude-code');
    w(path.join(d, '.claude-plugin', 'plugin.json'), '{}');
    w(path.join(d, '.shards-dev'), '');
    expect((await check('mcp.claude')).status).toBe('PASS');
  });
  it('mcp.codex warns, never fails; passes with entry', async () => {
    expect((await check('mcp.codex')).status).toBe('WARN');
    w(path.join(home, '.codex', 'config.toml'), '[mcp_servers.shards]\ncommand = "node"\n');
    expect((await check('mcp.codex')).status).toBe('PASS');
  });
  it('hooks: absent warns; resolvable passes; missing script warns', async () => {
    expect((await check('hooks')).status).toBe('WARN');
    const d = path.join(empty, 'adapters', 'claude-code');
    w(path.join(d, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: `node "${path.join(empty, 'h.js')}"` }] }] } }));
    expect((await check('hooks')).status).toBe('WARN');
    w(path.join(empty, 'h.js'), 'console.log(1);\n');
    expect((await check('hooks')).status).toBe('PASS');
    w(path.join(empty, 'h.js'), 'function (\n');
    expect((await check('hooks')).status).toBe('WARN');
  });
});

describe('git checks', () => {
  it('not a repo warns', async () => {
    expect((await check('git.repo')).status).toBe('WARN');
  });
  it('repo, head, merge, ignore, pending in a clean repo', async () => {
    gitInit(); commit();
    const cs = await runChecks({ root, home, repoRoot: empty });
    expect(get(cs, 'git.repo').status).toBe('PASS');
    expect(get(cs, 'git.head').status).toBe('PASS');
    expect(get(cs, 'git.merge').status).toBe('PASS');
    expect(get(cs, 'git.pending').status).toBe('PASS');
    expect(get(cs, 'git.ignore').status).toBe('WARN');
  });
  it('detached HEAD warns', async () => {
    gitInit(); commit();
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd: root });
    expect((await check('git.head')).status).toBe('WARN');
  });
  it('merge in progress warns', async () => {
    gitInit(); commit();
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    w(path.join(root, '.git', 'MERGE_HEAD'), sha + '\n');
    expect((await check('git.merge')).status).toBe('WARN');
  });
  it('pending warns, stuck fails', async () => {
    gitInit(); commit();
    const f = path.join(root, '.shards', 'state', 'git-pending.json');
    const store = (status) => ({ next_seq: 2, records: { g1: { gate: 'g1', status, seq: 1, tries: 1 } } });
    w(f, JSON.stringify(store('pending')));
    const p = await check('git.pending');
    expect(p.status).toBe('WARN');
    w(f, JSON.stringify(store('stuck')));
    const s = await check('git.pending');
    expect(s.status).toBe('FAIL');
    expect(s.fix).toMatch(/doctor --fix/);
  });
});

describe('permissions.gate-tools', () => {
  const settings = (rules) => JSON.stringify({ permissions: { allow: rules } });
  it('passes with no rules / gate_request only', async () => {
    expect((await check('permissions.gate-tools')).status).toBe('PASS');
    w(path.join(root, '.claude', 'settings.json'), settings(['mcp__plugin_shards_shards__gate_request', 'Bash(ls:*)']));
    expect((await check('permissions.gate-tools')).status).toBe('PASS');
  });
  it.each([
    'mcp__plugin_shards_shards__gate_confirm',
    'mcp__plugin_shards_shards__gate_advance',
    'mcp__plugin_shards_shards__gate_force_close',
    'mcp__plugin_shards_shards__gate_suspend',
    'mcp__plugin_shards_shards',
    'mcp__plugin_shards_shards__*',
    'mcp__shards',
    'mcp__shards__*',
    'mcp__shards__gate_*',
    'mcp__*',
    'gate_advance',
  ])('fails on rule %s', async (rule) => {
    w(path.join(root, '.claude', 'settings.local.json'), settings([rule]));
    const c = await check('permissions.gate-tools');
    expect(c.status).toBe('FAIL');
    expect(c.message).toContain('settings.local.json');
    expect(c.message).toContain(rule);
  });
  it('detects rule in the injected home settings', async () => {
    w(path.join(home, '.claude', 'settings.json'), settings(['mcp__shards__*']));
    expect((await check('permissions.gate-tools')).status).toBe('FAIL');
  });
  it('detects Codex auto-approve entries, ignores prompt mode', async () => {
    w(path.join(home, '.codex', 'config.toml'), '[mcp_servers.shards]\ncommand="x"\n[mcp_servers.shards.tools.gate_advance]\napproval_mode = "prompt"\n');
    expect((await check('permissions.gate-tools')).status).toBe('PASS');
    w(path.join(home, '.codex', 'config.toml'), '[mcp_servers.shards]\ncommand="x"\n[mcp_servers.shards.tools.gate_advance]\napproval_mode = "approve"\n');
    expect((await check('permissions.gate-tools')).status).toBe('FAIL');
    w(path.join(root, '.codex', 'config.toml'), '[mcp_servers.shards]\nauto_approve = ["gate_confirm"]\n');
    fs.rmSync(path.join(home, '.codex'), { recursive: true });
    expect((await check('permissions.gate-tools')).status).toBe('FAIL');
  });
  it('ruleCoversGateTools ignores unrelated servers', () => {
    expect(ruleCoversGateTools('mcp__other__*')).toBe(false);
    expect(ruleCoversGateTools('mcp__other__gate_x')).toBe(false);
  });
});

describe('run()', () => {
  let logs;
  beforeEach(() => { logs = []; vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' '))); vi.spyOn(console, 'error').mockImplementation(() => {}); process.env.HOME = home; });
  afterEach(() => vi.restoreAllMocks());

  it('--help exits 0; bad option exits 2', async () => {
    expect(await run(['--help'])).toBe(0);
    expect(logs.join('\n')).toMatch(/Usage: shards doctor/);
    expect(await run(['--bogus'])).toBe(2);
  });
  it('--json shape and exit 0 without FAIL', async () => {
    const code = await run(['--root', root, '--json']);
    const j = JSON.parse(logs.join('\n'));
    expect(Array.isArray(j.checks)).toBe(true);
    expect(j.summary.pass + j.summary.warn + j.summary.fail).toBe(j.checks.length);
    expect(j.summary.fail).toBe(0);
    expect(code).toBe(0);
    for (const c of j.checks) expect(['PASS', 'WARN', 'FAIL']).toContain(c.status);
  });
  it('exit 1 with a FAIL; text output has fix line', async () => {
    w(path.join(root, 'shards.config.yaml'), 'version: 1\ngates:\n  policy: bogus\n');
    expect(await run(['--root', root])).toBe(1);
    const out = logs.join('\n');
    expect(out).toMatch(/FAIL\s+config/);
    expect(out).toMatch(/\n\s+fix: edit/);
  });
  it('--fix appends .gitignore idempotently; without --fix nothing is written', async () => {
    gitInit(); commit();
    await run(['--root', root]);
    expect(fs.existsSync(path.join(root, '.gitignore'))).toBe(false);
    expect(logs.join('\n')).toMatch(/--fix/);
    await run(['--root', root, '--fix']);
    await run(['--root', root, '--fix']);
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(gi.split('\n').filter((l) => l === '.shards/').length).toBe(1);
    expect((await check('git.ignore')).status).toBe('PASS');
  });
  it('--fix preserves existing .gitignore content', async () => {
    gitInit(); commit();
    w(path.join(root, '.gitignore'), 'node_modules');
    await run(['--root', root, '--fix']);
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('node_modules\n.shards/\n');
  });
});

describe('shards CLI wiring', () => {
  it('main lists doctor and dispatches --help', async () => {
    const { COMMANDS } = require('../cli/shards.js');
    expect(COMMANDS.doctor).toBeTruthy();
    const out = execFileSync('node', [path.join(__dirname, '..', 'cli', 'shards.js'), 'doctor', '--help'], { encoding: 'utf8' });
    expect(out).toMatch(/Usage: shards doctor/);
  });
});
