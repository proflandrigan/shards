import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const install = path.join(root, 'tools/install.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'shards-noui-'));
const run = (dir, ...args) => spawnSync('node', [install, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, SHARDS_LEGACY_INSTALL: '1' } });
const cmds = (s) => (Object.values(s.hooks || {}).flat().flatMap((e) => (e.hooks || []).map((h) => h.command)));
const BAD = /relay\.js|ui-push|\.shards\/ui/;

describe('installer without UI', () => {
  it('fresh install wires no gate hooks and has no UI traces', () => {
    const dir = tmp();
    const r = run(dir);
    expect(r.status, r.stderr).toBe(0);
    const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    expect(cmds(s).filter((c) => /gate-hook\.js/.test(c)).length).toBe(0);
    expect(fs.existsSync(path.join(dir, '.shards/hooks/gate-hook.js'))).toBe(false);
    expect(cmds(s).some((c) => BAD.test(c))).toBe(false);
    expect([...(s.permissions.allow || []), ...(s.permissions.deny || []), ...(s.permissions.ask || [])].some((p) => BAD.test(p))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.shards/ui'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.claude/commands/shards-ui.md'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.claude/commands/shards-guide.md'))).toBe(false);
  });

  it('re-install strips legacy relay and gate-hook wiring and ui permissions', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, '.claude'));
    const relay = (c) => ({ matcher: '', hooks: [{ type: 'command', command: `node $CLAUDE_PROJECT_DIR/.shards/ui/relay.js ${c}` }] });
    const gate = (c) => ({ matcher: '', hooks: [{ type: 'command', command: `node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js ${c}` }] });
    fs.writeFileSync(path.join(dir, '.claude/settings.json'), JSON.stringify({
      hooks: { Stop: [relay('stop'), gate('stop')], PostToolUse: [relay('post-tool-use')], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node $CLAUDE_PROJECT_DIR/.shards/ui/relay.js pre-tool-use' }] }] },
      permissions: { allow: ['Bash(node .shards/ui/ui-push.js:*)', 'Bash(ls:*)'] },
    }));
    const r = run(dir);
    expect(r.status, r.stderr).toBe(0);
    const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
    expect(cmds(s).some((c) => BAD.test(c))).toBe(false);
    expect(s.hooks.PostToolUse).toBeUndefined();
    expect(cmds(s).filter((c) => /gate-hook\.js/.test(c)).length).toBe(0);
    expect(s.permissions.allow.some((p) => BAD.test(p))).toBe(false);
    expect(s.permissions.allow).toContain('Bash(ls:*)');
  });

  it('uninstall still works', () => {
    const dir = tmp();
    expect(run(dir).status).toBe(0);
    const r = run(dir, 'uninstall');
    expect(r.status, r.stderr).toBe(0);
    expect(fs.existsSync(path.join(dir, '.claude/.shards-manifest.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, '.shards/hooks'))).toBe(false);
  });

  it('shards-ui stub: status exits 0, start exits 1', () => {
    const stub = path.join(root, 'tools/shards-ui.js');
    const a = spawnSync('node', [stub, 'status'], { encoding: 'utf8' });
    expect(a.status).toBe(0);
    expect(a.stdout).toContain('@proflandrigan/shards-studio');
    expect(spawnSync('node', [stub], { encoding: 'utf8' }).status).toBe(1);
  });
});
