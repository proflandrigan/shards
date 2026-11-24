import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { validateAgents, loadAgents, makeValidator } = require('../scripts/validate-agents.js');

const validate = makeValidator();
const agents = loadAgents();
const byId = (id) => agents.find((a) => a.dir === id);
const clone = (o) => JSON.parse(JSON.stringify(o));

function check(doc, others = agents) {
  const base = others.filter((a) => a.dir !== doc.id);
  return validateAgents([...base, { dir: doc.id, doc }], validate);
}

describe('agent.yaml schema', () => {
  it('loads and validates all 16 agents', () => {
    expect(agents).toHaveLength(16);
    expect(validateAgents(agents, validate)).toEqual([]);
  });

  it('rejects a literal model id in model_tier', () => {
    for (const bad of ['claude-opus-4', 'gpt-5', 'Sonnet', 'haiku']) {
      const doc = clone(byId('data-analyst').doc);
      doc.model_tier = bad;
      expect(check(doc).length).toBeGreaterThan(0);
    }
    const ok = clone(byId('data-analyst').doc);
    ok.model_tier = 'small';
    expect(check(ok)).toEqual([]);
  });

  it('rejects consult activation without consult_entries', () => {
    const doc = clone(byId('data-analyst').doc);
    delete doc.consult_entries;
    expect(check(doc).length).toBeGreaterThan(0);
    doc.consult_entries = {};
    expect(check(doc).length).toBeGreaterThan(0);
  });

  it('rejects an unknown reviewer', () => {
    const doc = clone(byId('data-analyst').doc);
    doc.reviewers = ['nobody-here'];
    expect(check(doc).join('\n')).toMatch(/nobody-here/);
  });

  it('rejects id/dir mismatch and extra properties', () => {
    const doc = clone(byId('data-analyst').doc);
    expect(validateAgents([{ dir: 'other', doc }], validate).join('\n')).toMatch(/does not match/);
    doc.extra = 1;
    expect(check(doc).length).toBeGreaterThan(0);
  });

  it('gives Syn final_review and arbiter entries', () => {
    const syn = byId('syn').doc;
    expect(syn.role).toBe('orchestrator');
    expect(syn.consult_entries).toHaveProperty('final_review');
    expect(syn.consult_entries).toHaveProperty('arbiter');
  });

  it('gives the 11 build specialists and the backend-engineer (Panel Review fix owner) a worker entry', () => {
    const withWorker = agents.filter((a) => a.doc.consult_entries?.worker).map((a) => a.doc.id).sort();
    expect(withWorker).toEqual([
      'ai-engineer', 'analytics-engineer', 'applied-ml-scientist', 'backend-engineer', 'bi-engineer',
      'data-analyst', 'data-engineer', 'data-modeller', 'data-scientist', 'deep-learning-engineer',
      'ml-engineer', 'mlops-engineer',
    ]);
  });
});
