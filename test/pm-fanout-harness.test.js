import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'pm-fanout-live-run.sh');
const P = 'mcp__plugin_shards_shards__';
const tmp = [];
const run = (...args) => spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin:' + path.dirname(process.execPath) } });

const a = (b) => JSON.stringify({ type: 'assistant', message: { content: [b] } });
const u = (b) => JSON.stringify({ type: 'user', message: { content: [b] } });

function fixture(o = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pmfx-')); tmp.push(d);
  const s = path.join(d, '.shards/state/sessions/x'); fs.mkdirSync(s, { recursive: true });
  fs.mkdirSync(path.join(d, '.fanout-run'));
  const n = o.slices ?? 4;
  fs.writeFileSync(path.join(s, 'leases.json'), JSON.stringify({ leases: { L: { id: 'L', owner: 'fanout', status: o.status ?? 'closed', opened_at: '2026-01-01T00:10:00.000Z',
    slices: Array.from({ length: n }, (_, i) => ({ id: 's' + i, paths: ['d/s' + i] })) } } }));
  fs.writeFileSync(path.join(s, 'gates.json'), JSON.stringify({ gates: { g: o.gate ?? { id: 'g', status: 'confirmed', requested_at: '2026-01-01T00:01:00.000Z', updated_at: '2026-01-01T00:05:00.000Z' } } }));
  const lines = [];
  if (o.denied) lines.push(a({ type: 'tool_use', id: 'w1', name: 'Write', input: { file_path: 'd/other/x' } }), u({ type: 'tool_result', tool_use_id: 'w1', is_error: true, content: 'shards: outside slice' }),
    a({ type: 'tool_use', id: 'w2', name: 'Write', input: { file_path: 'd/other/x' } }), u({ type: 'tool_result', tool_use_id: 'w2', content: 'ok' }));
  if (!o.noCollect) lines.push(a({ type: 'tool_use', id: 'c', name: P + 'fanout_collect', input: {} }),
    u({ type: 'tool_result', tool_use_id: 'c', content: o.noVerdict ? 'closed' : 'collected: APPROVED\n{"verdict": "APPROVED"}' }));
  fs.writeFileSync(path.join(d, '.fanout-run/stream.jsonl'), lines.join('\n') + '\n');
  return d;
}

afterAll(() => { for (const d of tmp) fs.rmSync(d, { recursive: true, force: true }); });

describe('pm-fanout-live-run.sh', () => {
  it('has a one-sample header and parses', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    expect(src).toMatch(/ONE SAMPLE, NEVER A PASS RATE/);
    expect(src).not.toMatch(/--dangerously-skip-permissions\s+["'$a-z]/);
    expect(spawnSync('bash', ['-n', SCRIPT]).status).toBe(0);
  });
  it('--check-only passes a good state', () => {
    const r = run('--check-only', fixture());
    expect(r.stdout).toMatch(/PASS: 5\/5/);
    expect(r.status).toBe(0);
  });
  it.each([
    ['wrong slice count', { slices: 3 }, /FAIL  fanout lease opened with 4 slices/],
    ['pending gate at start', { gate: { id: 'g', status: 'pending', requested_at: '2026-01-01T00:01:00.000Z', updated_at: '2026-01-01T00:01:00.000Z' } }, /FAIL  no gate pending/],
    ['denied then succeeded', { denied: true }, /FAIL  no denied-then-succeeded write/],
    ['lease not closed', { status: 'active', noCollect: true }, /FAIL  lease closed via fanout_collect/],
    ['no merged verdict', { noVerdict: true }, /FAIL  merged verdict present/],
  ])('--check-only fails: %s', (_n, o, re) => {
    const r = run('--check-only', fixture(o));
    expect(r.stdout).toMatch(re);
    expect(r.status).toBe(1);
  });
  it('--dry-run prints the command and checks a fixture without claude', () => {
    const r = run('--dry-run');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/DRY RUN: claude is not invoked/);
    expect(r.stdout).toMatch(/--plugin-dir/);
    expect(r.stdout).toContain(P + 'fanout_start');
    expect(r.stdout).not.toMatch(/dangerously-skip/);
    expect(r.stdout).toMatch(/PASS: 5\/5/);
    const m = /project_dir: (\S+)/.exec(r.stdout); if (m) tmp.push(m[1]);
  });
  it('rejects unknown args', () => { expect(run('--bogus').status).toBe(2); });
});
