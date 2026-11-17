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
    for (const cmd of ['npm run pack:check', 'npm test', 'npm run build:all', 'npm run lint:models', 'npm run lint:verdicts', 'npm run validate:agents', 'npm run coupling:ratchet']) expect(t).toContain(cmd);
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

describe('release workflow (E10.4)', () => {
  const w = load('release.yml');
  const triggers = w.on || w[true];

  it('triggers on v* tags and manual dispatch only, with read-only default permissions', () => {
    expect(triggers.push.tags).toEqual(['v*']);
    expect(triggers).toHaveProperty('workflow_dispatch');
    expect(Object.keys(triggers).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(w.permissions).toEqual({ contents: 'read' });
  });

  it('verify runs tests, pack check and the dry run; build produces every target and checks both tarballs', () => {
    const v = stepsText(w.jobs.verify);
    for (const c of ['npm test', 'npm run pack:check', 'npm run release:dry-run']) expect(v).toContain(c);
    expect(w.jobs.verify.steps.some((s) => (s.if || '').includes('refs/tags/v') && /GITHUB_REF_NAME/.test(s.run))).toBe(true); // tag must equal package version
    const b = stepsText(w.jobs.build);
    for (const c of ['--target claude --marketplace', '--target codex', '--target skills', 'scripts/stage-runtime-package.js', '--kind cli', '--kind mcp']) expect(b).toContain(c);
    expect(w.jobs.build.needs).toBe('verify');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const t of [...(stepsText(w.jobs.verify) + b).matchAll(/npm run ([\w:-]+)/g)]) expect(pkg.scripts[t[1]], t[1]).toBeTruthy();
    expect(stepsText(w.jobs.build)).toMatch(/upload-artifact/);
  });

  it('only the release and marketplace jobs get write access, and only for tags (or an explicit dispatch input)', () => {
    const writers = Object.entries(w.jobs).filter(([, j]) => j.permissions && j.permissions.contents === 'write').map(([n]) => n).sort();
    expect(writers).toEqual(['github-release', 'marketplace-branch']);
    expect(w.jobs['github-release'].if).toContain("refs/tags/v");
    expect(w.jobs['marketplace-branch'].if).toContain('refs/tags/v');
    expect(w.jobs['marketplace-branch'].if).toContain('inputs.push_marketplace');
    expect(triggers.workflow_dispatch.inputs.push_marketplace.default).toBe(false);
    const push = stepsText(w.jobs['marketplace-branch']);
    expect(push).toContain('marketplace:marketplace');
    expect(push).toContain('.claude-plugin/plugin.json');
  });

  it('npm publish is opt-in: needs the SHARDS_NPM_PUBLISH variable and a tag, uses NPM_TOKEN, and targets the next tag', () => {
    const j = w.jobs['npm-publish'];
    expect(j.if).toContain("vars.SHARDS_NPM_PUBLISH == 'true'");
    expect(j.if).toContain('refs/tags/v');
    expect(JSON.stringify(j)).toContain('secrets.NPM_TOKEN');
    expect(stepsText(j)).toContain('--tag next');
    // no other job can publish
    for (const [n, other] of Object.entries(w.jobs)) if (n !== 'npm-publish') expect(stepsText(other), n).not.toMatch(/npm publish/);
    expect(j.permissions).toBeUndefined();
  });

  it('the marketplace.json source points at the branch the workflow pushes', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
    expect(m.plugins[0].source).toMatchObject({ source: 'github', repo: 'proflandrigan/shards', ref: 'marketplace' });
    expect(stepsText(w.jobs['marketplace-branch'])).toContain(`marketplace:${m.plugins[0].source.ref}`);
  });
});
