import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { compile } = require('../build/compile.js');

describe.each(['claude', 'codex', 'skills'])('Epic Captain on %s', (target) => {
  it('ships the Syn route, PM lead handoff and scoped amendment procedure together', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-epic-'));
    try {
      expect(compile({ target, outDir: out, bundleDeps: false }).errors).toEqual([]);
      const read = (rel) => fs.readFileSync(path.join(out, 'content/agents/syn', rel), 'utf8');
      const captain = read('modes/epic_captain.md').replace(/\s+/g, ' ');
      expect(read('AGENT.md')).toContain('modes/epic_captain.md');
      expect(captain).toContain('pm.md');
      expect(read('modes/pm.md')).toContain('WORKSTREAM LEAD');
      expect(captain).toContain('hold the entire workstream');
      expect(captain).toContain('Rejoin a live lead');
      expect(captain).toContain('scoped task_status');
      expect(captain).toContain('without calling tasks_set again');
      expect(captain).toContain('syn-amend-<n>');
      expect(captain).toContain('protocols/plan_drift.md');
      expect(captain).toContain('confirmed amendment_gate');
      expect(captain).toContain('A verified handoff can satisfy a local dependency');
      expect(captain).toContain('wait for that observed event');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});
