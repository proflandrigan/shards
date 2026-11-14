import { describe, it, expect } from 'vitest';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { inventory } = require('../build/activation-inventory.js');
const { loadCore } = require('../build/core.js');
const { checkActivation, checkEmitted } = require('../build/activation-check.js');

const coreDir = path.join(__dirname, '..', 'core');
const core = loadCore(coreDir);

describe('activation inventory', () => {
  it('matches agent.yaml for the real core/', () => {
    const inv = inventory(coreDir);
    for (const [id, u] of Object.entries(inv)) {
      const doc = core.agents.get(id).doc;
      if (u.switch_target) expect(doc.activation, id).toContain('switch');
      if (u.fanout_target) expect(doc.activation, id).toContain('fanout_worker');
      for (const e of Object.keys(u.consulted)) expect(Object.keys(doc.consult_entries), `${id}/${e}`).toContain(e);
    }
    expect(inv.syn.consulted.final_review.length).toBeGreaterThan(0);
  });
  it('every worker-capable agent is fanout_worker', () => {
    for (const a of core.agents.values()) {
      if ((a.doc.consult_entries || {}).worker) expect(a.doc.activation, a.id).toContain('fanout_worker');
    }
  });
  it('checkActivation passes on core/', () => {
    expect(checkActivation(core)).toEqual([]);
  });
  it('checkEmitted flags a missing skill and subagent', () => {
    const files = [];
    for (const a of core.agents.values()) {
      files.push(`skills/${a.id}/SKILL.md`, `agents/${a.id}.md`);
      for (const e of Object.keys(a.doc.consult_entries || {})) files.push(`agents/${a.id}-${e}.md`);
    }
    expect(checkEmitted(core, files, 'claude')).toEqual([]);
    const errs = checkEmitted(core, files.filter((f) => f !== 'skills/syn/SKILL.md' && f !== 'agents/researcher-service.md'), 'claude');
    expect(errs.some((e) => e.includes('skills/syn/SKILL.md'))).toBe(true);
    expect(errs.some((e) => e.includes('agents/researcher-service.md'))).toBe(true);
    expect(checkEmitted(core, [], 'codex').length).toBeGreaterThan(0);
  });
});
