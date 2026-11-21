import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CORE = path.join(process.cwd(), 'core');
const read = (rel) => fs.readFileSync(path.join(CORE, rel), 'utf8');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const MACRO = '{{protocol experiment_framework}}';

describe('experiment framework protocol (multi-approach planning)', () => {
  it('protocol exists with frontmatter and all sections', () => {
    const c = read('protocols/experiment_framework.md');
    expect(c.startsWith('---\nname: experiment-framework')).toBe(true);
    for (const s of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(c).toContain(`## Section ${s}`);
    }
  });

  it('planning phases propose an experiment plan with the opt-out', () => {
    for (const rel of [
      'agents/data-scientist/phases/phase-4.md',
      'agents/ml-engineer/phases/phase-4.md',
      'agents/ai-engineer/phases/phase-3.md',
    ]) {
      const c = read(rel);
      expect(c, rel).toContain(MACRO);
      expect(c, rel).toContain('- **Experiment plan:**');
      expect(c, rel).toContain('Mode: Harness | Single approach');
      expect(c, rel).toMatch(/opt-out/i);
    }
  });

  it('AI Engineer Phase 4 evaluates every approach the same way', () => {
    const c = read('agents/ai-engineer/phases/phase-4.md');
    expect(c).toContain('One evaluation for every approach');
    expect(c).toContain('**Experiment comparison:**');
  });

  it('build phases specify the harness', () => {
    for (const rel of [
      'agents/data-scientist/phases/phase-6.md',
      'agents/ml-engineer/phases/phase-6.md',
      'agents/ai-engineer/phases/phase-6.md',
    ]) {
      const c = read(rel);
      expect(c, rel).toContain(MACRO);
      expect(c, rel).toContain('Experiment harness');
      expect(c, rel).toContain('leaderboard');
      expect(c, rel).toContain('experiments.yaml');
    }
  });

  it('ML Engineer winner selection reads the leaderboard', () => {
    const c = read('agents/ml-engineer/phases/phase-6-5.md');
    expect(c).toContain('experiments/leaderboard.csv');
    expect(c).toContain('[N] New approach');
  });

  it('experiment modes point at an existing harness', () => {
    for (const agent of ['data-scientist', 'ml-engineer', 'ai-engineer']) {
      expect(read(`agents/${agent}/modes/experiment.md`), agent).toContain(MACRO);
    }
  });

  it('AR modes point at an existing harness', () => {
    for (const agent of ['data-scientist', 'ml-engineer', 'ai-engineer']) {
      const c = read(`agents/${agent}/modes/research.md`);
      expect(c, agent).toContain(MACRO);
      expect(c, agent).toContain('leaderboard.csv');
    }
  });

  it('harness core owns both package __init__ files and the yaml declares constraints', () => {
    const c = read('protocols/experiment_framework.md');
    expect(c).toMatch(/\| Harness core \|[^\n]*approaches\/__init__\.py/);
    expect(c).toContain('constraints:');
    for (const rel of [
      'agents/data-scientist/phases/phase-6.md',
      'agents/ml-engineer/phases/phase-6.md',
      'agents/ai-engineer/phases/phase-6.md',
    ]) {
      expect(read(rel), rel).toContain('`approaches/__init__.py`');
    }
  });

  it('the protocol macro is never followed by a section reference', () => {
    const bad = [];
    const re = /\{\{protocol experiment_framework\}\}\s*(Section|Sections)\b/;
    for (const file of walk(CORE)) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (re.test(line)) bad.push(`${path.relative(CORE, file)}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });
});
