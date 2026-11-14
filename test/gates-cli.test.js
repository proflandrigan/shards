import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const gates = require('../runtime/gates');
const { makeRepo, write, sh, cleanup } = require('./git-binding-fixture.js');

const CLI = path.resolve(__dirname, '..', 'cli', 'shards.js');
const run = (cwd, ...args) => spawnSync(process.execPath, [CLI, 'gates', ...args], { cwd, encoding: 'utf8', env: { ...process.env, SHARDS_PROJECT_ROOT: '' } });

let root;
async function openGate(key, id = 'data-analyst-phase-1') {
  const state = new StateStore(root, key);
  const frame = await pushFrame(state, { agent: 'data-analyst', project: 'p' });
  await gates.requestGate({ root, sessionKey: key, state }, { frame, id, kind: 'phase', phase: 1, summary: 's', record_ref: 'analysis/p/project-specs.md' });
  return state;
}
beforeEach(() => { ({ root } = makeRepo()); write(root, 'analysis/p/project-specs.md', '# specs\n'); });
afterEach(cleanup);

describe('shards gates CLI (interim)', () => {
  it('status with no sessions runs', () => {
    const r = run(root, 'status', '--root', root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('no sessions');
  });
  it('status lists gates and pending commits', async () => {
    await openGate('sA');
    const r = run(root, 'status');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('session sA');
    expect(r.stdout).toContain('data-analyst-phase-1');
    expect(r.stdout).toContain('status pending');
    expect(r.stdout).toContain('pending git commits: none');
  });
  it('confirm commits the output dir, writes the log line', async () => {
    const state = await openGate('sA');
    const r = run(root, 'confirm', 'data-analyst-phase-1');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('confirmed');
    const g = gates.getGate({ root, sessionKey: 'sA', state: new StateStore(root, 'sA') }, 'data-analyst-phase-1');
    expect(g.status).toBe('confirmed');
    expect(g.proof.tier).toBe('operator-cli');
    expect(g.commit.outcome).toBe('committed');
    expect(g.commit.sha).toBeTruthy();
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(g.commit.sha);
    expect(sh(root, 'show', '--stat', '--format=', 'HEAD')).toContain('analysis/p/project-specs.md');
    const log = fs.readFileSync(path.join(root, '.shards', 'state', 'gate-operator.log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ gate: 'data-analyst-phase-1', session: 'sA', decision: 'confirmed', tier: 'operator-cli' });
    expect(run(root, 'status').stdout).toContain('committed');
  });
  it('--changes yields changes_requested and no commit', async () => {
    await openGate('sA');
    const head = sh(root, 'rev-parse', 'HEAD');
    const r = run(root, 'confirm', 'data-analyst-phase-1', '--changes', 'fix it', '--session', 'sA');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('changes requested');
    const g = gates.getGate({ root, sessionKey: 'sA', state: new StateStore(root, 'sA') }, 'data-analyst-phase-1');
    expect(g.status).toBe('changes_requested');
    expect(g.note).toBe('fix it');
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head);
  });
  it('unknown gate -> 1; ambiguous -> 2; usage errors -> 2', async () => {
    expect(run(root, 'confirm', 'nope').status).toBe(1);
    await openGate('sA'); await openGate('sB');
    const amb = run(root, 'confirm', 'data-analyst-phase-1');
    expect(amb.status).toBe(2);
    expect(amb.stderr).toContain('sA');
    expect(amb.stderr).toContain('sB');
    expect(run(root, 'confirm').status).toBe(2);
    expect(run(root, 'bogus').status).toBe(2);
    expect(run(root, 'status', '--wat').status).toBe(2);
    expect(run(root, 'confirm', 'x', '--session', '../bad').status).toBe(2);
    expect(run(root, 'confirm', 'data-analyst-phase-1', '--session', 'sB').status).toBe(0);
  });
});
