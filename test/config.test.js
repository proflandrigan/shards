import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadOrCreateConfig, validateConfig, DEFAULT_CONFIG, resolveJob, ConfigError } =
  require('../runtime/config/index.js');

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-cfg-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('loadOrCreateConfig', () => {
  it('creates a commented git-only config on first use', () => {
    const r = loadOrCreateConfig(dir);
    expect(r.created).toBe(true);
    expect(r.path).toBe(path.join(dir, 'shards.config.yaml'));
    const text = fs.readFileSync(r.path, 'utf8');
    expect(text).toContain('#');
    expect(r.config.gates.policy).toBe('phase');
    expect(r.config.git).toMatchObject({ commit: true, push: false });
    for (const j of ['record', 'tasks', 'knowledge', 'review', 'artifacts', 'presentation']) {
      expect(r.config.jobs[j].binding).toBe('git');
    }
    expect(loadOrCreateConfig(dir).created).toBe(false);
  });

  it('never overwrites an existing file and preserves comments', () => {
    const p = path.join(dir, 'shards.config.yaml');
    const user = '# my comment\ngates:\n  policy: strict # why\njobs:\n  tasks: jira\n';
    fs.writeFileSync(p, user);
    const r = loadOrCreateConfig(dir);
    expect(r.created).toBe(false);
    expect(fs.readFileSync(p, 'utf8')).toBe(user);
    expect(r.config.gates.policy).toBe('strict');
    expect(r.config.jobs.tasks).toEqual({ binding: 'jira', options: {} });
    expect(r.config.jobs.record.binding).toBe('git'); // defaults merged in
    expect(r.config.git.push).toBe(false);
  });

  it('accepts an empty file', () => {
    fs.writeFileSync(path.join(dir, 'shards.config.yaml'), '');
    expect(loadOrCreateConfig(dir).config.gates.policy).toBe('phase');
  });

  it('throws a readable ConfigError for an invalid policy', () => {
    fs.writeFileSync(path.join(dir, 'shards.config.yaml'), 'gates:\n  policy: yolo\n');
    expect(() => loadOrCreateConfig(dir)).toThrow(ConfigError);
    try { loadOrCreateConfig(dir); } catch (e) {
      expect(e.message).toContain('gates.policy');
      expect(e.message).toContain('strict | phase | plan');
    }
  });

  it('throws ConfigError on malformed YAML', () => {
    fs.writeFileSync(path.join(dir, 'shards.config.yaml'), 'gates: [unclosed\n');
    expect(() => loadOrCreateConfig(dir)).toThrow(/not valid YAML/);
  });

  it('replaces arrays instead of concatenating on merge', () => {
    fs.writeFileSync(path.join(dir, 'shards.config.yaml'), 'git:\n  denylist:\n    globs: ["*.x"]\n');
    const { config } = loadOrCreateConfig(dir);
    expect(config.git.denylist.globs).toEqual(['*.x']);
    expect(config.git.denylist.max_file_size_bytes).toBe(DEFAULT_CONFIG.git.denylist.max_file_size_bytes);
  });
});

describe('validateConfig', () => {
  it('accepts the defaults and an empty object', () => {
    expect(validateConfig(DEFAULT_CONFIG).ok).toBe(true);
    expect(validateConfig({}).ok).toBe(true);
  });
  it('rejects invalid policy and unknown keys/jobs', () => {
    const a = validateConfig({ gates: { policy: 'nope' } });
    expect(a.ok).toBe(false);
    expect(a.errors.join()).toContain('gates.policy');
    expect(validateConfig({ jobs: { bogus: 'git' } }).ok).toBe(false);
    expect(validateConfig({ extra: 1 }).ok).toBe(false);
  });
  it('rejects a literal model id outside tiers', () => {
    const r = validateConfig({ bindings: { x: { model: 'claude-opus-4' } } });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/tiers/);
    expect(validateConfig({ jobs: { record: { binding: 'git', options: { m: 'gpt-4o' } } } }).ok).toBe(false);
  });
  it('allows a model string under tiers only', () => {
    expect(validateConfig({ tiers: { small: 'claude-haiku-x', large: 'my-model' } }).ok).toBe(true);
    expect(validateConfig({ tiers: { medium: 'm' } }).ok).toBe(false);
  });
});

describe('resolveJob', () => {
  it('returns git defaults for an empty config', () => {
    expect(resolveJob({}, 'record')).toEqual({ binding: 'git', options: { path: '{output_dir}/project-specs.md' } });
    expect(resolveJob({}, 'tasks').options.path).toBe('TASKS.md');
    expect(resolveJob({}, 'knowledge').options).toEqual({ paths: ['docs/'], git_log: true });
    expect(resolveJob({}, 'artifacts').options.path).toBe('{output_dir}');
    expect(resolveJob({}, 'review').binding).toBe('git');
    expect(resolveJob({}, 'presentation').binding).toBe('git');
  });
  it('handles string and object forms, dropping git options for other bindings', () => {
    expect(resolveJob({ jobs: { record: 'confluence' } }, 'record')).toEqual({ binding: 'confluence', options: {} });
    const r = resolveJob({ jobs: { tasks: { binding: 'git', options: { path: 'T.md' } } } }, 'tasks');
    expect(r).toEqual({ binding: 'git', options: { path: 'T.md' } });
  });
  it('rejects unknown jobs and does not mutate defaults', () => {
    expect(() => resolveJob({}, 'nope')).toThrow(ConfigError);
    resolveJob({}, 'knowledge').options.paths.push('x');
    expect(DEFAULT_CONFIG.jobs.knowledge.options.paths).toEqual(['docs/']);
  });
});
