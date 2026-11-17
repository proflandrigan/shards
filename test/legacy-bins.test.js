import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// E10.5 prep: the v1 bins are deprecated. gates/sessions forward to the v2 CLI; shards-ui prints the Studio replacement.
const root = path.resolve(__dirname, '..');
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const bin = (n, args = [], cwd) => spawnSync('node', [path.join(root, 'tools', `${n}.js`), ...args], { cwd: cwd || tmp('legacy-bin-'), encoding: 'utf8' });

describe('deprecated v1 bins', () => {
  it('package.json still maps all four legacy bins to files that exist', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const n of ['shards-ui', 'shards-gates', 'shards-sessions']) expect(fs.existsSync(path.join(root, pkg.bin[n]))).toBe(true);
  });

  it('shards-gates warns on stderr, forwards to `shards gates`, same output and exit code', () => {
    const dir = tmp('legacy-gates-');
    const old = bin('shards-gates', ['status'], dir);
    expect(old.stderr).toContain('deprecated');
    expect(old.stderr).toContain('shards gates status');
    const v2 = spawnSync('node', [path.join(root, 'cli/shards.js'), 'gates', 'status'], { cwd: dir, encoding: 'utf8' });
    expect(old.status).toBe(v2.status);
    expect(old.stdout).toBe(v2.stdout);
    expect(old.stdout).toContain('no sessions found');
  });

  it('shards-gates defaults to status and maps bare force-close to --all', () => {
    expect(bin('shards-gates').stdout).toContain('no sessions found');
    const r = bin('shards-gates', ['force-close']);
    expect(r.status).not.toBe(2); // bare form is mapped to --all, so no usage error
    expect(r.stderr).toContain('shards gates force-close');
  });

  it('shards-gates rejects an unknown option like v2 (exit 2)', () => {
    expect(bin('shards-gates', ['status', '--bogus']).status).toBe(2);
  });

  it('shards-sessions warns and forwards list/show to `shards sessions`', () => {
    const dir = tmp('legacy-sess-');
    const r = bin('shards-sessions', ['list'], dir);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('shards sessions list');
    expect(r.stdout).toContain('no sessions recorded');
    expect(bin('shards-sessions', [], dir).stdout).toContain('no sessions recorded');
    expect(bin('shards-sessions', ['show', 'nope'], dir).status).toBe(1);
  });

  it('shards-sessions rejects v1-only flags via v2 (exit 2)', () => {
    expect(bin('shards-sessions', ['list', '--agent', 'x']).status).toBe(2);
  });

  it('shards-ui prints the Studio replacement: status/stop/help exit 0, start exits 1', () => {
    for (const a of ['status', 'stop', 'help', '--help']) {
      const r = bin('shards-ui', [a]);
      expect(r.status, a).toBe(0);
      expect(r.stdout).toContain('deprecated');
      expect(r.stdout).toContain('@proflandrigan/shards-studio');
    }
    expect(bin('shards-ui').status).toBe(1);
    expect(bin('shards-ui', ['start']).status).toBe(1);
  });

  it('tools/install.js refuses install (exit 1, v2 replacement, writes nothing) but uninstall still runs', () => {
    const dir = tmp('legacy-inst-');
    const r = bin('install', [], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('shards build --target claude --dev');
    expect(r.stderr).toContain('shards install --project');
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(bin('install', ['uninstall'], dir).status).toBe(0);
  });
});
