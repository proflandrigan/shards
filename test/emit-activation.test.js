import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { compile } = require('../build/compile.js');
const { emitTarget } = require('../build/emit.js');
const { buildHeader, headerInfoFromStore } = require('../runtime/header.js');
const YAML = require('yaml');
const { tmpDir } = require('./build-fixture.js');

const ROOT = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const ls = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);
const agents = ls(path.join(ROOT, 'core/agents')).map((id) => ({ id, y: YAML.parse(read(ROOT, 'core/agents', id, 'agent.yaml')) }));

function build(target, extra = {}) {
  const out = tmpDir();
  const { defaultAgent, ...rest } = extra;
  // compile() does not forward opts.defaultAgent yet (captain wires the CLI flag); the env fallback is equivalent.
  if (defaultAgent) process.env.SHARDS_BUILD_DEFAULT_AGENT = '1';
  try {
    const r = compile({ bundleDeps: false, target, outDir: out, ...rest });
    expect(r.errors).toEqual([]);
  } finally { delete process.env.SHARDS_BUILD_DEFAULT_AGENT; }
  return out;
}

describe('E5.2 thin switch skills', () => {
  const out = build('claude');
  it('exists exactly for switchable agents and holds no persona text', () => {
    const sw = agents.filter((a) => a.y.activation.includes('switch')).map((a) => a.id);
    expect(ls(path.join(out, 'skills')).filter((d) => !['agents', 'brainstorm', 'end', 'notebook-walkthrough', 'resume', 'review-pr', 'shards-conventions'].includes(d))).toEqual(sw);
    for (const id of sw) {
      const skill = read(out, 'skills', id, 'SKILL.md');
      expect(skill).toContain(`mcp__plugin_shards_shards__activate\`(agent="${id}", mode="switch")`);
      expect(skill).toContain(`\${CLAUDE_PLUGIN_ROOT}/content/agents/${id}/AGENT.md`);
      const persona = read(out, 'content/agents', id, 'AGENT.md').split('\n').filter((l) => l.trim().length > 60 && !l.startsWith('#'));
      expect(persona.length).toBeGreaterThan(0);
      expect(skill).not.toContain(persona[0]);
      expect(skill.length).toBeLessThan(1500);
    }
  });
  it('codex skill uses the codex prefix and relative content path', () => {
    const c = build('codex');
    const s = read(c, 'skills/syn/SKILL.md');
    expect(s).toContain('shards.activate`(agent="syn", mode="switch")');
    expect(s).toContain('content/agents/syn/AGENT.md');
    expect(s).not.toContain('CLAUDE_PLUGIN_ROOT');
  });
});

