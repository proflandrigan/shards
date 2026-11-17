import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { compile } = require('../build/compile');
const { CLAUDE_TOOL_PREFIX } = require('../build/render');
const host = require('../hooks/lib/host');

const REPO = path.resolve(__dirname, '..');
const CLI = path.join(REPO, 'cli', 'shards.js');
const tmps = [];
function tmp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-dev-')); tmps.push(d); return d; }
afterEach(() => { while (tmps.length) fs.rmSync(tmps.pop(), { recursive: true, force: true }); });
const json = (d, rel) => JSON.parse(fs.readFileSync(path.join(d, rel), 'utf8'));
const read = (d, rel) => fs.readFileSync(path.join(d, rel), 'utf8');

function build(target, dev = true) {
  const parent = tmp();
  const out = path.join(parent, target === 'claude' ? 'claude-code' : target);
  const r = compile({ bundleDeps: false, target, outDir: out, dev });
  expect(r.errors).toEqual([]);
  return { parent, out };
}
function hookPaths(hooksJson) {
  const paths = [];
  for (const groups of Object.values(hooksJson.hooks)) for (const g of groups) for (const h of g.hooks) {
    const m = /node "([^"]+)"/.exec(h.command);
    expect(m).toBeTruthy();
    paths.push(m[1]);
  }
  return paths;
}

