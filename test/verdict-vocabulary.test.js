import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { lintText, lintCore } = require('../scripts/lint-verdicts.js');

describe('verdict vocabulary lint', () => {
  it('core/ reviewer return formats use only APPROVED / NEEDS REVISION / BLOCKED', () => {
    expect(lintCore('core')).toEqual([]);
  });

  it.each([
    '- **Verdict:** Sound | Concerns | Revise',
    '- **Verdict:** Sound | Consider Alternatives | Revise',
    '  - Verdict: Approved | Concerns raised',
    'Return verdict: Suitable | Concerns | Redesign.',
    '- Verdict: DEPLOY | OPTIMIZE | REDESIGN',
    '- **Overall:** Clear | Nuanced | Concerns',
    '**{{SOUND | NUANCED | CONCERNS}}** - summary',
    '_SOUND = no action needed | CONCERNS = monitor | REVISE = rework_',
    '- **Verdict:** CONDITIONAL',
    '- **Verdict:** Pass | Fail',
    '- **Status:** Clean | Minor Issues | Refactor Required | Blocked',
    '1. **Verdict:** CONTINUE | REDIRECT | PAUSE | RETRO_REVERT',
  ])('flags retired or foreign vocabulary: %s', (line) => {
    expect(lintText(line, 'x.md').length).toBe(1);
  });

  it.each([
    '- **Verdict:** APPROVED | NEEDS REVISION | BLOCKED',
    '  - Verdict: APPROVED | NEEDS REVISION',
    '**Backend Engineer verdict:** <APPROVED | NEEDS REVISION | BLOCKED | N/A — no Python artifacts>',
    '  - **Verdict:** APPROVED | NEEDS REVISION | BLOCKED | Skipped — <reason>',
    '1. **Verdict:** GOOD / CAUTION / TOO COMPLEX',
    '1. **Verdict:** APPROVED | NEEDS REVISION | BLOCKED',
    '- **Status:** Planning | Executing | Integration Review | Complete',
    'Sound right? Once you confirm I will set up the project.',
    '### Key Concerns',
    '- Clear entity and time grain? (e.g., customer x month)',
    'Redesign the input channel before shipping.',
    '| Clear winner | 2+ candidates evaluated |',
  ])('does not flag unrelated prose or valid lines: %s', (line) => {
    expect(lintText(line, 'x.md')).toEqual([]);
  });

  it('flags a non-canonical bullet inside a verdict definitions block', () => {
    const t = '**Verdict definitions:**\n- **APPROVED** — fine\n- **Sound** — old word\n';
    expect(lintText(t, 'x.md').map((f) => f.line)).toEqual([3]);
  });
});