describe('E5.3 native subagents', () => {
  const co = build('claude');
  const cx = build('codex');
  const consulting = agents.filter((a) => a.y.activation.includes('consult'));
  it('emits general + one per consult entry, unique names', () => {
    const expected = [];
    for (const a of consulting) { expected.push(a.id); for (const e of Object.keys(a.y.consult_entries || {})) expected.push(`${a.id}-${e}`); }
    expect(ls(path.join(co, 'agents')).map((f) => f.replace(/\.md$/, '')).sort()).toEqual([...new Set(expected)].sort());
    expect(ls(path.join(cx, '.codex/agents')).map((f) => f.replace(/\.toml$/, '')).sort()).toEqual([...new Set(expected)].sort());
    expect(new Set(expected).size).toBe(expected.length);
    expect(fs.existsSync(path.join(co, 'agents/data-analyst-worker.md'))).toBe(true);
  });
  it('claude frontmatter: no model, no Task/Agent, default read-only tools', () => {
    for (const f of ls(path.join(co, 'agents'))) {
      const t = read(co, 'agents', f);
      const head = t.split('---')[1];
      expect(head).not.toMatch(/^model:/m);
      expect(head).toMatch(new RegExp(`^name: ${f.replace(/\.md$/, '')}$`, 'm'));
      const tools = (head.match(/^tools: (.*)$/m) || [])[1] || '';
      expect(tools.split(', ')).not.toContain('Task');
      expect(tools.split(', ')).not.toContain('Agent');
    }
    for (const f of ls(path.join(cx, '.codex/agents'))) expect(read(cx, '.codex/agents', f).split('developer_instructions')[0]).not.toMatch(/^model\s*=/m);
  });
  it('worker entry carries summary, worker.md and worker contract', () => {
    const t = read(co, 'agents/data-analyst-worker.md');
    expect(t).toContain('re-grounding summary');
    expect(t).toContain(read(co, 'content/agents/data-analyst/modes/worker.md').trim());
    expect(t).toContain(read(co, 'content/protocols/worker_contract.md').trim());
    expect(read(co, 'agents/data-analyst-review.md')).not.toContain(read(co, 'content/protocols/worker_contract.md').trim());
  });
  it('consult text names the entry subagent', () => {
    const all = ls(path.join(co, 'content/agents')).map((d) => fs.readdirSync(path.join(co, 'content/agents', d), { recursive: true }).filter((f) => f.endsWith('.md')).map((f) => read(co, 'content/agents', d, f)).join('\n')).join('\n');
    expect(all).toMatch(/run the `[a-z-]+-[a-z_]+` subagent by name/);
  });
  it('tools default is read-only when meta.tools absent', () => {
    const o = tmpDir();
    const a = { id: 'z', dir: o, doc: { description: 'd', activation: ['consult'], consult_entries: { review: 'modes/review.md' } } };
    emitTarget({ target: 'claude', core: { agents: new Map([['z', a]]) }, rendered: new Map(), agentBodies: new Map(), report: {}, dev: false, outDir: o, defaultAgent: false });
    expect(read(o, 'agents/z.md')).toContain('tools: Read, Glob, Grep, Bash');
  });
});

describe('E8.7 codex switch mechanics (UNVERIFIED)', () => {
  it('profiles exist per switchable agent in codex only', () => {
    const cx = read(build('codex'), '.codex/config.toml');
    for (const a of agents.filter((x) => x.y.activation.includes('switch'))) expect(cx).toContain(`[profiles.shards-${a.id}]`);
    expect(cx).not.toMatch(/^profile = /m);
    expect(fs.existsSync(path.join(build('claude'), '.codex'))).toBe(false);
  });
  it('dev codex config keeps mcp server and profile key stays top-level', () => {
    const cx = read(build('codex', { dev: true, defaultAgent: true }), '.codex/config.toml');
    expect(cx).toContain('[mcp_servers.shards]');
    expect(cx.indexOf('profile = "shards-syn"')).toBeLessThan(cx.search(/^\[/m));
  });
  it('header after activate carries agent=<id>', () => {
    const store = { getVersion: () => 3, read: (k) => (k === 'frames' ? { frames: [{ id: 'f1', agent: 'data-analyst', phase: 1 }] } : { gates: {} }) };
    expect(buildHeader(headerInfoFromStore(store))).toMatch(/agent=data-analyst /);
  });
});

describe('E5.7 optional default agent', () => {
  it('absent by default', () => {
    expect(fs.existsSync(path.join(build('claude'), 'settings.json'))).toBe(false);
    expect(read(build('codex'), '.codex/config.toml')).not.toMatch(/^profile = /m);
  });
  it('present when opted in', () => {
    const c = build('claude', { defaultAgent: true });
    expect(JSON.parse(read(c, 'settings.json'))).toEqual({ agent: 'shards:syn' });
    const syn = read(c, 'agents/syn.md');
    expect(syn.split('---')[1]).not.toMatch(/^tools:/m);
    expect(syn).toContain('mode="switch"');
    expect(read(build('codex', { defaultAgent: true }), '.codex/config.toml')).toMatch(/^profile = "shards-syn"$/m);
  });
  it('env fallback', () => {
    process.env.SHARDS_BUILD_DEFAULT_AGENT = '1';
    try { expect(fs.existsSync(path.join(build('claude'), 'settings.json'))).toBe(true); } finally { delete process.env.SHARDS_BUILD_DEFAULT_AGENT; }
  });
});
