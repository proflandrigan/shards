import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { computeReport } = require('../scripts/coupling-report.js');
const { convertText } = require('../scripts/codemods/e1-9-via-task-prose.js');
const { walk } = require('../scripts/codemods/lib-task-blocks.js');
const fs = require('node:fs');

describe('via Task prose', () => {
  it('core has zero via_task_prose matches', () => {
    expect(computeReport({ root: process.cwd(), roots: ['core'] }).via_task_prose.count).toBe(0);
  });
  it('codemod is idempotent on core', () => {
    for (const f of walk('core')) {
      const t = fs.readFileSync(f, 'utf8');
      expect(convertText(t), f).toBe(t);
    }
  });
  it('codemod rewrites common phrases', () => {
    expect(convertText('invoked by Syn via the Task tool, x')).toBe('consulted by Syn, x');
    expect(convertText('(invoked via Task by another agent)')).toBe('(consulted by another agent)');
    expect(convertText('Call it via Task:')).toBe('Call it:');
  });
});
