import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { loadCore } = require('../build/core.js');
const { processFile, compile } = require('../build/compile.js');
const { makeCore, tmpDir } = require('./build-fixture.js');

const PREFIX = { claude: 'mcp__plugin_shards_shards__', codex: 'shards.', skills: '' };
function run(src, target) {
  const core = loadCore(makeCore({}));
  return processFile(core, 'agents/alpha/phases/phase-1.md', src, { target, strict: false });
}
const SEQ = 'run the ready cards one at a time through the same dispatch/report/verify steps';
const INL = 'do each card yourself inline under the same owned-path rule';

describe('delegate host fallbacks', () => {
  for (const target of ['claude', 'codex', 'skills']) {
    for (const mode of [undefined, 'parallel', 'sequential', 'inline']) {
      it(`${target} mode=${mode || 'default'}`, () => {
        const r = run(mode ? `{{delegate mode=${mode}}}` : '{{delegate}}', target);
        expect(r.errors).toEqual([]);
        expect(r.text).toContain(`${PREFIX[target]}task_verify`);
        expect(r.text).toContain('at most 2 retries');
        const eff = mode || (target === 'skills' ? 'sequential' : 'parallel');
        expect(r.text).toContain(`mode: ${eff}`);
        if (eff === 'parallel') {
          expect(r.text).toContain(SEQ);
          expect(r.text).toContain(INL);
          expect(r.text).toContain(target === 'codex' ? 'max_threads' : 'thread cap');
          if (target === 'codex') expect(r.text).toContain('spawn_agent');
          if (target === 'claude') expect(r.text).toContain('background subagent');
        } else if (eff === 'sequential') {
          expect(r.text).toContain('ONE ready task');
          expect(r.text).toContain(INL);
        } else {
          expect(r.text).toContain('no worker handoff');
          expect(r.text).toContain('only isolation is lost');
        }
      });
    }
  }
  it('skills default is sequential with inline fallback', () => {
    const t = run('{{delegate}}', 'skills').text;
    expect(t).toContain('isolated context if the host supports it');
    expect(t).toContain('inline');
  });
  it('rejects invalid mode', () => {
    expect(run('{{delegate mode=turbo}}', 'claude').errors.length).toBeGreaterThan(0);
  });
  it('compiled output carries fallback text per target', () => {
    const files = { 'agents/alpha/phases/phase-1.md': '# Phase 1\n\n{{delegate}}\n' };
    for (const target of ['claude', 'codex', 'skills']) {
      const out = tmpDir();
      const r = compile({ bundleDeps: false, target, coreDir: makeCore(files), outDir: out });
      expect(r.errors).toEqual([]);
      const txt = fs.readFileSync(path.join(out, 'content/agents/alpha/phases/phase-1.md'), 'utf8');
      expect(txt).toContain(`${PREFIX[target]}task_verify`);
      expect(txt).toContain(INL);
      if (target !== 'skills') expect(txt).toContain(SEQ);
    }
  });
});
