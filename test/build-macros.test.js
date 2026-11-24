import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parseArgs, expandText } = require('../build/macros.js');
const { loadCore } = require('../build/core.js');
const { processFile } = require('../build/compile.js');
const { makeCore } = require('./build-fixture.js');

function run(src, target = 'claude', rel = 'agents/alpha/phases/phase-1.md', opts = {}) {
  const root = makeCore(opts.files || {});
  const core = loadCore(root);
  expect(core.errors).toEqual([]);
  return processFile(core, rel, src, { target, strict: !!opts.strict });
}

describe('parseArgs', () => {
  it('parses positional, named and quoted', () => {
    expect(parseArgs('a b=1 c="x y"')).toEqual({ positional: ['a'], named: { b: '1', c: 'x y' } });
  });
  it('rejects malformed', () => {
    expect(() => parseArgs('a="x')).toThrow(/unterminated/);
    expect(() => parseArgs('=x')).toThrow(/empty key/);
    expect(() => parseArgs('a=1 a=2')).toThrow(/duplicate/);
  });
});

describe('scanner', () => {
  it('does not special-case non-ASCII bodies (they are macro candidates)', () => {
    const seen = [];
    expandText('{{path — note}}', (m) => { seen.push(m.name); return 'X'; });
    expect(seen).toEqual(['path']);
  });
  it('passes UPPER_SNAKE and foreign templating through', () => {
    const r = expandText('{{PROJECT_NAME}} {{ x }} {{specific, actionable}} {{one-line summary}} {{...}}', () => 'X');
    expect(r).toBe('{{PROJECT_NAME}} {{ x }} {{specific, actionable}} {{one-line summary}} {{...}}');
  });
  it('escape yields literal', () => {
    expect(expandText('a \\{{switch foo}} b', () => 'X')).toBe('a {{switch foo}} b');
  });
  it('reports line numbers', () => {
    const lines = [];
    expandText('a\nb {{return}}\n\n{{return}}', (m) => { lines.push(m.line); return ''; });
    expect(lines).toEqual([2, 4]);
  });
});

describe('macro expansion', () => {
  const ok = (src, target, rel, opts) => { const r = run(src, target, rel, opts); expect(r.errors).toEqual([]); return r.text; };

  it('switch', () => {
    expect(ok('{{switch beta}}', 'claude')).toContain('mcp__plugin_shards_shards__activate');
    expect(ok('{{switch beta}}', 'codex')).toContain('mcp__shards__activate');
    expect(ok('{{switch beta}}', 'skills')).toMatch(/`activate`\(agent="beta", mode="switch"\)/);
  });
  it('consult renders per target and resolves the entry file', () => {
    const c = ok('{{consult alpha entry=review task="check it"}}', 'claude');
    expect(c).toContain('subagent by name');
    expect(c).toContain('${CLAUDE_PLUGIN_ROOT}/content/agents/alpha/modes/review.md');
    expect(c).toContain('Task: check it');
    const x = ok('{{consult alpha entry=review}}', 'codex');
    expect(x).toContain('spawn_agent');
    expect(x).toContain('content/agents/alpha/modes/review.md');
    expect(x).not.toContain('CLAUDE_PLUGIN_ROOT');
    expect(ok('{{consult beta entry=service}}', 'skills')).toContain('isolated context');
  });
  it('consult allows the known-missing worker entry', () => {
    expect(ok('{{consult alpha entry=worker}}', 'claude')).toContain('modes/worker.md');
  });
  it('fanout text matches the fanout_start contract', () => {
    for (const t of ['claude', 'codex', 'skills']) {
      const out = ok('{{fanout alpha slices=a,b}}', t);
      expect(out).toContain('slices=[{id, paths, acceptance}');
      expect(out).toContain('contract card');
      expect(out).toContain('fanout_claim');
      expect(out).toContain('fanout_collect');
      expect(out).toContain('pending or suspended');
      expect(out).not.toContain('slices="a,b"');
    }
  });

  it('fanout', () => {
    expect(ok('{{fanout alpha slices=a,b}}', 'claude')).toContain('mcp__plugin_shards_shards__fanout_start');
    expect(ok('{{fanout alpha slices=3}}', 'codex')).toContain('spawn_agent');
    expect(ok('{{fanout alpha slices=3}}', 'skills')).toContain('`fanout_start`');
  });
  it('return', () => {
    expect(ok('{{return}}', 'claude')).toContain('mcp__plugin_shards_shards__return');
    expect(ok('{{return to=beta}}', 'codex')).toContain('mcp__shards__return');
  });
  it('phase incl. 6-5 and tracks', () => {
    expect(ok('{{phase 6-5}}', 'claude')).toContain('load_phase');
    const r = ok('{{phase 2 track=deep agent=beta}}', 'skills');
    expect(r).toContain('load_phase`(agent="beta", n="2", track="deep")');
    expect(r).not.toContain('phase-2.md');
    expect(ok('{{phase 1}}', 'skills', 'agents/beta/phases_quick/phase-1.md')).toContain('track="quick"');
  });
  it('protocol and template', () => {
    expect(ok('{{protocol validation}}', 'claude')).toContain('content/protocols/validation.md');
    expect(ok('{{template project-specs}}', 'codex')).toContain('content/templates/project-specs.md');
    expect(ok('{{template schema.json}}', 'codex')).toContain('templates/schema.json');
  });
  it('gate derives id and renders a tool call on all targets', () => {
    for (const [t, name] of [['claude', 'mcp__plugin_shards_shards__gate_request'], ['codex', 'mcp__shards__gate_request'], ['skills', '`gate_request`']]) {
      const g = ok('{{gate kind=phase validates=beta}}', t);
      expect(g).toContain(name);
      expect(g).toContain('"alpha-phase-1"');
      expect(g).toContain('validates="beta"');
      expect(g).not.toContain('::GATE::');
    }
    expect(ok('{{gate kind=final}}', 'claude', 'agents/beta/phases_deep/phase-2.md')).toContain('"beta-deep-phase-2"');
    const cp = ok('{{gate kind=checkpoint name=after-x}}', 'claude');
    expect(cp).toContain('"alpha-phase-1.after-x"');
    expect(cp).toContain('does not advance');
  });
  it('gate outside a phase file needs phase=', () => {
    expect(ok('{{gate kind=execute phase=4}}', 'claude', 'agents/alpha/modes/review.md')).toContain('"alpha-phase-4"');
    expect(run('{{gate kind=execute}}', 'claude', 'agents/alpha/modes/review.md').errors[0]).toMatch(/requires phase=N/);
  });
  it('auto_verify', () => {
    expect(ok('{{auto_verify start tool_budget=5 ttl=60}}', 'claude')).toContain('mcp__plugin_shards_shards__auto_verify_start');
    expect(ok('{{auto_verify end}}', 'codex')).toContain('mcp__shards__auto_verify_end');
  });
  it('binding macros', () => {
    expect(ok('{{record.write section="Phase 1"}}')).toContain('`record` job');
    expect(ok('{{tasks.create title="T" owns="x/"}}')).toContain('`tasks` job');
    expect(ok('{{tasks.update id=1 status=done}}')).toContain('`done`');
    expect(ok('{{tasks.list}}')).toContain('List tasks');
    expect(ok('{{tasks.get id=1}}')).toContain('Read task');
    expect(ok('{{knowledge.search query="grain"}}')).toContain('`knowledge` job');
  });
  it('artifact.emit', () => {
    expect(ok('{{artifact.emit type=report path=a/b.md}}', 'claude')).toContain('mcp__plugin_shards_shards__artifact_emit');
    expect(ok('{{artifact.emit type=report path=a/b.md}}', 'skills')).toContain('`artifact_emit`');
  });
});

