import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

// `shards install --codex`: config.toml MCP block (merge, idempotent, --remove, --dry-run, conflicts) and profile files.
const require = createRequire(import.meta.url);
const inst = require('../cli/commands/install.js');
const cx = require('../cli/commands/install-codex.js');
const relpkg = require('../build/package');

let home; let logs;
const cfg = () => path.join(home, 'config.toml');
const read = (p = cfg()) => fs.readFileSync(p, 'utf8');
const w = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };

// A fake installed plugin in the Codex cache: <home>/plugins/cache/<mkt>/shards/<version>/
function plugin(version, mkt = 'shards-local') {
  const root = path.join(home, 'plugins', 'cache', mkt, 'shards', version);
  w(path.join(root, 'runtime', 'server.js'), '// server\n');
  w(path.join(root, '.codex-plugin', 'plugin.json'), '{"name":"shards"}\n');
  w(path.join(root, '.codex', 'shards-syn.config.toml'), relpkg.codexProfileToml('syn', 'mcp__shards__'));
  w(path.join(root, '.codex', 'shards-data-analyst.config.toml'), relpkg.codexProfileToml('data-analyst', 'mcp__shards__'));
  return root;
}
const run = (...a) => inst.run(['--codex', '--codex-home', home, ...a]);

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'inst-codex-'));
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => logs.push(a.join(' ')));
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(home, { recursive: true, force: true }); });

describe('install --codex', () => {
  it('writes the marked [mcp_servers.shards] block for the newest installed plugin, plus profiles', () => {
    plugin('2.0.0-next.9');
    const newest = plugin('2.0.0-next.10');
    expect(run()).toBe(0);
    const t = read();
    expect(t.startsWith(cx.BEGIN)).toBe(true);
    expect(t).toContain(cx.END);
    expect(t).toContain(`args = [${JSON.stringify(path.join(newest, 'runtime', 'server.js').split(path.sep).join('/'))}, "--host", "codex"]`);
    expect(t).toContain('env = { SHARDS_HOST = "codex" }');
    expect(t).toContain('default_tools_approval_mode = "approve"');
    for (const g of relpkg.CODEX_PROMPT_TOOLS) expect(t).toContain(`[mcp_servers.shards.tools.${g}]\napproval_mode = "prompt"`);
    expect(read(path.join(home, 'shards-syn.config.toml'))).toMatch(/^developer_instructions = /m);
    expect(fs.existsSync(path.join(home, 'shards-data-analyst.config.toml'))).toBe(true);
  });

  it('merges into an existing config without clobbering, is idempotent, and --remove restores it exactly', () => {
    plugin('2.0.0');
    const orig = 'model = "x"\n\n[mcp_servers.other]\ncommand = "o"\n';
    w(cfg(), orig);
    expect(run()).toBe(0);
    const once = read();
    expect(once.startsWith(orig)).toBe(true);
    expect(run()).toBe(0);
    expect(read()).toBe(once);
    expect(logs.some((l) => l.includes('no change'))).toBe(true);
    expect(run('--remove')).toBe(0);
    expect(read()).toBe(orig);
    expect(fs.existsSync(path.join(home, 'shards-syn.config.toml'))).toBe(false);
  });

  it('replaces the block in place when the plugin path changes (upgrade)', () => {
    plugin('2.0.0');
    w(cfg(), 'model = "x"\n');
    run();
    w(cfg(), `${read()}\n[profiles_note]\n`); // user content after the block survives
    const up = plugin('2.1.0');
    expect(run()).toBe(0);
    const t = read();
    expect(t.match(/# shards:begin codex-mcp/g)).toHaveLength(1);
    expect(t).toContain(path.join(up, 'runtime', 'server.js').split(path.sep).join('/'));
    expect(t).toContain('[profiles_note]');
  });

  it('--remove deletes a config file it created and leaves foreign profile files alone', () => {
    plugin('2.0.0');
    w(path.join(home, 'shards-syn.config.toml'), 'developer_instructions = "mine"\n');
    expect(run()).toBe(0);
    expect(read(path.join(home, 'shards-syn.config.toml'))).toBe('developer_instructions = "mine"\n');
    expect(logs.some((l) => l.includes('skipped 1 existing file'))).toBe(true);
    expect(run('--remove')).toBe(0);
    expect(fs.existsSync(cfg())).toBe(false);
    expect(fs.existsSync(path.join(home, 'shards-syn.config.toml'))).toBe(true);
    expect(fs.existsSync(path.join(home, 'shards-data-analyst.config.toml'))).toBe(false);
  });

  it('--dry-run writes nothing', () => {
    plugin('2.0.0');
    expect(run('--dry-run')).toBe(0);
    expect(fs.existsSync(cfg())).toBe(false);
    expect(fs.existsSync(path.join(home, 'shards-syn.config.toml'))).toBe(false);
    expect(logs.some((l) => l.includes('[dry-run]'))).toBe(true);
  });

  it('refuses a hand-written [mcp_servers.shards] table', () => {
    plugin('2.0.0');
    const orig = '[mcp_servers.shards]\ncommand = "node"\nargs = ["./runtime/server.js"]\n';
    w(cfg(), orig);
    expect(run()).toBe(1);
    expect(read()).toBe(orig);
    expect(logs.join('\n')).toContain('not written by shards install');
  });

  it('errors with a fix hint when no plugin is installed; --server and --codex-config override discovery', () => {
    expect(run()).toBe(1);
    expect(logs.join('\n')).toContain('codex plugin add shards@');
    const server = path.join(home, 'elsewhere', 'runtime', 'server.js');
    w(server, '');
    const proj = path.join(home, 'proj', '.codex', 'config.toml');
    expect(run('--server', server, '--codex-config', proj)).toBe(0);
    expect(read(proj)).toContain(JSON.stringify(server.split(path.sep).join('/')));
    expect(fs.existsSync(cfg())).toBe(false);
  });

  it('a dev build dir (--plugin-dir with .shards-dev) uses the repo runtime', () => {
    const dev = path.join(home, 'dev');
    w(path.join(dev, '.shards-dev'), 'x');
    expect(run('--plugin-dir', dev)).toBe(0);
    expect(read()).toContain(path.resolve(__dirname, '..', 'runtime', 'server.js').split(path.sep).join('/'));
  });

  it('runs inside the source repo without --force (it writes only the Codex home)', () => {
    plugin('2.0.0');
    expect(inst.run(['--codex', '--codex-home', home, '--root', path.resolve(__dirname, '..')])).toBe(0);
  });

  it('Codex-only options require --codex', () => {
    expect(inst.run(['--agents-md', '--server', 'x'])).toBe(2);
  });

  it('cmpVersion orders numerically with prereleases below releases', () => {
    expect(['2.0.0', '2.0.0-next.10', '2.0.0-next.9', '1.9.9'].sort(cx.cmpVersion)).toEqual(['1.9.9', '2.0.0-next.9', '2.0.0-next.10', '2.0.0']);
  });
});
