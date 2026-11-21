import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sync = require('../cli/commands/sync');
const connect = require('../cli/commands/connect');
const doctor = require('../cli/commands/doctor');
const { main } = require('../cli/shards');
const { StateStore } = require('../runtime/state/store');
const copies = require('../runtime/copies');

let tmp; let home; let logs; let errs;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
  home = path.join(tmp, 'home'); fs.mkdirSync(home);
  logs = []; errs = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...a) => errs.push(a.join(' ')));
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(tmp, { recursive: true, force: true }); });
const out = () => logs.join('\n');
const w = (p, t) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };

async function seed(session, gate, target, fails, okAfter = false) {
  const st = new StateStore(tmp, session);
  await st.update('gates', (c) => { c.gates = { ...(c.gates || {}), [gate]: { id: gate, status: 'confirmed', kind: 'phase' } }; return c; });
  for (let i = 0; i < fails; i++) await copies.report({ root: tmp, sessionKey: session }, { gate_id: gate, target, ok: false, error: `boom${i}` });
  if (okAfter) await copies.report({ root: tmp, sessionKey: session }, { gate_id: gate, target, ok: true });
}

describe('shards sync --status', () => {
  it('reports an empty queue', () => {
    expect(sync.run(['--status', '--root', tmp])).toBe(0);
    expect(out()).toMatch(/queue: empty/);
  });
  it('lists pending and stuck copies per gate and target; hides done unless --all', async () => {
    await seed('s1', 'g1', 'confluence', 2);
    await seed('s1', 'g2', 'jira', 5);
    await seed('s2', 'g3', 'confluence', 1, true);
    expect(sync.run(['--status', '--root', tmp])).toBe(0);
    expect(out()).toMatch(/gate g1\s+target confluence\s+pending\s+attempts 2\/5.*last error: boom1/);
    expect(out()).toMatch(/gate g2\s+target jira\s+stuck\s+attempts 5\/5/);
    expect(out()).not.toMatch(/g3/);
    expect(out()).toMatch(/1 pending, 1 stuck/);
    logs.length = 0;
    sync.run(['--status', '--all', '--root', tmp]);
    expect(out()).toMatch(/gate g3\s+target confluence\s+done/);
  });
  it('--json output', async () => {
    await seed('s1', 'g1', 'confluence', 1);
    sync.run(['--status', '--json', '--root', tmp]);
    const j = JSON.parse(out());
    expect(j.summary).toEqual({ pending: 1, stuck: 0 });
    expect(j.copies[0]).toMatchObject({ session: 's1', gate: 'g1', target: 'confluence', status: 'pending', attempts: 1, last_error: 'boom0' });
  });
  it('requires --status, rejects unknown flags, and is wired into the dispatcher', async () => {
    expect(sync.run(['--root', tmp])).toBe(2);
    expect(sync.run(['--bogus'])).toBe(2);
    expect(await main(['sync', '--status', '--root', tmp])).toBe(0);
  });
});

describe('doctor copies check', () => {
  it('PASS when empty, WARN when queued, FAIL when stuck', async () => {
    const get = async () => (await doctor.runChecks({ root: tmp, home })).find((c) => c.id === 'copies');
    expect((await get()).status).toBe('PASS');
    await seed('s1', 'g1', 'confluence', 1);
    expect((await get()).status).toBe('WARN');
    await seed('s1', 'g2', 'jira', 5);
    const c = await get();
    expect(c.status).toBe('FAIL');
    expect(c.message).toMatch(/g2->jira/);
  });
});