describe('macro errors', () => {
  const errs = (src, rel) => run(src, 'claude', rel).errors;
  it('unknown agent / entry / protocol / template / phase', () => {
    expect(errs('{{switch nope}}')[0]).toMatch(/phase-1\.md:1: unknown agent 'nope'/);
    expect(errs('{{consult alpha entry=advise}}')[0]).toMatch(/unknown entry 'advise'/);
    expect(errs('{{protocol nope}}')[0]).toMatch(/unknown protocol 'nope'/);
    expect(errs('{{template nope}}')[0]).toMatch(/unknown template 'nope'/);
    expect(errs('{{phase 9}}')[0]).toMatch(/unknown phase '9'/);
  });
  it('unknown macro name and malformed args', () => {
    expect(errs('x\n{{bogus a}}')[0]).toMatch(/phase-1\.md:2: unknown macro 'bogus'/);
    expect(errs('{{switch beta x="}}')[0]).toMatch(/unterminated/);
    expect(errs('{{consult alpha}}')[0]).toMatch(/missing required argument 'entry'/);
    expect(errs('{{gate kind=bad}}')[0]).toMatch(/invalid gate kind/);
    expect(errs('{{gate kind=checkpoint}}')[0]).toMatch(/requires name/);
    expect(errs('{{phase 1}}', 'agents/beta/modes/service.md')[0]).toMatch(/requires track/);
  });
  it('duplicate gate id', () => {
    expect(errs('{{gate kind=phase}}\n{{gate kind=phase}}')[0]).toMatch(/duplicate gate id/);
  });
  it('broken link with file:line, ignoring fences and urls', () => {
    const e = errs('ok\n[x](missing.md)\n[u](https://a.b/c)\n```\n[y](nope.md)\n```\n');
    expect(e).toHaveLength(1);
    expect(e[0]).toMatch(/phase-1\.md:2: broken link 'missing.md'/);
    expect(errs('[x](index.md)')).toEqual([]);
  });
});

describe('--strict', () => {
  it('fails on legacy text only when strict', () => {
    const src = 'Task(subagent_type="x")\nsee .claude/agents\n/compact\n::GATE:: a ::ENDGATE::\n';
    expect(run(src).errors).toEqual([]);
    const e = run(src, 'claude', undefined, { strict: true }).errors;
    expect(e.length).toBeGreaterThanOrEqual(4);
    expect(e[0]).toMatch(/phase-1\.md:1: --strict/);
  });
  it('fails on model pins in AGENT.md frontmatter', () => {
    const root = makeCore();
    const core = loadCore(root);
    const fs = require('fs');
    const text = fs.readFileSync(root + '/agents/alpha/AGENT.md', 'utf8');
    const e = processFile(core, 'agents/alpha/AGENT.md', text, { target: 'claude', strict: true }).errors;
    expect(e.join('\n')).toMatch(/AGENT\.md:5: --strict: model pin/);
  });
});
