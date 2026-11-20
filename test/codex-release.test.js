import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { compile } = require('../build/compile');
const pkg = require('../package.json');

const REPO = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-cxrel-'));
const OUT = path.join(root, 'rel');
const CLAUDE = path.join(root, 'claude');
const read = (rel, d = OUT) => fs.readFileSync(path.join(d, rel), 'utf8');
const exists = (rel, d = OUT) => fs.existsSync(path.join(d, rel));
const list = (d) => fs.readdirSync(d, { recursive: true }).map(String).sort();

beforeAll(() => {
  expect(compile({ target: 'codex', outDir: OUT, bundleDeps: false }).errors).toEqual([]);
  expect(compile({ target: 'claude', outDir: CLAUDE, bundleDeps: false }).errors).toEqual([]);
}, 120000);
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('codex release package (E8.1/E8.2/E8.3)', () => {
  it('emits the plugin manifest', () => {
    const m = JSON.parse(read('.codex-plugin/plugin.json'));
    expect(m).toMatchObject({ name: 'shards', version: pkg.version, skills: './skills/' });
    // No plugin MCP server: Codex 0.169 runs it from the plugin cache with a scrubbed env (split-brain state, CX-7).
    expect(m.mcpServers).toBeUndefined();
    expect(exists('.mcp.json')).toBe(false);
    expect(exists('.shards-dev')).toBe(false);
  });
  it('skills are the same set as the claude release (minus claude-only conventions)', () => {
    const skills = (d) => fs.readdirSync(path.join(d, 'skills')).sort();
    expect(skills(OUT)).toEqual(skills(CLAUDE).filter((s) => s !== 'shards-conventions'));
    for (const s of skills(OUT)) expect(exists(`skills/${s}/SKILL.md`)).toBe(true);
    expect(read('skills/agents/SKILL.md')).toContain('`mcp__shards__list_agents`');
  });
  it('packages consult subagents as .codex/agents/<id>.toml', () => {
    const agents = fs.readdirSync(path.join(OUT, '.codex/agents')).filter((f) => f.endsWith('.toml'));
    expect(agents.length).toBeGreaterThan(5);
    expect(agents).toContain('researcher.toml');
    for (const a of agents) {
      const t = read(`.codex/agents/${a}`);
      expect(t).toMatch(/^name = "/m);
      expect(t).toMatch(/^description = "/m);
      expect(t).toContain('developer_instructions = """');
      expect(t).not.toMatch(/^model\s*=/m);
    }
    const claudeAgents = fs.readdirSync(path.join(CLAUDE, 'agents')).map((f) => f.replace(/\.md$/, '')).sort();
    expect(agents.map((f) => f.replace(/\.toml$/, '')).sort()).toEqual(claudeAgents);
  });
  it('leaves MCP registration to shards install --codex (no placeholder paths)', () => {
    const toml = read('.codex/config.toml');
    expect(toml).not.toMatch(/^\[mcp_servers\.shards\]/m);
    expect(toml).not.toContain('<PLUGIN_ROOT>');
    expect(toml).toContain('shards install --codex');
  });
  it('emits max_depth / max_threads guidance and v2 profile files (no [profiles.*] tables)', () => {
    const toml = read('.codex/config.toml');
    expect(toml).toMatch(/# max_depth = 2/);
    expect(toml).toMatch(/# max_threads = 4/);
    expect(toml).not.toMatch(/^\[profiles\./m);
    expect(toml).not.toMatch(/^profile\s*=/m);
    const prof = read('.codex/shards-syn.config.toml');
    expect(prof.startsWith('# shards:generated codex profile v1')).toBe(true);
    expect(prof).toMatch(/^developer_instructions = "You are the Shards agent syn\./m);
    expect(prof).not.toMatch(/^\[/m); // top-level keys only
  });
  it('hooks live at hooks/hooks.json with ${PLUGIN_ROOT} commands and the --host codex marker', () => {
    expect(exists('.codex/hooks.json')).toBe(false);
    const h = JSON.parse(read('hooks/hooks.json'));
    const cmds = [];
    for (const arr of Object.values(h.hooks)) for (const g of arr) for (const x of g.hooks) cmds.push(x.command);
    expect(cmds.length).toBe(4);
    for (const c of cmds) {
      expect(c).not.toContain('{{');
      const m = /^node "\$\{PLUGIN_ROOT\}\/(hooks\/[\w.-]+\.js)" --host codex$/.exec(c);
      expect(m, c).toBeTruthy();
      expect(exists(m[1]), m[1]).toBe(true); // packaged next to hooks.json
    }
  });
});

describe('codex release is a real package', () => {
  it('copies the runtime and hook shims', () => {
    for (const f of ['runtime/server.js', 'core', 'bindings', 'hooks/lib/host.js', 'hooks/pre-tool-use.js', 'package.json', 'README.md']) expect(exists(f), f).toBe(true);
    expect(exists('node_modules')).toBe(false);
  });
  it('is deterministic', () => {
    const b = path.join(root, 'again');
    compile({ target: 'codex', outDir: b, bundleDeps: false });
    expect(list(b)).toEqual(list(OUT));
    expect(read('.codex/config.toml', b)).toBe(read('.codex/config.toml'));
  });
});

describe('codex dev build keeps absolute paths', () => {
  it('uses the repo runtime and still has approvals', () => {
    const o = path.join(root, 'dev');
    expect(compile({ target: 'codex', outDir: o, dev: true, bundleDeps: false }).errors).toEqual([]);
    const toml = read('.codex/config.toml', o);
    expect(toml).toContain(`args = [${JSON.stringify(path.join(REPO, 'runtime', 'server.js').replace(/\\/g, '/'))}, "--host", "codex"]`);
    expect(toml).toContain('default_tools_approval_mode = "approve"');
    for (const t of ['gate_advance', 'gate_force_close', 'gate_confirm', 'gate_suspend']) {
      expect(toml).toMatch(new RegExp(`\\[mcp_servers\\.shards\\.tools\\.${t}\\]\\napproval_mode = "prompt"`));
    }
    expect(toml).not.toMatch(/tools\.gate_request\]/);
    expect(toml).toMatch(/# max_depth = 2/);
    const hooks = read('hooks/hooks.json', o);
    expect(hooks).toContain(`${path.join(REPO, 'hooks').replace(/\\/g, '/')}/pre-tool-use.js\\" --host codex`);
  });
});
