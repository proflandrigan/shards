import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { loadCore } = require('../build/core.js');
const { processFile } = require('../build/compile.js');
const { makeCore } = require('./build-fixture.js');

function run(src, target) {
  const core = loadCore(makeCore({}));
  return processFile(core, 'agents/alpha/phases/phase-1.md', src, { target, strict: false });
}

describe('delegate macro', () => {
  for (const target of ['claude', 'codex', 'skills']) {
    it(`renders for ${target}`, () => {
      const r = run('{{delegate}}', target);
      expect(r.errors).toEqual([]);
      for (const t of ['tasks_set', 'task_dispatch', 'task_report', 'task_status']) expect(r.text).toContain(t);
      expect(r.text).toContain('plan_drift');
      expect(r.text).toContain('<output_dir>/tasks.yaml');
    });
  }
  it('uses per-target prefixes and worker mechanics', () => {
    expect(run('{{delegate}}', 'claude').text).toContain('mcp__plugin_shards_shards__task_dispatch');
    expect(run('{{delegate}}', 'codex').text).toContain('shards.task_dispatch');
    expect(run('{{delegate}}', 'codex').text).toContain('spawn_agent');
    expect(run('{{delegate}}', 'skills').text).toContain('inline');
  });
  it('accepts tasks and max_parallel', () => {
    const r = run('{{delegate tasks=x/tasks.yaml max_parallel=2}}', 'claude');
    expect(r.errors).toEqual([]);
    expect(r.text).toContain('x/tasks.yaml');
    expect(r.text).toContain('2');
  });
  it('rejects bad max_parallel', () => {
    for (const v of ['0', 'abc', '-1', '1.5']) expect(run(`{{delegate max_parallel=${v}}}`, 'claude').errors.length).toBeGreaterThan(0);
  });
});
