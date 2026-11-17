import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { execFileSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const GOLDEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'golden');
const { scoreSession, globToRegExp } = require('./golden/score.js');

const SCORE = path.join(GOLDEN, 'score.js');
const SESSION_FILES = fs.readdirSync(path.join(GOLDEN, 'sessions')).filter(f => f.endsWith('.json')).sort();
const specs = SESSION_FILES.map(f => JSON.parse(fs.readFileSync(path.join(GOLDEN, 'sessions', f), 'utf8')));
const FORBIDDEN_TYPES = ['gate_self_approval', 'gate_reask', 'forbidden_agents', 'forbidden_text'];
const GATE_KINDS = ['phase', 'final', 'execute', 'handoff', 'checkpoint', 'confirm'];

const lines = d => fs.readFileSync(path.join(GOLDEN, 'fixtures', d, 'transcript.jsonl'), 'utf8').split('\n');
const outdir = d => path.join(GOLDEN, 'fixtures', d, 'outdir');
const SID = '01-syn-to-data-analyst-quick';

describe('golden session specs', () => {
  it('has the five expected sessions', () => {
    expect(SESSION_FILES).toEqual([
      '01-syn-to-data-analyst-quick.json', '02-analytics-engineer-deep.json', '03-pr-review.json',
      '04-data-science-deep-study.json', '05-pm-two-workstreams.json',
    ]);
  });

  for (const spec of specs) {
    describe(spec.id, () => {
      it('is structurally valid', () => {
        expect(SESSION_FILES).toContain(spec.id + '.json');
        for (const k of ['title', 'agent_entry', 'output_dir_glob']) expect(typeof spec[k]).toBe('string');
        expect(spec.agent_entry.startsWith('/')).toBe(true);
        expect(spec.user_turns.length).toBeGreaterThan(3);
        for (const t of spec.user_turns) {
          expect(typeof t.text).toBe('string');
          expect(['request', 'confirm', 'revise', 'answer', 'compact', 'resume']).toContain(t.kind);
        }
        expect(spec.user_turns.some(t => t.kind === 'revise')).toBe(true);
        expect(spec.expected_routing.length).toBeGreaterThan(0);
        expect(spec.expected_artifacts.length).toBeGreaterThan(0);
        for (const a of spec.expected_artifacts) {
          expect(typeof a.path).toBe('string');
          expect(typeof a.required).toBe('boolean');
        }
        expect(spec.expected_gates.length).toBeGreaterThan(0);
        for (const g of spec.expected_gates) {
          expect(typeof g.id).toBe('string');
          expect(GATE_KINDS).toContain(g.kind);
          expect(g.min).toBeGreaterThanOrEqual(1);
        }
        expect(spec.forbidden.length).toBeGreaterThan(0);
        for (const f of spec.forbidden) expect(FORBIDDEN_TYPES).toContain(f.type);
      });

      it('has weights summing to 100', () => {
        expect(Object.keys(spec.weights).sort()).toEqual(['artifacts', 'forbidden', 'gates', 'routing']);
        expect(Object.values(spec.weights).reduce((a, b) => a + b, 0)).toBe(100);
      });
    });
  }

  it('session 04 is the data science scenario with 2 compactions and 2 experiments', () => {
    const s = specs.find(x => x.id.startsWith('04-'));
    expect(s.forced_compactions).toBe(2);
    expect(s.experiments).toBe(2);
    expect(s.user_turns.filter(t => t.kind === 'compact').length).toBe(2);
    expect(s.expected_gates.filter(g => /^data-scientist-phase-\d$/.test(g.id)).length).toBe(7);
  });
});

describe('scorer', () => {
  const spec = specs.find(s => s.id === SID);

  it('passes the good fixture', () => {
    const r = scoreSession(spec, lines('01-good'), outdir('01-good'));
    expect(r.total).toBeGreaterThanOrEqual(90);
    expect(r.pass).toBe(true);
    expect(r.categories.forbidden.detail.violations).toEqual([]);
  });

  it('fails the degraded fixture', () => {
    const r = scoreSession(spec, lines('01-degraded'), outdir('01-degraded'));
    expect(r.total).toBeLessThan(90);
    expect(r.pass).toBe(false);
    expect(r.categories.routing.ratio).toBeLessThan(1);
    expect(r.categories.artifacts.ratio).toBeLessThan(1);
  });

  it('honours a custom threshold', () => {
    const r = scoreSession(spec, lines('01-good'), outdir('01-good'), { threshold: 101 });
    expect(r.pass).toBe(false);
  });

  it('matches globs', () => {
    expect(globToRegExp('models/**/*.sql').test('models/a.sql')).toBe(true);
    expect(globToRegExp('models/**/*.sql').test('models/x/y/a.sql')).toBe(true);
    expect(globToRegExp('*.sql').test('a/b.sql')).toBe(false);
  });
});

describe('score.js CLI', () => {
  const run = d => spawnSync('node', [SCORE, '--session', SID, '--transcript', path.join(GOLDEN, 'fixtures', d, 'transcript.jsonl'), '--outdir', outdir(d)], { encoding: 'utf8' });

  it('exits 0 for the good fixture', () => {
    const r = run('01-good');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('PASS');
  });

  it('exits 1 for the degraded fixture', () => {
    expect(run('01-degraded').status).toBe(1);
  });

  it('prints JSON with --json', () => {
    const out = execFileSync('node', [SCORE, '--session', SID, '--transcript', path.join(GOLDEN, 'fixtures/01-good/transcript.jsonl'), '--outdir', outdir('01-good'), '--json'], { encoding: 'utf8' });
    expect(JSON.parse(out).pass).toBe(true);
  });

  it('exits 2 on missing args or unknown session', () => {
    expect(spawnSync('node', [SCORE], { encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync('node', [SCORE, '--session', 'nope', '--transcript', 'x', '--outdir', 'y'], { encoding: 'utf8' }).status).toBe(2);
  });
});

describe('run-legacy.sh', () => {
  it('dry-runs and exits 0 without SHARDS_GOLDEN_LIVE', () => {
    const env = { ...process.env };
    delete env.SHARDS_GOLDEN_LIVE;
    const r = spawnSync('bash', [path.join(GOLDEN, 'run-legacy.sh'), '--session', SID], { encoding: 'utf8', env });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('DRY RUN');
    expect(r.stdout).toContain('--resume');
  });
});
