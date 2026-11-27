import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { loadCore } = require('../build/core.js');
const { processFile, compile } = require('../build/compile.js');
const { claudeToolsOf } = require('../build/host-tools.js');
const { lintNesting } = require('../build/lint-nesting.js');
const { makeCore, tmpDir, write } = require('./build-fixture.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_PREFIX = 'mcp__plugin_shards_shards__';
const CONTRACTS = {
  'protocols/verifier_contract.md': '# Verifier contract\n',
  'protocols/review_execution.md': '# Review execution\n',
  'protocols/review_lead_contract.md': '# Review lead contract\n',
};

// A reviewer-style agent: role reviewer, consult activation, a review entry; capabilities configurable.
function reviewerYaml(id, { activation = 'consult', entry = 'review', role = 'reviewer', caps = 'read, search, shell, delegate' } = {}) {
  return `id: ${id}\ndisplay_name: "${id}"\ndescription: "Agent ${id}."\nrole: ${role}\nactivation: [${activation}]\nconsult_entries:\n  ${entry}: modes/${entry}.md\nreviewers: []\noutput_dir: "${id}/{project}/"\njobs: [record]\ncapabilities: [${caps}]\n`;
}
function reviewerFiles(id, opts) {
  return {
    [`agents/${id}/agent.yaml`]: reviewerYaml(id, opts),
    [`agents/${id}/AGENT.md`]: `---\nname: ${id}\ndescription: x\n---\n# ${id}\n`,
    [`agents/${id}/modes/${opts && opts.entry || 'review'}.md`]: '# Entry\n',
    [`agents/${id}/persona-summary.md`]: `Summary of ${id}.\n`,
  };
}

const run = (src, target = 'claude', opts = {}) => {
  const root = makeCore({ ...CONTRACTS, ...(opts.files || {}) });
  const core = loadCore(root);
  expect(core.errors).toEqual([]);
  return processFile(core, 'agents/alpha/phases/phase-1.md', src, { target, strict: false });
};

describe('{{review_lead}} validation', () => {
  const errs = (src, files) => run(src, 'claude', { files }).errors;
  it('requires a known agent', () => {
    expect(errs('{{review_lead nope}}')[0]).toMatch(/unknown agent 'nope'/);
    expect(errs('{{review_lead}}')[0]).toMatch(/missing required argument 'agent'/);
  });
  it('requires consult activation', () => {
    const f = reviewerFiles('sw', { activation: 'switch' });
    expect(errs('{{review_lead sw}}', f).join('\n')).toMatch(/does not support consult activation/);
  });
  it('requires a review or service entry', () => {
    const f = reviewerFiles('adv', { entry: 'advise' });
    expect(errs('{{review_lead adv}}', f).join('\n')).toMatch(/neither a review nor a service consult entry/);
  });
  it('accepts an agent with a review entry (alpha) and a service-only reviewer', () => {
    expect(errs('{{review_lead alpha}}')).toEqual([]);
    expect(errs('{{review_lead svc}}', reviewerFiles('svc', { entry: 'service' }))).toEqual([]);
  });
  it('rejects unknown arguments', () => {
    expect(errs('{{review_lead alpha foo=1}}')[0]).toMatch(/unknown argument 'foo'/);
  });
});

describe('{{review_lead}} rendering', () => {
  for (const [target, how, extra] of [
    ['claude', 'run the `alpha` subagent by name', 'single message'],
    ['codex', 'spawn the `alpha` agent with spawn_agent', 'agents.max_depth = 2'],
    ['skills', 'invoke the `alpha` skill', 'reviews inline'],
  ]) {
    it(`renders on ${target}`, () => {
      const r = run('{{review_lead alpha task="Review the churn model"}}', target);
      expect(r.errors).toEqual([]);
      const pre = target === 'claude' ? '${CLAUDE_PLUGIN_ROOT}/content' : 'content';
      expect(r.text).toContain(`Entry review_lead: read ${pre}/protocols/review_lead_contract.md first, then ${pre}/agents/alpha/modes/review.md`);
      expect(r.text).toContain('Task: Review the churn model.');
      expect(r.text).toContain('**Code execution:**');
      expect(r.text).toContain(how);
      expect(r.text).toContain(extra);
    });
  }
  it('uses the review entry, else service', () => {
    const r = run('{{review_lead svc}}', 'claude', { files: reviewerFiles('svc', { entry: 'service' }) });
    expect(r.text).toContain('/agents/svc/modes/service.md');
  });
});

describe('{{verify}}', () => {
  it('takes no arguments', () => {
    expect(run('{{verify now}}').errors[0]).toMatch(/unexpected positional argument 'now'/);
  });
  it('renders fanout_start with purpose=review, run_id, slices and the verifier subagent on claude', () => {
    const r = run('{{verify}}', 'claude');
    expect(r.errors).toEqual([]);
    expect(r.text).toContain(`\`${CLAUDE_PREFIX}fanout_start\`(agent=<your agent id>, purpose="review"`);
    expect(r.text).toContain('run_id=<run id>');
    expect(r.text).toContain('slices=[{id, paths, acceptance}, ...]');
    expect(r.text).toContain('`<your agent id>-verify` subagent');
    expect(r.text).toContain(`\`${CLAUDE_PREFIX}fanout_collect\``);
    expect(r.text).not.toContain('review_snapshot');
    expect(r.text).toContain('Entry verify: read ${CLAUDE_PLUGIN_ROOT}/content/protocols/verifier_contract.md');
  });
  it('renders codex with the codex prefix and the depth note', () => {
    const r = run('{{verify}}', 'codex');
    expect(r.text).toContain('mcp__shards__fanout_start');
    expect(r.text).toContain('agents.max_depth = 2');
  });
  it('renders skills with bare names and says verify inline when helpers cannot be isolated', () => {
    const r = run('{{verify}}', 'skills');
    expect(r.text).toContain('`fanout_start`(agent=<your agent id>, purpose="review"');
    expect(r.text).toContain('verify inline');
    expect(r.text).not.toContain('mcp__');
  });
});

describe('host tool mapping for reviewers (spec item 4)', () => {
  const caps = ['read', 'search', 'shell', 'delegate', 'web'];
  it('keeps Task for a reviewer with a review or service entry', () => {
    expect(claudeToolsOf({ role: 'reviewer', capabilities: caps, activation: ['consult'], consult_entries: { service: 'modes/service.md' } }))
      .toContain('Task');
    expect(claudeToolsOf({ role: 'reviewer', capabilities: caps, activation: ['consult'], consult_entries: { review: 'modes/review.md' } }))
      .toContain('Task');
  });
  it('drops Task for a reviewer with no review or service entry, and for the orchestrator', () => {
    expect(claudeToolsOf({ role: 'reviewer', capabilities: caps, activation: ['consult'], consult_entries: { advise: 'modes/advise.md' } }))
      .not.toContain('Task');
    expect(claudeToolsOf({ role: 'orchestrator', capabilities: caps, activation: ['switch', 'consult'], consult_entries: { final_review: 'x.md' } }))
      .not.toContain('Task');
  });
  it('still keeps Task for specialists with workers', () => {
    expect(claudeToolsOf({ role: 'specialist', capabilities: caps, activation: ['consult', 'fanout_worker'], consult_entries: { review: 'x.md' } }))
      .toContain('Task');
  });
});

describe('lint-nesting for review_lead and verify (spec item 5)', () => {
  it('flags {{verify}} reached from a consult entry through a protocol', () => {
    const root = makeCore({
      ...CONTRACTS,
      'agents/beta/modes/service.md': '# Service\n{{protocol p}}\n',
      'protocols/p.md': 'x\n{{verify}}\n',
      'agents/alpha/phases/phase-1.md': '{{consult beta entry=service}}\n',
    });
    expect(lintNesting(root).some((e) => e.replace(/\\/g, '/').includes('protocols/p.md:2: nested {{verify}}'))).toBe(true);
  });
  it('flags {{review_lead}} reached from a fanout worker entry', () => {
    const root = makeCore({
      ...CONTRACTS,
      'agents/alpha/modes/worker.md': '# Worker\n{{review_lead beta}}\n',
      'agents/alpha/phases/phase-1.md': '{{fanout alpha slices=2}}\n',
    });
    expect(lintNesting(root).some((e) => e.includes('nested {{review_lead}}'))).toBe(true);
  });
  it('flags {{verify}} inside verifier_contract.md whatever calls it', () => {
    const root = makeCore({ ...CONTRACTS, 'protocols/verifier_contract.md': '# V\n{{verify}}\n' });
    expect(lintNesting(root).some((e) => e.replace(/\\/g, '/').includes('protocols/verifier_contract.md:2: nested {{verify}}'))).toBe(true);
    expect(lintNesting(root, { allowDepth: { codex: true }, target: 'codex' }).some((e) => e.includes('verifier_contract.md'))).toBe(true);
  });
  it('allows {{verify}} in review_lead_contract.md when nothing consults it', () => {
    const root = makeCore({ ...CONTRACTS, 'protocols/review_lead_contract.md': '# L\n{{verify}}\n' });
    expect(lintNesting(root)).toEqual([]);
  });
  it('still never nests ordinary consults', () => {
    const root = makeCore({ ...CONTRACTS, 'agents/beta/modes/service.md': '{{consult alpha entry=review}}\n', 'agents/alpha/phases/phase-1.md': '{{consult beta entry=service}}\n' });
    expect(lintNesting(root).length).toBeGreaterThan(0);
  });
});

describe('emitted subagents (spec items 2, 3, 10)', () => {
  const out = (files = {}, target = 'claude') => {
    const root = makeCore({ ...CONTRACTS, ...files });
    const o = tmpDir();
    const r = compile({ target, coreDir: root, outDir: o, bundleDeps: false });
    expect(r.errors).toEqual([]);
    return o;
  };
  const head = (o, rel) => fs.readFileSync(path.join(o, rel), 'utf8').split('---')[1];

  it('emits <id>-verify with no Task, the verifier tools and fanout_claim', () => {
    const o = out();
    const h = head(o, 'agents/alpha-verify.md');
    expect(h).toContain('tools: Read, Write, Edit, Glob, Grep, Bash, mcp__plugin_shards_shards__fanout_claim');
    expect(h).not.toContain('Task');
    const body = fs.readFileSync(path.join(o, 'agents/alpha-verify.md'), 'utf8');
    expect(body).toContain('# Verifier contract');
    expect(body).toContain('# Review execution');
    expect(body).toContain('Agent alpha.'); // no persona-summary.md in the fixture: the description stands in
  });
  it('gives the worker entry fanout_claim, and the general subagent of a builder the fanout tools with Task', () => {
    const o = out();
    expect(head(o, 'agents/alpha-worker.md')).toMatch(/^tools: Read, Write, mcp__plugin_shards_shards__fanout_claim$/m);
    const general = head(o, 'agents/alpha.md');
    expect(general).toMatch(/^tools: .*Task, mcp__plugin_shards_shards__fanout_start, mcp__plugin_shards_shards__fanout_collect, /m);
    expect(general).toContain('mcp__plugin_shards_shards__ar_end');
    expect(general).not.toMatch(/fanout_claim/);
  });
  it('does not add a verifier or MCP tools to consult entries that are not worker', () => {
    const o = out({ ...reviewerFiles('rv', { caps: 'read, search, shell, delegate' }) });
    const review = head(o, 'agents/rv-review.md');
    expect(review).not.toContain('mcp__');
    expect(review).not.toContain('Task');
    expect(fs.existsSync(path.join(o, 'agents/rv-verify.md'))).toBe(true);
  });
  it('gives a reviewer with a service entry a general subagent with Task (review lead) and no verifier when it has no review/service', () => {
    const o = out({ ...reviewerFiles('adv', { entry: 'advise' }) });
    expect(fs.existsSync(path.join(o, 'agents/adv-verify.md'))).toBe(false);
  });
  it('emits a codex verifier toml without a tools list', () => {
    const o = out({}, 'codex');
    const t = fs.readFileSync(path.join(o, '.codex/agents/alpha-verify.toml'), 'utf8');
    expect(t).toContain('name = "alpha-verify"');
    expect(t).not.toMatch(/^tools/m);
  });
});

describe('real core (spec item 7)', () => {
  const out = tmpDir();
  const r = compile({ target: 'claude', coreDir: path.join(ROOT, 'core'), outDir: out, bundleDeps: false });
  it('builds without errors (needs the review protocol files in core/protocols)', () => {
    expect(r.errors).toEqual([]);
  });
  it('data-scientist-worker lists fanout_claim', () => {
    const t = fs.readFileSync(path.join(out, 'agents/data-scientist-worker.md'), 'utf8');
    expect(t).toMatch(/^tools: .*mcp__plugin_shards_shards__fanout_claim/m);
  });
  it('researcher-verify exists (researcher has a service entry) and has no Task', () => {
    const f = path.join(out, 'agents/researcher-verify.md');
    expect(fs.existsSync(f)).toBe(true);
    const h = fs.readFileSync(f, 'utf8').split('---')[1];
    expect(h).not.toMatch(/\bTask\b/);
    expect(h).toContain('mcp__plugin_shards_shards__fanout_claim');
  });
  it('researcher (review lead) keeps Task with the fanout tools', () => {
    const h = fs.readFileSync(path.join(out, 'agents/researcher.md'), 'utf8').split('---')[1];
    expect(h).toMatch(/Task/);
    expect(h).toContain('mcp__plugin_shards_shards__fanout_start');
  });
});
