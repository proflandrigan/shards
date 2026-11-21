import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { computeReport } = require('../scripts/coupling-report.js');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const agents = (rel) => `core/agents/${rel}.md`;

const BUILD = [
  'data-analyst/phases/phase-3', 'data-scientist/phases/phase-6', 'ml-engineer/phases/phase-6',
  'ml-engineer/phases/phase-6-5', 'ai-engineer/phases/phase-6', 'analytics-engineer/phases_deep/phase-7',
  'analytics-engineer/phases_quick/phase-2', 'data-engineer/phases_deep/phase-6', 'data-engineer/phases_quick/phase-2',
  'data-modeller/phases_deep/phase-6', 'data-modeller/phases_quick/phase-2', 'bi-engineer/phases/phase-3',
  'applied-ml-scientist/phases/phase-4', 'deep-learning-engineer/phases/phase-4', 'mlops-engineer/phases/phase-6',
];
const PLAN = [
  'data-analyst/phases/phase-2', 'data-scientist/phases/phase-5', 'ml-engineer/phases/phase-5',
  'ai-engineer/phases/phase-5', 'analytics-engineer/phases_deep/phase-6', 'analytics-engineer/phases_quick/phase-1',
  'data-engineer/phases_deep/phase-5', 'data-engineer/phases_quick/phase-1', 'data-modeller/phases_deep/phase-5',
  'data-modeller/phases_quick/phase-1', 'bi-engineer/phases/phase-2', 'applied-ml-scientist/phases/phase-3',
  'deep-learning-engineer/phases/phase-3', 'mlops-engineer/phases/phase-5',
];

describe('build phases are delegated lead loops', () => {
  for (const f of BUILD) {
    it(f, () => {
      const t = read(agents(f));
      expect(t).toContain('{{delegate');
      expect(t).toContain('{{protocol delegated_build}}');
      expect(t).not.toMatch(/\{\{gate kind=(checkpoint|confirm)/);
      expect(t).toMatch(/\{\{gate kind=(phase|final|execute|handoff)/);
    });
  }
});

// AMS/DLE Phase 3 is a plan phase only (S5F): it decomposes tasks but dispatches nothing; scaffolding is a Phase 4 task.
describe('AMS/DLE phase 3 does not dispatch', () => {
  for (const a of ['applied-ml-scientist', 'deep-learning-engineer']) {
    it(a, () => {
      const t = read(agents(`${a}/phases/phase-3`));
      expect(t).not.toContain('{{delegate');
      expect(t).not.toMatch(/phase: 3/);
    });
  }
});

describe('planning phases decompose the plan into tasks', () => {
  for (const f of PLAN) {
    it(f, () => {
      const t = read(agents(f));
      expect(t).toMatch(/^#+ Decompose the plan into tasks/m);
      expect(t).toContain('tasks.yaml');
      expect(t).toMatch(/^#+ Task list/m);
    });
  }
});

describe('protocols', () => {
  it('delegated_build covers the tools and drift', () => {
    const t = read('core/protocols/delegated_build.md');
    for (const k of ['tasks_set', 'task_dispatch', 'task_report', 'plan_drift']) expect(t).toContain(k);
  });
  it('incremental_testing has no checkpoint gate', () => {
    const t = read('core/protocols/incremental_testing.md');
    expect(t).not.toContain('kind=checkpoint');
    expect(t).toContain('{{protocol delegated_build}}');
  });
  it('write_whole_build is 0 in core', () => {
    const r = computeReport({ root, roots: ['core'] });
    expect(r.write_whole_build.file_list).toEqual([]);
    expect(r.write_whole_build.count).toBe(0);
  });
});
