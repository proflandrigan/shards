// doctor and connect read the Codex config `shards install --codex` writes: $CODEX_HOME/config.toml (default
// ~/.codex). Before the fix both looked only at $HOME/.codex, so with CODEX_HOME set doctor missed the server and
// a gate-tool auto-approve, and connect reported registered servers as missing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const CLI = path.join(__dirname, '..', 'cli', 'shards.js');
let tmp; let home; let codexHome; let proj;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codexhome-'));
  home = path.join(tmp, 'home'); codexHome = path.join(tmp, 'codex'); proj = path.join(tmp, 'proj');
  for (const d of [home, codexHome, proj]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(codexHome, 'config.toml'), [
    '[mcp_servers.shards]', 'command = "node"', 'default_tools_approval_mode = "approve"', '',
    '[mcp_servers.atlassian]', 'url = "https://mcp.atlassian.com/v2/mcp"', '',
  ].join('\n'));
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const cli = (...args) => {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: codexHome };
  delete env.SHARDS_PROJECT_ROOT;
  return spawnSync(process.execPath, [CLI, ...args], { cwd: proj, env, encoding: 'utf8' });
};

describe('CODEX_HOME', () => {
  it('doctor finds the MCP entry and the gate-tool auto-approve in $CODEX_HOME/config.toml', () => {
    const r = cli('doctor', '--json');
    const checks = JSON.parse(r.stdout).checks;
    expect(checks.find((c) => c.id === 'mcp.codex').status).toBe('PASS');
    const perm = checks.find((c) => c.id === 'permissions.gate-tools');
    expect(perm.status).toBe('FAIL');
    expect(perm.message).toContain(path.join(codexHome, 'config.toml'));
  });
  it('connect sees servers registered in $CODEX_HOME/config.toml', () => {
    const r = cli('connect', '--host', 'codex', '--only', 'atlassian', '--json');
    const row = JSON.parse(r.stdout).integrations[0];
    expect(row.registered).toBe(true);
    expect(row.file).toBe(path.join(codexHome, 'config.toml'));
  });
});
