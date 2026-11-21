import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { describe, it, expect } from 'vitest';
const { makeCore } = require('./build-fixture.js');
const { lintNesting } = require('../build/lint-nesting.js');

const NESTED = {
  'agents/alpha/modes/review.md': '# Review\n\nText\n{{consult beta entry=service}}\n',
  'agents/beta/modes/service.md': '# Service\n\n{{consult alpha entry=review}}\n',
  'agents/alpha/phases/phase-1.md': '# Phase 1\n\n{{consult beta entry=service}}\n',
};

describe('lint-nesting', () => {
  it('passes on the real core/', () => {
    expect(lintNesting(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'core'))).toEqual([]);
  });

  it('passes on a clean fixture', () => {
    expect(lintNesting(makeCore({ 'agents/alpha/phases/phase-1.md': '{{consult beta entry=service}}\n' }))).toEqual([]);
  });

  it('flags a nested consult with file:line', () => {
    const root = makeCore(NESTED);
    const errs = lintNesting(root);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => e.replace(/\\/g, '/').includes('agents/beta/modes/service.md:3: nested {{consult}}'))).toBe(true);
  });

  it('flags nesting via a protocol the entry pulls in', () => {
    const root = makeCore({
      'agents/beta/modes/service.md': '# Service\n{{protocol p}}\n',
      'protocols/p.md': 'x\n{{switch alpha}}\n',
      'agents/alpha/phases/phase-1.md': '{{consult beta entry=service}}\n',
    });
    expect(lintNesting(root).some((e) => e.replace(/\\/g, '/').includes('protocols/p.md:2: nested {{switch}}'))).toBe(true);
  });

  it('ignores escaped macros', () => {
    const root = makeCore({
      'agents/beta/modes/service.md': '# Service\n\\{{consult alpha entry=review}}\n',
      'agents/alpha/phases/phase-1.md': '{{consult beta entry=service}}\n',
    });
    expect(lintNesting(root)).toEqual([]);
  });

  it('allowDepth permits nesting for codex only', () => {
    const root = makeCore(NESTED);
    expect(lintNesting(root, { allowDepth: { codex: true }, target: 'codex' })).toEqual([]);
    expect(lintNesting(root, { allowDepth: { codex: true }, target: 'claude' }).length).toBeGreaterThan(0);
    expect(lintNesting(root, { target: 'codex' }).length).toBeGreaterThan(0);
  });
});
