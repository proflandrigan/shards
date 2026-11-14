import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
const require = createRequire(import.meta.url);
const { compile } = require('../build/compile.js');
const { main } = require('../cli/shards.js');
const { makeCore, tmpDir } = require('./build-fixture.js');

const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

describe('compile fixture core', () => {
  it('emits the claude layout without model keys', () => {
    const out = tmpDir();
    const r = compile({ target: 'claude', coreDir: makeCore(), outDir: out });
    expect(r.errors).toEqual([]);
    const agent = read(out, 'agents/alpha.md');
    expect(agent).toMatch(/^---\nname: alpha\ndescription: Agent alpha\.\ntools: Read, Write\n---/);
    expect(agent).not.toMatch(/model/);
    expect(agent).toContain('{{PROJECT_NAME}}');
    expect(read(out, 'skills/alpha/SKILL.md')).toContain('mcp__shards__activate');
    expect(read(out, 'content/agents/alpha/AGENT.md')).not.toContain('opus');
    expect(fs.existsSync(path.join(out, '.claude-plugin'))).toBe(false);
  });
  it('emits codex toml and skills layouts', () => {
    const o1 = tmpDir();
    expect(compile({ target: 'codex', coreDir: makeCore(), outDir: o1 }).errors).toEqual([]);
    const toml = read(o1, '.codex/agents/alpha.toml');
    expect(toml).toMatch(/^name = "alpha"/);
    expect(toml).toContain('developer_instructions = """');
    expect(toml).not.toMatch(/^model/m);
    const o2 = tmpDir();
    expect(compile({ target: 'skills', coreDir: makeCore(), outDir: o2 }).errors).toEqual([]);
    expect(fs.existsSync(path.join(o2, 'skills/beta/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(o2, 'agents'))).toBe(false);
  });
  it('--dev adds plugin manifests', () => {
    const o = tmpDir();
    compile({ target: 'claude', coreDir: makeCore(), outDir: o, dev: true });
    for (const f of ['.claude-plugin/plugin.json', '.mcp.json', 'hooks/hooks.json']) expect(fs.existsSync(path.join(o, f))).toBe(true);
    const c = tmpDir();
    compile({ target: 'codex', coreDir: makeCore(), outDir: c, dev: true });
    expect(read(c, '.codex/config.toml')).toContain('mcp_servers.shards');
  });
  it('is deterministic', () => {
    const core = makeCore({ 'agents/alpha/phases/phase-1.md': '{{gate kind=phase}}\n' });
    const a = tmpDir(); const b = tmpDir();
    compile({ target: 'claude', coreDir: core, outDir: a });
    compile({ target: 'claude', coreDir: core, outDir: b });
    expect(read(a, 'size-report.json')).toBe(read(b, 'size-report.json'));
    expect(read(a, 'content/agents/alpha/phases/phase-1.md')).toBe(read(b, 'content/agents/alpha/phases/phase-1.md'));
  });
  it('size report shape', () => {
    const out = tmpDir();
    const r = compile({ target: 'claude', coreDir: makeCore(), outDir: out });
    const rep = JSON.parse(read(out, 'size-report.json'));
    expect(rep.target).toBe('claude');
    const a = rep.agents.alpha;
    expect(a.persona.tokens).toBe(Math.ceil(a.persona.bytes / 4));
    expect(a.total.bytes).toBeGreaterThan(a.persona.bytes);
    expect(rep.protocols.files).toBe(1);
    expect(rep.templates.files).toBe(2);
    expect(rep.totals.bytes).toBeGreaterThan(0);
    expect(r.table).toMatch(/alpha/);
  });
  it('fails on bad references and writes nothing', () => {
    const out = path.join(tmpDir(), 'o');
    const core = makeCore({
      'agents/alpha/phases/phase-1.md': '{{switch ghost}}\n{{consult alpha entry=advise}}\n',
      'protocols/validation.md': '{{protocol nope}}\n',
    });
    const r = compile({ target: 'claude', coreDir: core, outDir: out });
    expect(r.errors.length).toBe(3);
    expect(r.errors.every((e) => /:\d+: /.test(e))).toBe(true);
    expect(fs.existsSync(out)).toBe(false);
  });
  it('fails when a consult_entries file is missing (non-worker)', () => {
    const core = makeCore({ 'agents/alpha/modes/review.md': null });
    const r = compile({ target: 'claude', coreDir: core, outDir: tmpDir() });
    expect(r.errors.join('\n')).toMatch(/agent\.yaml:1: consult entry 'review' file 'modes\/review.md' does not exist/);
  });
  it('rejects unknown target', () => {
    expect(compile({ target: 'x', outDir: tmpDir() }).errors[0]).toMatch(/unknown target/);
  });
  it('--strict fails on legacy text in source', () => {
    const core = makeCore({ 'agents/alpha/phases/phase-1.md': 'Task(subagent_type="x")\n' });
    expect(compile({ target: 'claude', coreDir: core, outDir: tmpDir() }).errors).toEqual([]);
    const r = compile({ target: 'claude', coreDir: core, outDir: tmpDir(), strict: true });
    expect(r.errors.some((e) => /--strict: legacy subagent_type/.test(e))).toBe(true);
    expect(r.errors.some((e) => /model pin/.test(e))).toBe(true);
  });
});

describe('cli', () => {
  it('unknown subcommand prints usage and fails', () => {
    const r = spawnSync('node', ['cli/shards.js', 'nope'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Commands:\n\s+build/);
    expect(r.stderr).not.toMatch(/doctor/);
  });
  it('build exits 1 with file:line on errors', () => {
    const core = makeCore({ 'agents/alpha/phases/phase-1.md': '{{switch ghost}}\n' });
    const r = spawnSync('node', ['cli/shards.js', 'build', '--target', 'claude', '--core', core, '--out', path.join(tmpDir(), 'o')], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/phase-1\.md:1: unknown agent 'ghost'/);
  });
  it('main is exported', () => expect(typeof main).toBe('function'));
});

describe('real core', () => {
  for (const target of ['claude', 'codex', 'skills']) {
    it(`builds ${target}`, () => {
      const out = tmpDir();
      const r = compile({ target, outDir: out, dev: true });
      expect(r.errors).toEqual([]);
      const rep = JSON.parse(read(out, 'size-report.json'));
      expect(Object.keys(rep.agents)).toHaveLength(15);
      expect(fs.existsSync(path.join(out, 'skills/syn/SKILL.md'))).toBe(true);
    });
  }
});
