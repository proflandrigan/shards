// Headless smoke test: starts the Studio server on a temp project, appends one
// artifact event per panel type to .shards/events.jsonl and checks
// GET /api/artifacts. NOTE: browser rendering (js/panels.js) is NOT verified
// here; only the server-side event -> artifact pipeline is.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const TYPES = ['data-viewer', 'chart', 'dag', 'experiment-dashboard', 'eval-dashboard',
  'model-card', 'prompt-lab', 'brainstorm', 'pr-review', 'notebook-walkthrough'];

let dir, srv, eventsFile;

function get(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: srv.port, path: p, headers: { Authorization: `Bearer ${srv.authToken}` } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); })
      .on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timeout');
    await sleep(50);
  }
}
const ev = (type, p) => JSON.stringify({ v: 1, ts: new Date().toISOString(), session: 's1', agent: 'test', type, path: p, meta: {} }) + '\n';

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-smoke-'));
  fs.mkdirSync(path.join(dir, '.shards'), { recursive: true });
  eventsFile = path.join(dir, '.shards', 'events.jsonl');
  // Pre-existing event exercises startup replay.
  fs.writeFileSync(eventsFile, ev('chart', 'replayed.json'));
  const { createServer } = require('../server.js');
  srv = await createServer(dir, { port: 0 });
});
afterAll(() => {
  try { srv.shutdown(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('Studio headless smoke', () => {
  it('rejects unauthenticated /api/artifacts', async () => {
    const r = await new Promise((resolve) => http.get({ host: '127.0.0.1', port: srv.port, path: '/api/artifacts' },
      (res) => { res.resume(); resolve(res.statusCode); }));
    expect(r).toBe(401);
  });

  it('replays existing events, then lists one artifact per type and honours close', async () => {
    const list = async () => JSON.parse((await get('/api/artifacts')).body).artifacts;
    await waitFor(async () => (await list()).some((a) => a.path === 'replayed.json'));
    for (const t of TYPES) fs.appendFileSync(eventsFile, ev(t, `art/${t}.json`));
    const all = await waitFor(async () => {
      const l = await list();
      return TYPES.every((t) => l.some((a) => a.type === t && a.path === `art/${t}.json`)) ? l : null;
    });
    expect(new Set(all.map((a) => a.type))).toEqual(new Set(TYPES));

    fs.appendFileSync(eventsFile, ev('close', 'art/dag.json'));
    const after = await waitFor(async () => {
      const l = await list();
      return l.some((a) => a.type === 'dag') ? null : l;
    });
    expect(after.some((a) => a.type === 'dag')).toBe(false);
    expect(after).toHaveLength(TYPES.length); // 9 typed + replayed.json
  });

  it('serves the guide manifest and a friendly 404 for missing pages', async () => {
    const m = await get('/docs/manifest');
    expect(m.status).toBe(200);
    const man = JSON.parse(m.body);
    expect(man.sections.length).toBeGreaterThan(0);
    expect(man.sections[0].pages[0]).toHaveProperty('file');
    const first = await get('/docs/page?file=' + encodeURIComponent(man.sections[0].pages[0].file));
    expect(first.status).toBe(200);
    const p = await get('/docs/page?file=nope/missing.md');
    expect(p.status).toBe(404);
    expect(p.body).toMatch(/not available/);
  });

  it('serves runtime gate state at /gates and no longer serves the v1 routes', async () => {
    const gdir = path.join(dir, '.shards', 'state', 'sessions', 'sx');
    fs.mkdirSync(gdir, { recursive: true });
    fs.writeFileSync(path.join(gdir, 'gates.json'), JSON.stringify({ gates: { g1: { id: 'g1', status: 'pending', kind: 'phase', phase: 1, requested_at: '2026-01-01T00:00:00Z' } } }));
    const g = JSON.parse((await get('/gates')).body);
    expect(g).toMatchObject({ open: true, id: 'g1', session: 'sx' });
    expect((await get('/gate-state')).status).toBe(404);
    expect((await get('/pre-tool-use')).status).toBe(404);
  });
});
