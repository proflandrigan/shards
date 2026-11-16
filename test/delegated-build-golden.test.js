import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const dir = path.resolve(__dirname, 'golden/delegated-build');
const { score } = require(path.join(dir, 'score.js'));

let proj;
const build = () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'dbg-'));
  fs.cpSync(path.join(dir, 'fixture'), p, { recursive: true });
  execFileSync('node', [path.join(dir, 'dry-run.js'), p], { stdio: 'pipe' });
  return p;
};
const specsOf = (p) => path.join(p, 'analysis/dbuild/project-specs.md');
const tasksFile = (p) => path.join(p, '.shards/state/sessions/synthetic/tasks.json');

beforeAll(() => { proj = build(); });

describe('delegated-build golden harness (dry-run)', () => {
  it('scores the synthetic good state as pass', () => {
    const r = score(proj);
    expect(r.rows.filter((x) => x.ok === false)).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.rows.find((x) => x.name === 'owned-path violations').value).toMatch(/n\/a \(not measured\)/);
    expect(r.rows.find((x) => x.name === 'context ratio vs legacy').ok).toBeNull();
  });
  it('run.sh --dry-run exits 0', () => {
    execFileSync('bash', [path.join(dir, 'run.sh'), '--dry-run'], { stdio: 'pipe' });
  });
  it('fails when a done task has no evidence row', () => {
    const p = build();
    const s = fs.readFileSync(specsOf(p), 'utf8').split('\n').filter((l) => !l.startsWith('| t3: ')).join('\n');
    fs.writeFileSync(specsOf(p), s);
    const r = score(p);
    expect(r.pass).toBe(false);
    expect(r.rows.find((x) => x.name.startsWith('evidence rows')).ok).toBe(false);
  });
  it('fails when a task is done without ever being verified (reported shortcut)', () => {
    const p = build();
    const f = tasksFile(p); const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.tasks.t4.status = 'done'; fs.writeFileSync(f, JSON.stringify(j));
    const s = fs.readFileSync(specsOf(p), 'utf8').split('\n').filter((l) => !l.startsWith('| t4: ')).join('\n');
    fs.writeFileSync(specsOf(p), s);
    expect(score(p).pass).toBe(false);
  });
  it('fails on an escalated task and on open drift', () => {
    const p = build();
    const f = tasksFile(p); const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.tasks.t2.escalated = true; j.drift = { open: true }; fs.writeFileSync(f, JSON.stringify(j));
    const r = score(p);
    expect(r.pass).toBe(false);
    expect(r.rows.find((x) => x.name === 'escalated count').ok).toBe(false);
    expect(r.rows.find((x) => x.name.startsWith('plan changes')).ok).toBe(false);
  });
});
