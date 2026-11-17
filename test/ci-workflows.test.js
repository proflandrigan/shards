import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const require = createRequire(import.meta.url);
const YAML = require('yaml');
const nightly = require('../scripts/nightly-golden.js');
const ROOT = path.resolve(__dirname, '..');
const WF = path.join(ROOT, '.github', 'workflows');
const load = (f) => YAML.parse(fs.readFileSync(path.join(WF, f), 'utf8'));
const stepsText = (job) => job.steps.map((s) => `${s.run || ''}\n${s.uses || ''}`).join('\n');

describe('GitHub workflows (E9.4)', () => {
  it('every workflow file parses and has jobs with runs-on and steps', () => {
    const files = fs.readdirSync(WF).filter((f) => /\.ya?ml$/.test(f));
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'nightly.yml']));
    for (const f of files) {
      const w = load(f);
      expect(w.name, f).toBeTruthy();
      expect(Object.keys(w.jobs).length, f).toBeGreaterThan(0);
      for (const [n, j] of Object.entries(w.jobs)) {
        expect(j['runs-on'], `${f}:${n}`).toBeTruthy();
        expect(Array.isArray(j.steps), `${f}:${n}`).toBe(true);
      }
    }
  });

  it('ci.yml runs the full gate on ubuntu, macos and windows for pull requests', () => {
    const w = load('ci.yml');
    expect(w.on).toHaveProperty('pull_request');
    const job = w.jobs.test;
    expect(job.strategy.matrix.os).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest']);
    const t = stepsText(job);
    for (const cmd of ['npm test', 'npm run build:all', 'npm run lint:models', 'npm run lint:verdicts', 'npm run validate:agents', 'npm run coupling:ratchet']) expect(t).toContain(cmd);
    // every npm script it calls exists
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const m of t.matchAll(/npm run ([\w:-]+)/g)) expect(pkg.scripts[m[1]], m[1]).toBeTruthy();
  });

  it('nightly.yml is scheduled, uses secrets, gates codex, and uploads scores', () => {
    const w = load('nightly.yml');
    expect(w.on.schedule[0].cron).toMatch(/^\S+ \S+ \* \* \*$/);
    expect(w.on).toHaveProperty('workflow_dispatch');
    const c = w.jobs['golden-claude'];
    expect(c.strategy.matrix.os).toEqual(['ubuntu-latest', 'macos-latest', 'windows-latest']);
    expect(c.env.ANTHROPIC_API_KEY).toContain('secrets.ANTHROPIC_API_KEY');
    expect(stepsText(c)).toContain('scripts/nightly-golden.js --host claude');
    expect(w.jobs['golden-codex'].if).toContain('SHARDS_NIGHTLY_CODEX');
    expect(stepsText(w.jobs['golden-codex'])).toContain('--host codex');
    for (const j of ['golden-claude', 'golden-codex']) {
      const up = w.jobs[j].steps.find((s) => /upload-artifact/.test(s.uses || ''));
      expect(up.if).toContain('always()');
    }
    expect(stepsText(w.jobs['publish-scores'])).toContain('--summarize');
    // the script path the workflow calls exists
    expect(fs.existsSync(path.join(ROOT, 'scripts', 'nightly-golden.js'))).toBe(true);
  });
});

describe('nightly golden driver (E9.4)', () => {
  it('skips live cleanly without a secret, or without the CLI, and runs with both', () => {
    expect(nightly.liveDecision('claude', {}, true)).toMatchObject({ run: false });
    expect(nightly.liveDecision('claude', {}, true).reason).toMatch(/ANTHROPIC_API_KEY/);
    expect(nightly.liveDecision('claude', { ANTHROPIC_API_KEY: '  ' }, true).run).toBe(false);
    expect(nightly.liveDecision('claude', { ANTHROPIC_API_KEY: 'k' }, false).reason).toMatch(/not found/);
    expect(nightly.liveDecision('claude', { ANTHROPIC_API_KEY: 'k' }, true)).toEqual({ run: true, reason: null });
    expect(nightly.liveDecision('codex', { CODEX_API_KEY: 'k' }, true).run).toBe(true);
    expect(nightly.liveDecision('nope', {}, true).run).toBe(false);
  });

  it('CLI run with no secrets exits 0, writes a score artifact and marks live skipped', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nightly-'));
    try {
      const env = { ...process.env };
      for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY']) delete env[k];
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'nightly-golden.js'), '--host', 'claude', '--out', out, '--no-offline'], { env, encoding: 'utf8' });
      expect(r.status).toBe(0);
      const j = JSON.parse(fs.readFileSync(path.join(out, `claude-${process.platform}.json`), 'utf8'));
      expect(j.live.status).toBe('skipped');
      expect(j.live.reason).toMatch(/ANTHROPIC_API_KEY/);
      expect(nightly.summarize(out)).toContain('| claude |');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
  });

  it('rejects an unknown host with exit 2', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'nightly-golden.js'), '--host', 'x', '--out', os.tmpdir()], { encoding: 'utf8' });
    expect(r.status).toBe(2);
  });
});
