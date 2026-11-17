import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const YAML = require('yaml');
const { compile } = require('../build/compile');
const { checkSkillRefs } = require('../build/activation-check');
const { utilitySkills, referencedContent, DEFERRED_SKILLS } = require('../build/skills');

const REPO = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-util-'));
const D = { claude: path.join(root, 'claude'), codex: path.join(root, 'codex'), rel: path.join(root, 'rel'), da: path.join(root, 'da') };
const read = (d, rel) => fs.readFileSync(path.join(d, rel), 'utf8');
const ls = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);
const front = (t) => YAML.parse(t.split('---')[1]);
const agents = ls(path.join(REPO, 'core/agents')).map((id) => ({ id, y: YAML.parse(read(REPO, `core/agents/${id}/agent.yaml`)) }));

const UTILITY = ['agents', 'brainstorm', 'end', 'notebook-walkthrough', 'resume', 'review-pr'];

beforeAll(() => {
  const opts = { bundleDeps: false };
  expect(compile({ ...opts, target: 'claude', outDir: D.claude }).errors).toEqual([]);
  expect(compile({ ...opts, target: 'codex', outDir: D.codex }).errors).toEqual([]);
  expect(compile({ ...opts, target: 'claude', outDir: D.rel }).errors).toEqual([]);
  expect(compile({ ...opts, target: 'claude', outDir: D.da, defaultAgent: true }).errors).toEqual([]);
}, 120000);
afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('E7.2 utility skills', () => {
  it('claude emits the utility skills plus shards-conventions; codex emits the same without conventions', () => {
    const sw = agents.filter((a) => a.y.activation.includes('switch')).map((a) => a.id);
    expect(ls(path.join(D.claude, 'skills'))).toEqual([...sw, ...UTILITY, 'shards-conventions'].sort());
    expect(ls(path.join(D.codex, 'skills'))).toEqual([...sw, ...UTILITY].sort());
    expect(read(D.claude, 'skills/shards-conventions/SKILL.md')).toBe(require('../build/conventions').conventionsSkill());
  });
  it('every utility skill has name+description frontmatter matching its directory', () => {
    for (const d of [D.claude, D.codex]) {
      for (const n of UTILITY) {
        const f = front(read(d, `skills/${n}/SKILL.md`));
        expect(f.name).toBe(n);
        expect(String(f.description).length).toBeGreaterThan(10);
      }
    }
  });
  it('mode skills read the mode file via the content path and use the host tool prefix', () => {
    const c = (n) => read(D.claude, `skills/${n}/SKILL.md`);
    expect(c('brainstorm')).toContain('mcp__plugin_shards_shards__activate`(agent="syn", mode="switch")');
    expect(c('brainstorm')).toContain('${CLAUDE_PLUGIN_ROOT}/content/agents/syn/modes/brainstorm.md');
    expect(c('review-pr')).toContain('${CLAUDE_PLUGIN_ROOT}/content/agents/syn/modes/pr_review.md');
    for (const a of ['data-scientist', 'ml-engineer', 'syn']) expect(c('notebook-walkthrough')).toContain(`\${CLAUDE_PLUGIN_ROOT}/content/agents/${a}/modes/notebook_walkthrough.md`);
    expect(c('resume')).toContain('mcp__plugin_shards_shards__sessions_list');
    expect(c('resume')).toContain('mcp__plugin_shards_shards__sessions_resume');
    const x = read(D.codex, 'skills/brainstorm/SKILL.md');
    expect(x).toContain('shards.activate`(agent="syn", mode="switch")');
    expect(x).toContain('content/agents/syn/modes/brainstorm.md');
    expect(x).not.toContain('CLAUDE_PLUGIN_ROOT');
  });
  it('end skill calls sessions_end and forbids gate_force_close / gate_advance', () => {
    const t = read(D.claude, 'skills/end/SKILL.md');
    expect(t).toContain('mcp__plugin_shards_shards__sessions_end');
    expect(t).toMatch(/NEVER call `mcp__plugin_shards_shards__gate_force_close` or `mcp__plugin_shards_shards__gate_advance`/);
  });
  it('is thin: no persona dumps', () => {
    for (const n of UTILITY) expect(read(D.claude, `skills/${n}/SKILL.md`).length).toBeLessThan(3500);
  });
  it('is deterministic', () => {
    expect([...utilitySkills('claude')]).toEqual([...utilitySkills('claude')]);
  });
  it('every content path a utility skill references exists in the emitted files', () => {
    for (const d of [D.claude, D.codex]) {
      for (const p of referencedContent()) expect(fs.existsSync(path.join(d, p)), p).toBe(true);
    }
    const core = { agents: new Map([['syn', {}]]) };
    expect(checkSkillRefs(core, ['content/agents/syn/modes/brainstorm.md'], 'claude').length).toBeGreaterThan(0);
    expect(checkSkillRefs(core, referencedContent(), 'claude')).toEqual([]);
    expect(checkSkillRefs({ agents: new Map() }, [], 'claude')).toEqual([]);
  });
  // DEFERRED(Stage 6): flip this deliberately when connect/sync/doctor/publish-knowledge skills ship.
  it('Stage 6 skills are not emitted yet', () => {
    expect(DEFERRED_SKILLS).toEqual(['connect', 'doctor', 'publish-knowledge', 'sync']);
    for (const d of [D.claude, D.codex]) for (const n of DEFERRED_SKILLS) expect(fs.existsSync(path.join(d, 'skills', n)), n).toBe(false);
  });
});

describe('E7.3 release consult subagents', () => {
  it('release build has a valid subagent file for every consultable agent and entry', () => {
    const want = [];
    for (const a of agents.filter((x) => x.y.activation.includes('consult'))) {
      want.push(a.id, ...Object.keys(a.y.consult_entries || {}).map((e) => `${a.id}-${e}`));
    }
    expect(want.length).toBeGreaterThan(0);
    expect(ls(path.join(D.rel, 'agents')).map((f) => f.replace(/\.md$/, '')).sort()).toEqual([...new Set(want)].sort());
    for (const n of want) {
      const t = read(D.rel, `agents/${n}.md`);
      const f = front(t);
      expect(f.name).toBe(n);
      expect(String(f.description).length).toBeGreaterThan(0);
      expect('model' in f).toBe(false);
      expect(String(f.tools || '').split(',').map((s) => s.trim())).not.toContain('Task');
      expect(String(f.tools || '').split(',').map((s) => s.trim())).not.toContain('Agent');
    }
  });
});

describe('E7.7 optional default agent (release)', () => {
  it('release without --default-agent has no settings.json', () => {
    expect(fs.existsSync(path.join(D.rel, 'settings.json'))).toBe(false);
    expect(fs.existsSync(path.join(D.rel, '.claude-plugin/plugin.json'))).toBe(true);
  });
  it('release with defaultAgent emits settings.json, omits syn tools, adds main-thread instruction', () => {
    expect(JSON.parse(read(D.da, 'settings.json'))).toEqual({ agent: 'shards:syn' });
    const syn = read(D.da, 'agents/syn.md');
    expect(front(syn).tools).toBeUndefined();
    expect(syn).toContain('Main-thread use: call `mcp__plugin_shards_shards__activate`(agent="syn", mode="switch")');
    expect(front(read(D.da, 'agents/syn-final_review.md')).tools).toBeTruthy();
    expect(front(read(D.rel, 'agents/syn.md')).tools).toBeTruthy();
    expect(read(D.rel, 'agents/syn.md')).not.toContain('Main-thread use');
  });
});
