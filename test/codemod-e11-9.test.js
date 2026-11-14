import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { run, nameFor } = require('../scripts/codemods/e11-9-gate-fences.js');

const BOILER = 'Read this section back to the user. Stop here — do not begin the next phase or output any further content. Wait for the user to explicitly confirm before proceeding. Do not interpret silence or partial agreement as confirmation.';
let root;

function put(rel, text) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
}
const get = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'e11-9-'));
  for (const a of ['ml-engineer', 'data-modeller', 'syn']) fs.mkdirSync(path.join(root, a), { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('e11-9 gate fence codemod', () => {
  it('omits derived id and inferred phase in phase files (incl. track)', () => {
    put('data-modeller/phases_deep/phase-3.md', `body\n\n::GATE:: id=data-modeller-deep-phase-3 phase=3 kind=phase\n${BOILER}\n::ENDGATE::\n\nafter\n`);
    run(root);
    const t = get('data-modeller/phases_deep/phase-3.md');
    expect(t).toContain('{{gate kind=phase}}');
    expect(t).not.toContain('::GATE::');
    expect(t).not.toContain('Gate readback');
  });

  it('keeps a legacy explicit id and phase in mode files', () => {
    put('syn/modes/pm.md', `x\n::GATE:: id=specific-instructions-syn-pm-phase1 phase=1 kind=phase\nDo not proceed until the user explicitly confirms.\n::ENDGATE::\n`);
    run(root);
    expect(get('syn/modes/pm.md')).toContain('{{gate kind=phase phase=1 id=specific-instructions-syn-pm-phase1}}');
  });

  it('omits id in a non-phase file when it equals the derived id', () => {
    put('syn/AGENT.md', `::GATE:: id=syn-phase-0 phase=0 kind=phase\n${BOILER}\n::ENDGATE::\n`);
    run(root);
    expect(get('syn/AGENT.md').trim()).toBe('{{gate kind=phase phase=0}}');
  });

  it('defaults missing kind to phase and reports it', () => {
    put('ml-engineer/phases/phase-2.md', `::GATE:: id=ml-engineer-phase-2 phase=2\n${BOILER}\n::ENDGATE::\n`);
    const r = run(root);
    expect(get('ml-engineer/phases/phase-2.md')).toContain('{{gate kind=phase}}');
    expect(r.defaulted).toHaveLength(1);
  });

  it('derives checkpoint names, keeps them unique, and drops id', () => {
    put('ml-engineer/phases/phase-6.md', [
      '::GATE:: id=ml-engineer-phase-6-checkpoint-features phase=6 kind=checkpoint', 'Stop here — await explicit confirmation before writing the next component.', '::ENDGATE::',
      '::GATE:: id=ml-engineer-phase-6-checkpoint-features phase=6 kind=checkpoint', 'Wait for explicit confirmation.', '::ENDGATE::', ''].join('\n'));
    run(root);
    const t = get('ml-engineer/phases/phase-6.md');
    expect(t).toContain('{{gate kind=checkpoint name=features}}');
    expect(t).toContain('{{gate kind=checkpoint name=features-2}}');
    expect(nameFor('x-phase-6-confirm-after-fit', 'confirm')).toBe('after-fit');
  });

  it('converts validates snake_case to kebab-case', () => {
    put('ml-engineer/phases/phase-7.md', `::GATE:: id=ml-engineer-phase-7 phase=7 kind=final validates=ml_engineer\n${BOILER}\n::ENDGATE::\n`);
    run(root);
    expect(get('ml-engineer/phases/phase-7.md')).toContain('{{gate kind=final validates=ml-engineer}}');
  });

  it('preserves substantive text above the macro', () => {
    put('syn/modes/x.md', `::GATE:: id=specific-instructions-x-phase3 phase=3 kind=final\nAsk the user:\n- What do you want to adopt?\n- Or should we stop here?\n::ENDGATE::\n`);
    run(root);
    const t = get('syn/modes/x.md');
    expect(t).toMatch(/Gate readback \(pass this as the `summary`\):\n\nAsk the user:\n- What do you want to adopt\?\n- Or should we stop here\?\n\n\{\{gate kind=final phase=3 id=specific-instructions-x-phase3\}\}/);
  });

  it('does not convert fences inside code blocks and reports them', () => {
    const src = '```\n::GATE:: id=<unique-slug> phase=<N> kind=checkpoint\nbody\n::ENDGATE::\n```\n';
    put('ml-engineer/phases/phase-6.md', src);
    const r = run(root);
    expect(get('ml-engineer/phases/phase-6.md')).toBe(src);
    expect(r.skipped).toHaveLength(1);
  });

  it('is idempotent', () => {
    put('data-modeller/phases_deep/phase-3.md', `::GATE:: id=data-modeller-deep-phase-3 phase=3 kind=phase\n${BOILER}\n::ENDGATE::\n`);
    put('syn/modes/pm.md', `::GATE:: id=a-b phase=1 kind=final\nAsk the user:\n- q?\n::ENDGATE::\n`);
    run(root);
    const a = [get('data-modeller/phases_deep/phase-3.md'), get('syn/modes/pm.md')];
    const r2 = run(root);
    expect(r2.converted).toBe(0);
    expect([get('data-modeller/phases_deep/phase-3.md'), get('syn/modes/pm.md')]).toEqual(a);
  });
});
