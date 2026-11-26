// E1.9 closure tests for AGENT_REPORT 3.1 (phase files loaded once), 3.3 (shared Syn-review
// resolution) and 3.7 (project-specs.md loaded once, treated as live).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const AGENTS = path.resolve(import.meta.dirname, '../core/agents');
const PROTOCOLS = path.resolve(import.meta.dirname, '../core/protocols');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(AGENTS, p);
const read = (p) => fs.readFileSync(p, 'utf8');
const agentDirs = fs.readdirSync(AGENTS).filter((d) => fs.statSync(path.join(AGENTS, d)).isDirectory());
const phased = agentDirs.filter((d) => /^#\s+Phase Progression/m.test(read(path.join(AGENTS, d, 'AGENT.md'))));

describe('3.1 phase files are loaded exactly once', () => {
  it('finds the phased specialists', () => {
    expect(phased.length).toBe(11);
  });

  it.each(phased)('%s: one load-once statement, no "when to load" trigger list', (agent) => {
    const s = read(path.join(AGENTS, agent, 'AGENT.md'));
    expect(s.match(/\*\*Load once\.\*\*/g)?.length).toBe(1);
    expect(s).not.toMatch(/When to load/i);
    expect(s).not.toMatch(/When NOT to load/i);
  });

  it.each(phased)('%s: phase index is read only from the single Phase Progression section', (agent) => {
    const s = read(path.join(AGENTS, agent, 'AGENT.md'));
    const section = s.split(/^# Phase Progression[^\n]*\n/m)[1].split(/^# /m)[0];
    const outside = s.replace(section, '');
    expect(outside).not.toMatch(/Read \[`phases[_a-z]*\/index\.md`\]/);
    const inside = section.match(/Read \[`phases[_a-z]*\/index\.md`\]/g) || [];
    expect(inside.length).toBeGreaterThanOrEqual(1);
    expect(inside.length).toBeLessThanOrEqual(2); // dual-track agents: one per track
  });
});

describe('3.3 Syn-review resolution is a single shared protocol', () => {
  const shared = path.join(PROTOCOLS, 'syn_review_resolution.md');
  const files = walk(AGENTS);

  it('shared protocol exists and keeps the escalation and code-review blocks', () => {
    const s = read(shared);
    expect(s).toContain('If Syn returns NEEDS REVISION or BLOCKED a second time');
    expect(s).toContain('Syn has flagged concerns twice');
    expect(s).toContain('Syn review resolution:');
    expect(s).toContain('Code artifacts found: Yes');
    expect(s).toContain('{{protocol reviewer_verdict}}');
  });

  it('no agent file duplicates the escalation or code-review prose', () => {
    const offenders = [];
    for (const f of files) {
      const s = read(f);
      if (/Syn has flagged concerns twice/.test(s)) offenders.push(rel(f));
      if (/Resubmit to Syn ONCE more/.test(s)) offenders.push(rel(f));
      if (/Syn spotted \[N\]/.test(s)) offenders.push(rel(f));
      if (/^\*\*Syn review resolution:\*\*/m.test(s)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('every phase file that handles a Syn code-review section references the shared protocol', () => {
    const users = files.filter((f) => /Code Review" section/.test(read(f)));
    expect(users.length).toBeGreaterThan(0);
    for (const f of users) expect(read(f), rel(f)).toContain('{{protocol syn_review_resolution}}');
  });

  it('the code pass is the code_review protocol run by the specialist, not a Syn consult', () => {
    const users = files.filter((f) => /Code Review" section/.test(read(f)));
    for (const f of users) expect(read(f), rel(f)).toContain('{{protocol code_review}}');
    for (const f of files) expect(read(f), rel(f)).not.toMatch(/entry=code_review|SERVICE MODE — APPLY/);
  });
});

describe('3.7 project-specs.md is loaded once and treated as live', () => {
  it('shared behavioral rules state it once', () => {
    const s = read(path.join(PROTOCOLS, 'behavioral_rules.md'));
    expect(s.match(/Load `project-specs\.md` once, treat it as live/g)?.length).toBe(1);
    expect(s).toMatch(/Re-read only where it may have changed out of band/);
  });

  it.each(phased)('%s: pulls in the shared behavioral rules', (agent) => {
    expect(read(path.join(AGENTS, agent, 'AGENT.md'))).toContain('{{protocol behavioral_rules}}');
  });

  it('no mode or phase file tells the agent to re-read project-specs.md in the same context', () => {
    const offenders = [];
    for (const f of walk(AGENTS)) {
      const s = read(f);
      if (/^\d+\. Read `project-specs\.md` in full\./m.test(s)) offenders.push(rel(f));
      if (/Read `project-specs\.md` to extract/.test(s)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('per-phase read-project-specs directives stay under the post-fix ceiling', () => {
    // Remaining hits are consult/handoff briefs addressed to a different context.
    let count = 0;
    for (const d of agentDirs) {
      for (const sub of fs.readdirSync(path.join(AGENTS, d)).filter((x) => /^phases/.test(x))) {
        for (const f of walk(path.join(AGENTS, d, sub))) {
          count += (read(f).match(/read.{0,40}project-specs/gi) || []).length;
        }
      }
    }
    expect(count).toBeLessThanOrEqual(17);
  });
});
