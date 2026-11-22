import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Content checks the build does not cover: the build validates macros and markdown links,
// but not plain-text file references or user-facing command names in prose.
const CORE = path.join(process.cwd(), 'core');
const AGENTS = fs.readdirSync(path.join(CORE, 'agents'));

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}
// INVENTORY.md records v1 -> v2 renames, so it names v1 files on purpose.
const FILES = walk(CORE).filter((f) => f.endsWith('.md') && path.basename(f) !== 'INVENTORY.md');

function eachLine(fn) {
  for (const f of FILES) {
    const rel = path.relative(CORE, f);
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => fn(f, `${rel}:${i + 1}`, line));
  }
}

describe('core references', () => {
  it('plain-text references to modes/protocols/templates/phase files resolve', () => {
    const re = /(?:\.\.\/)*(?:core\/)?(?:agents\/[a-z-]+\/)?(?:modes|protocols|templates|phases(?:_quick|_deep)?)\/[A-Za-z0-9_.-]+\.(?:md|json)|\bphase-\d+(?:-\d+)*\.md/g;
    const bad = [];
    eachLine((f, where, line) => {
      const parts = path.relative(CORE, f).split(path.sep);
      const own = parts[0] === 'agents' ? [path.join(CORE, 'agents', parts[1])] : AGENTS.map((a) => path.join(CORE, 'agents', a));
      for (const [ref] of line.matchAll(re)) {
        const r = ref.replace(/^core\//, '');
        const cands = [path.resolve(path.dirname(f), r), path.join(CORE, r)];
        for (const a of own) {
          cands.push(path.join(a, r));
          if (!r.includes('/')) cands.push(path.join(path.dirname(f), r));
        }
        if (!cands.some((c) => fs.existsSync(c))) bad.push(`${where}: ${ref}`);
      }
    });
    expect(bad).toEqual([]);
  });

  it('user-facing commands use v2 skill names, not v1 slash commands', () => {
    const names = [...AGENTS, 'shards', 'notebook-walkthrough', 'review-pr', 'brainstorm'];
    const re = new RegExp('`/(' + names.join('|') + ')`');
    const bad = [];
    eachLine((f, where, line) => { if (re.test(line)) bad.push(`${where}: ${line.trim()}`); });
    expect(bad).toEqual([]);
  });

  // Gate commits and tasks_set resolve paths from agent.yaml output_dir, so the build's
  // tasks.yaml must live under it or the agent's artifacts are never committed.
  it('{{delegate tasks=...}} paths sit under the agent.yaml output_dir', async () => {
    const YAML = (await import('yaml')).default;
    const bad = [];
    for (const a of AGENTS) {
      const od = YAML.parse(fs.readFileSync(path.join(CORE, 'agents', a, 'agent.yaml'), 'utf8')).output_dir;
      const top = od ? od.split('/')[0] : null;
      for (const f of walk(path.join(CORE, 'agents', a)).filter((x) => x.endsWith('.md'))) {
        for (const [, p] of fs.readFileSync(f, 'utf8').matchAll(/\{\{delegate tasks=([^\s}]+)/g)) {
          if (!top || p.split('/')[0] !== top) bad.push(`${a}: output_dir ${od} vs ${path.relative(CORE, f)} tasks=${p}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  // Syn creates the specialist's project directory before switching; it must be the
  // specialist's own output_dir or the record lands outside what gates commit.
  it("Syn's project directories match the specialists' shards/ output_dir", async () => {
    const YAML = (await import('yaml')).default;
    const bad = [];
    for (const a of AGENTS) {
      const d = YAML.parse(fs.readFileSync(path.join(CORE, 'agents', a, 'agent.yaml'), 'utf8'));
      if (d.role === 'specialist' && !String(d.output_dir || '').startsWith('shards/{project}/')) bad.push(`${a}: output_dir ${d.output_dir}`);
    }
    expect(fs.readFileSync(path.join(CORE, 'agents/syn/AGENT.md'), 'utf8')).toContain('shards/<project_name>/');
    let seen = 0;
    for (const [, top] of fs.readFileSync(path.join(CORE, 'agents/syn/modes/pm.md'), 'utf8').matchAll(/^ {3}- [A-Z][A-Za-z ]+?: `([a-z_]+)\/<workstream_name>\//gm)) {
      seen++;
      if (top !== 'shards') bad.push(`pm.md: ${top}/`);
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('no references to the removed v1 docs/shards-guide install location', () => {
    const bad = [];
    eachLine((f, where, line) => { if (line.includes('docs/shards-guide')) bad.push(where); });
    expect(bad).toEqual([]);
  });
});
