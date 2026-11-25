import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('PM mode launches workstream leads (issue 89)', () => {
  const pm = read('core/agents/syn/modes/pm.md');
  const phase3 = pm.slice(pm.indexOf('## Phase 3'), pm.indexOf('## Phase 4'));

  it('Phase 3 uses {{lead and no {{fanout', () => {
    expect(phase3).toContain('{{lead ');
    expect(phase3).not.toContain('{{fanout');
    expect(phase3).toContain('WORKSTREAM LEAD');
    expect(phase3).toContain('**Delegation**');
  });

  it('pm.md no longer fans out specialist copies', () => {
    expect(pm).not.toContain('{{fanout');
    expect(pm).not.toContain('{{protocol swarm}}');
  });

  it('lead_contract.md covers scope, verification and fallback', () => {
    const t = read('core/protocols/lead_contract.md');
    expect(t).toContain('name: lead-contract');
    expect(t).toContain('scope');
    expect(t).toContain('task_verify');
    expect(t).toContain('delegated_build');
    expect(t).toContain('Fallback:');
    expect(t).toContain('gate_request');
  });

  it('worker_contract.md keeps No delegation and names the lead contract', () => {
    const t = read('core/protocols/worker_contract.md');
    expect(t).toContain('No delegation');
    expect(t).toContain('lead_contract');
  });

  it('delegated_build.md has the strict fallback section and the PM section', () => {
    const t = read('core/protocols/delegated_build.md');
    const fb = t.slice(t.indexOf('## Sequential or inline fallback'));
    expect(fb).toContain('Fallback:');
    expect(fb).toContain('genuinely cannot be spawned');
    expect(t).toContain('## Leads under PM mode');
    expect(t).toContain('lead_contract');
  });
});
