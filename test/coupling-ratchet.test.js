import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { computeReport } = require('../scripts/coupling-report.js');
const { compare, extractCounts } = require('../scripts/coupling-ratchet.js');

describe('coupling ratchet', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ratchet-'));
  const f = path.join(d, 'src/agents/a.md');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'subagent_type\n::GATE:: kind=phase\n');
  const snap = () => extractCounts(computeReport({ root: d, roots: ['src'] }));
  const baseline = snap();

  it('passes when unchanged', () => {
    expect(compare(baseline, snap()).ok).toBe(true);
  });
  it('fails when coupling is added', () => {
    fs.writeFileSync(path.join(d, 'src/agents/b.md'), 'subagent_type\n::GATE:: kind=final\n');
    const r = compare(baseline, snap());
    expect(r.ok).toBe(false);
    const names = r.increased.map((x) => x.metric);
    expect(names).toContain('subagent_type');
    expect(names).toContain('gate_fences');
    expect(names).toContain('gate_fences.by_kind.final');
  });
  it('passes when coupling decreases', () => {
    fs.writeFileSync(f, 'nothing\n');
    fs.unlinkSync(path.join(d, 'src/agents/b.md'));
    const r = compare(baseline, snap());
    expect(r.ok).toBe(true);
    expect(r.decreased.length).toBeGreaterThan(0);
  });
});