describe('shards connect', () => {
  const run = (...a) => connect.run([...a, '--root', tmp, '--home', home]);

  it('git-only fresh machine: everything missing, prints official commands, writes nothing', () => {
    const before = fs.readdirSync(tmp).sort();
    expect(run()).toBe(0);
    const t = out();
    expect(t).toMatch(/MISSING\s+claude\s+Atlassian/);
    expect(t).toContain('claude mcp add --transport http atlassian https://mcp.atlassian.com/v2/mcp');
    expect(t).not.toContain('/v1/sse');
    expect(t).toContain('codex mcp add atlassian');
    expect(t).toContain('codex mcp add atlassian --url https://mcp.atlassian.com/v2/mcp');
    expect(t).toContain('claude mcp add --transport http github https://api.githubcopilot.com/mcp/ --header "Authorization: Bearer YOUR_GITHUB_PAT"');
    expect(t).toContain('codex mcp add github --url https://api.githubcopilot.com/mcp/ --bearer-token-env-var GITHUB_PAT_TOKEN');
    expect(t).toMatch(/Google Drive connector/);
    // Commands carry only a placeholder or an env-var name, never a credential value.
    for (const l of t.split('\n').filter((x) => /run: /.test(x))) {
      expect(l).not.toMatch(/token=|-e [A-Z_]+=|--env /i);
      expect(l).not.toMatch(/gh[pousr]_|github_pat_/);
      if (/Bearer/.test(l)) expect(l).toMatch(/Bearer YOUR_GITHUB_PAT"/);
    }
    expect(fs.readdirSync(tmp).sort()).toEqual(before);
    expect(fs.readdirSync(home)).toEqual([]);
  });
  it('detects servers in .mcp.json, ~/.claude.json project entries and Codex config.toml', () => {
    w(path.join(tmp, '.mcp.json'), JSON.stringify({ mcpServers: { github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' } } }));
    w(path.join(home, '.claude.json'), JSON.stringify({ projects: { [path.resolve(tmp)]: { mcpServers: { corp: { type: 'sse', url: 'https://mcp.atlassian.com/v1/sse' } } }, '/other': { mcpServers: { gdrive: { command: 'x' } } } } }));
    w(path.join(home, '.codex', 'config.toml'), '[mcp_servers.atlassian]\ncommand = "npx"\nargs = ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"]\n\n[mcp_servers.atlassian.env]\nFOO = "1"\n');
    run('--json');
    const j = JSON.parse(out());
    const by = (i, h) => j.integrations.find((r) => r.integration === i && r.host === h);
    expect(by('github', 'claude')).toMatchObject({ registered: true, server: 'github' });
    expect(by('atlassian', 'claude')).toMatchObject({ registered: true, server: 'corp' });
    expect(by('atlassian', 'codex')).toMatchObject({ registered: true, server: 'atlassian' });
    expect(by('github', 'codex')).toMatchObject({ registered: false });
    expect(by('github', 'codex').command).toMatch(/^codex mcp add github/);
    expect(by('drive', 'claude').registered).toBe(false); // other project's entry is not ours
  });
  it('warns about Atlassian servers on the deprecated v1 endpoint (text and --json)', () => {
    w(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { atlassian: { type: 'http', url: 'https://mcp.atlassian.com/v1/mcp' } } }));
    w(path.join(home, '.codex', 'config.toml'), '[mcp_servers.jira]\nurl = "https://mcp.atlassian.com/v2/mcp"\n');
    run('--json', '--only', 'atlassian');
    const j = JSON.parse(out());
    const by = (h) => j.integrations.find((r) => r.host === h);
    expect(by('claude')).toMatchObject({ registered: true, server: 'atlassian' });
    expect(by('claude').warnings).toEqual([expect.objectContaining({
      code: 'deprecated-endpoint', server: 'atlassian',
      command: 'claude mcp remove -s user atlassian && claude mcp add -s user --transport http atlassian https://mcp.atlassian.com/v2/mcp',
    })]);
    expect(by('codex').warnings).toBeUndefined();
    expect(j.warnings).toBe(1);
    run('--only', 'atlassian', '--host', 'claude');
    const t = out();
    expect(t).toMatch(/WARN\s+claude\s+Atlassian/);
    expect(t).toMatch(/warning: .*deprecated Atlassian MCP v1 endpoint/);
    expect(t).toContain('run: claude mcp remove -s user atlassian && claude mcp add -s user --transport http atlassian https://mcp.atlassian.com/v2/mcp');
  });
  it('a v2 registration alongside a v1 one is the reported server; v1 still warned (codex form)', () => {
    w(path.join(home, '.codex', 'config.toml'), '[mcp_servers.old]\nurl = "https://mcp.atlassian.com/v1/sse"\n\n[mcp_servers.atlassian]\nurl = "https://mcp.atlassian.com/v2/mcp"\n');
    run('--json', '--only', 'atlassian', '--host', 'codex');
    const r = JSON.parse(out()).integrations[0];
    expect(r).toMatchObject({ registered: true, server: 'atlassian' });
    expect(r.warnings).toEqual([expect.objectContaining({ server: 'old', command: 'codex mcp remove old && codex mcp add old --url https://mcp.atlassian.com/v2/mcp' })]);
  });
  it('--host and --only filter; invalid values are rejected', () => {
    run('--json', '--host', 'codex', '--only', 'github');
    const j = JSON.parse(out());
    expect(j.integrations).toHaveLength(1);
    expect(j.integrations[0]).toMatchObject({ integration: 'github', host: 'codex' });
    expect(run('--host', 'vim')).toBe(2);
    expect(run('--only', 'notion')).toBe(2);
  });
  it('corrupt config files are ignored, not fatal', () => {
    w(path.join(tmp, '.mcp.json'), '{not json');
    expect(run()).toBe(0);
  });
  it('is wired into the dispatcher', async () => {
    expect(await main(['connect', '--root', tmp, '--home', home])).toBe(0);
  });
});
