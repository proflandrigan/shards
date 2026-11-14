import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { computeReport, stableStringify } = require('../scripts/coupling-report.js');

function fixture() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'coupling-'));
  const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), t); };
  w('src/agents/a.md', '---\nname: a\nmodel: opus\n---\nTask(subagent_type="x") .claude/agents\n::GATE:: id=a-phase-1 phase=1 kind=phase\n::GATE:: id=b\n::AUTO-VERIFY:: x ::ENDAUTO::\nsee templates/nope.md and templates/yes.md /compact');
  w('src/agents/x/a_ui_mode.md', 'ui-push and Knowledge Ledger');
  w('src/templates/yes.md', 'hi');
  return d;
}

describe('computeReport', () => {
  it('counts metrics', () => {
    const r = computeReport({ root: fixture(), roots: ['src', 'missing'] });
    expect(r.subagent_type.count).toBe(1);
    expect(r.claude_dir_refs.count).toBe(1);
    expect(r.gate_fences.count).toBe(2);
    expect(r.gate_fences.by_kind).toEqual({ phase: 1, unspecified: 1 });
    expect(r.auto_verify.opens).toBe(1);
    expect(r.auto_verify.closes).toBe(1);
    expect(r.model_pins.count).toBe(1);
    expect(r.missing_templates.names).toEqual(['nope.md']);
    expect(r.ui_mode_files.count).toBe(1);
    expect(r.ui_refs.count).toBe(1);
    expect(r.ledger_refs.count).toBe(1);
    expect(r.compact.count).toBe(1);
  });
  it('is deterministic', () => {
    const d = fixture();
    const a = stableStringify(computeReport({ root: d, roots: ['src'] }));
    const b = stableStringify(computeReport({ root: d, roots: ['src'] }));
    expect(a).toBe(b);
  });
});
