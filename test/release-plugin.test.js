import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { compile } = require('../build/compile');
const relpkg = require('../build/package');
const pkg = require('../package.json');

const REPO = path.resolve(__dirname, '..');
const CLI = path.join(REPO, 'cli', 'shards.js');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-rel-'));
const OUT = path.join(root, 'plugin');
const NODEPS = path.join(root, 'nodeps');
const json = (d, rel) => JSON.parse(fs.readFileSync(path.join(d, rel), 'utf8'));

beforeAll(() => {
  expect(compile({ target: 'claude', outDir: OUT }).errors).toEqual([]); // bundleDeps defaults to true
  expect(compile({ target: 'claude', outDir: NODEPS, bundleDeps: false }).errors).toEqual([]);
}, 120000);
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('release plugin layout', () => {
  it('emits manifest, mcp entry and verbatim hooks', () => {
    const m = json(OUT, '.claude-plugin/plugin.json');
    expect(m).toMatchObject({ name: 'shards', version: pkg.version, license: pkg.license, repository: 'https://github.com/proflandrigan/shards' });
    expect(m.userConfig).toBeUndefined();
    expect(json(OUT, '.mcp.json').mcpServers.shards).toEqual({ command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/runtime/server.js'], env: { SHARDS_PROJECT_ROOT: '${CLAUDE_PROJECT_DIR}' } });
    expect(fs.readFileSync(path.join(OUT, 'hooks/hooks.json'), 'utf8')).toBe(fs.readFileSync(path.join(REPO, 'hooks/claude-code.hooks.json'), 'utf8'));
    expect(fs.existsSync(path.join(OUT, '.shards-dev'))).toBe(false);
    expect(json(OUT, 'package.json')).toEqual({ name: 'shards', version: pkg.version, private: true, dependencies: pkg.dependencies });
    for (const f of ['runtime/server.js', 'core', 'bindings', 'build/emit.js', 'hooks/lib/host.js', 'scripts/validate-agents.js']) expect(fs.existsSync(path.join(OUT, f)), f).toBe(true);
  });
  it('bundles only the production dependency closure', () => {
    const names = relpkg.depClosure().map((d) => d.name);
    for (const d of Object.keys(pkg.dependencies)) expect(names).toContain(d);
    expect(names).not.toContain('vitest');
    expect(fs.existsSync(path.join(OUT, 'node_modules/vitest'))).toBe(false);
    expect(fs.existsSync(path.join(OUT, 'node_modules/@modelcontextprotocol/sdk/package.json'))).toBe(true);
    expect(fs.existsSync(path.join(NODEPS, 'node_modules'))).toBe(false);
  });
  it('is deterministic', () => {
    const b = path.join(root, 'again');
    compile({ target: 'claude', outDir: b, bundleDeps: false });
    const list = (d) => fs.readdirSync(d, { recursive: true }).map(String).sort();
    expect(list(b)).toEqual(list(NODEPS));
    expect(fs.readFileSync(path.join(b, '.mcp.json'), 'utf8')).toBe(fs.readFileSync(path.join(NODEPS, '.mcp.json'), 'utf8'));
  });
});

describe('release plugin: self-contained MCP server', () => {
  it('spawns runtime/server.js from the package over stdio and lists tools', async () => {
    const cwd = fs.mkdtempSync(path.join(root, 'proj-'));
    const child = spawn('node', [path.join(OUT, 'runtime', 'server.js')], { cwd, env: { ...process.env, SHARDS_PROJECT_ROOT: cwd }, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = ''; const waiters = new Map();
    child.stdout.on('data', (c) => {
      buf += c; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try { const m = JSON.parse(line); if (m.id != null && waiters.has(m.id)) waiters.get(m.id)(m); } catch (_) { /* ignore */ }
      }
    });
    const call = (id, method, params) => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout ${method}`)), 20000);
      waiters.set(id, (m) => { clearTimeout(t); res(m); });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
    try {
      const init = await call(1, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } });
      expect(init.result.serverInfo).toBeTruthy();
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const list = await call(2, 'tools/list', {});
      const names = list.result.tools.map((t) => t.name);
      expect(names).toContain('activate');
      expect(names).toContain('gate_request');
    } finally { child.kill(); }
  }, 60000);
});

describe('release plugin hooks', () => {
  const cmds = () => Object.values(json(OUT, 'hooks/hooks.json').hooks).flatMap((gs) => gs.flatMap((g) => g.hooks.map((h) => h.command)));
  it('every hook command path exists in the package', () => {
    const cs = cmds();
    expect(cs.length).toBe(4); // recorder, handshake, re-ground + SubagentStop (S5F)
    for (const c of cs) {
      const m = /node "([^"]+)"/.exec(c);
      expect(m).toBeTruthy();
      const p = m[1].replace('${CLAUDE_PLUGIN_ROOT}', OUT);
      expect(p.startsWith(OUT)).toBe(true);
      expect(fs.existsSync(p), p).toBe(true);
    }
  });
  it('shims run from the packaged dir and write state', () => {
    const proj = fs.mkdtempSync(path.join(root, 'hproj-'));
    const sid = '11111111-1111-4111-8111-111111111111';
    const env = { ...process.env, CLAUDE_PROJECT_DIR: proj, CLAUDE_PLUGIN_ROOT: OUT };
    delete env.SHARDS_PROJECT_ROOT;
    const run = (shim, payload) => spawnSync('node', [path.join(OUT, 'hooks', shim)], { input: JSON.stringify({ session_id: sid, cwd: proj, ...payload }), cwd: os.tmpdir(), env, encoding: 'utf8' });
    expect(run('session-start.js', { hook_event_name: 'SessionStart', source: 'startup' }).status).toBe(0);
    expect(run('user-prompt-submit.js', { hook_event_name: 'UserPromptSubmit', prompt: 'hello', permission_mode: 'default' }).status).toBe(0);
    const pre = run('pre-tool-use.js', { hook_event_name: 'PreToolUse', tool_name: 'mcp__plugin_shards_shards__gate_advance', tool_use_id: 't1', tool_input: {}, permission_mode: 'default' });
    expect(pre.status).toBe(0);
    expect(JSON.parse(pre.stdout).hookSpecificOutput.permissionDecision).toBe('ask');
    const sdir = path.join(proj, '.shards', 'state', 'sessions', sid);
    expect(fs.existsSync(path.join(sdir, 'prompts.jsonl'))).toBe(true);
    expect(json(sdir, 'hooks.json').lastGateCall.tool).toMatch(/gate_advance$/);
    expect(fs.existsSync(path.join(proj, '.shards', 'state', 'handshake'))).toBe(true);
  });
  it('nothing packaged allows gate_advance / gate_force_close', () => {
    const text = [path.join(OUT, 'hooks/hooks.json'), path.join(OUT, '.mcp.json'), path.join(OUT, '.claude-plugin/plugin.json')].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    expect(text).not.toMatch(/gate_(advance|force_close)/);
    expect(fs.existsSync(path.join(OUT, 'settings.json'))).toBe(false);
    expect(fs.readFileSync(path.join(OUT, 'hooks/pre-tool-use.js'), 'utf8')).not.toMatch(/allowedTools|permissions\.allow/);
  });
});

describe('marketplace', () => {
  it('committed root marketplace.json equals the generator output (drift check)', () => {
    expect(fs.readFileSync(path.join(REPO, '.claude-plugin', 'marketplace.json'), 'utf8')).toBe(relpkg.marketplaceText());
    const m = JSON.parse(relpkg.marketplaceText());
    expect(m).toMatchObject({ name: 'shards', owner: { name: 'proflandrigan' } });
    expect(m.plugins).toHaveLength(1);
    expect(m.plugins[0]).toMatchObject({ name: 'shards', source: './plugins/shards', version: pkg.version });
  });
  it('CLI --marketplace writes manifest and plugin', () => {
    const out = path.join(root, 'mkt');
    const r = spawnSync('node', [CLI, 'build', '--target', 'claude', '--marketplace', '--no-bundle-deps', '--out', out], { encoding: 'utf8' });
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(path.join(out, '.claude-plugin/marketplace.json'), 'utf8')).toBe(relpkg.marketplaceText());
    expect(fs.existsSync(path.join(out, 'plugins/shards/.claude-plugin/plugin.json'))).toBe(true);
    expect(spawnSync('node', [CLI, 'build', '--target', 'codex', '--marketplace'], { encoding: 'utf8' }).status).toBe(2);
  });
});