describe('dev install: claude', () => {
  it('emits plugin structure', () => {
    const { out } = build('claude');
    for (const f of ['.claude-plugin/plugin.json', '.mcp.json', 'hooks/hooks.json', '.shards-dev', 'skills/agents/SKILL.md']) expect(fs.existsSync(path.join(out, f)), f).toBe(true);
    expect(json(out, '.claude-plugin/plugin.json')).toMatchObject({ name: 'shards' });
    const mcp = json(out, '.mcp.json').mcpServers.shards;
    expect(mcp.command).toBe('node');
    expect(mcp.args[0]).toBe(path.join(REPO, 'runtime', 'server.js').replace(/\\/g, '/'));
    expect(fs.existsSync(mcp.args[0])).toBe(true);
    expect(mcp.env.SHARDS_PROJECT_ROOT).toBe('${CLAUDE_PROJECT_DIR}');
  });
  it('hooks.json uses absolute existing hook paths', () => {
    const { out } = build('claude');
    const hj = json(out, 'hooks/hooks.json');
    const ps = hookPaths(hj);
    expect(ps.length).toBe(4);
    for (const p of ps) { expect(path.isAbsolute(p)).toBe(true); expect(fs.existsSync(p), p).toBe(true); }
    expect(read(out, 'hooks/hooks.json')).not.toContain('CLAUDE_PLUGIN_ROOT');
  });
  it('tool prefix and gate matcher', () => {
    const { out } = build('claude');
    expect(CLAUDE_TOOL_PREFIX).toBe('mcp__plugin_shards_shards__');
    const skill = read(out, 'skills/agents/SKILL.md');
    expect(skill).toContain('mcp__plugin_shards_shards__list_agents');
    expect(skill).not.toContain('mcp__shards__');
    const re = new RegExp(json(out, 'hooks/hooks.json').hooks.PreToolUse[0].matcher);
    for (const t of ['advance', 'force_close']) {
      const name = `${CLAUDE_TOOL_PREFIX}gate_${t}`;
      expect(re.test(name)).toBe(true);
      expect(host.isGateTool(name)).toBe(true);
    }
    // matcher is now all tools (auto-verify, E11.12); the gate-only filter lives in the shim.
    expect(re.test(`${CLAUDE_TOOL_PREFIX}activate`)).toBe(true);
    expect(host.isGateTool(`${CLAUDE_TOOL_PREFIX}activate`)).toBe(false);
  });
  it('real core renders the plugin prefix everywhere, never the old one', () => {
    const { out } = build('claude');
    let seen = false;
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (/\.md$/.test(e.name)) {
        const t = fs.readFileSync(p, 'utf8');
        expect(t.includes('mcp__shards__'), p).toBe(false);
        if (t.includes(CLAUDE_TOOL_PREFIX)) seen = true;
      } } };
    walk(out);
    expect(seen).toBe(true);
  });
  it('lint-models is clean', () => {
    const { parent } = build('claude');
    const r = spawnSync('node', [path.join(REPO, 'scripts', 'lint-models.js'), '--adapters', parent], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});

describe('dev install: codex', () => {
  it('emits config, hooks and plugin docs', () => {
    const { out } = build('codex');
    for (const f of ['.codex-plugin/plugin.json', '.codex/config.toml', '.codex/hooks.json', '.shards-dev', 'skills/agents/SKILL.md']) expect(fs.existsSync(path.join(out, f)), f).toBe(true);
    expect(json(out, '.codex-plugin/plugin.json')).toMatchObject({ name: 'shards', skills: './skills/' });
    const toml = read(out, '.codex/config.toml');
    expect(toml).toContain('[mcp_servers.shards]');
    expect(toml).toContain('command = "node"');
    expect(toml).toContain(JSON.stringify(path.join(REPO, 'runtime', 'server.js').replace(/\\/g, '/')));
    expect(read(out, '.codex/hooks.json')).not.toContain('{{SHARDS_HOOKS_DIR}}');
    for (const p of hookPaths(json(out, '.codex/hooks.json'))) expect(fs.existsSync(p), p).toBe(true);
    const skill = read(out, 'skills/agents/SKILL.md');
    expect(skill).toContain('`shards.list_agents`');
  });
  it('lint-models is clean', () => {
    const { parent } = build('codex');
    const r = spawnSync('node', [path.join(REPO, 'scripts', 'lint-models.js'), '--adapters', parent], { encoding: 'utf8' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});

describe('non-dev and cli', () => {
  it('non-dev emits the agents skill but no dev files', () => {
    for (const t of ['claude', 'codex', 'skills']) {
      const { out } = build(t, false);
      expect(fs.existsSync(path.join(out, 'skills/agents/SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(out, '.shards-dev'))).toBe(false);
      expect(fs.existsSync(path.join(out, '.mcp.json'))).toBe(t !== 'skills'); // release claude (E7.4) and codex (E8.3) emit the packaged MCP entry
      if (t === 'claude') expect(read(out, '.mcp.json')).toContain('CLAUDE_PLUGIN_ROOT');
    }
  });
  it('build --dev prints install hint; uninstall-dev removes only marked dirs', () => {
    const cwd = tmp();
    fs.mkdirSync(path.join(cwd, 'adapters', 'codex'), { recursive: true }); // unmarked: must survive
    const b = spawnSync('node', [CLI, 'build', '--target', 'claude', '--dev'], { cwd, encoding: 'utf8' });
    expect(b.status, b.stderr).toBe(0);
    const dir = path.join(cwd, 'adapters', 'claude-code');
    expect(fs.existsSync(path.join(dir, '.shards-dev'))).toBe(true);
    expect(fs.realpathSync(dir) && b.stdout).toContain('claude --plugin-dir');
    const u = spawnSync('node', [CLI, 'uninstall-dev', '--target', 'all'], { cwd, encoding: 'utf8' });
    expect(u.status, u.stderr).toBe(0);
    expect(fs.existsSync(dir)).toBe(false);
    expect(fs.existsSync(path.join(cwd, 'adapters', 'codex'))).toBe(true);
    expect(u.stdout).toContain('not persistent');
  });
  it('codex dev hint is marked UNVERIFIED', () => {
    const out = path.join(tmp(), 'codex');
    const b = spawnSync('node', [CLI, 'build', '--target', 'codex', '--dev', '--out', out], { encoding: 'utf8' });
    expect(b.status, b.stderr).toBe(0);
    expect(b.stdout).toContain('UNVERIFIED');
  });
});
