// Regression: createServer() with an unnormalized project dir (trailing slash) must
// still surface artifacts inside the project; previously every event was dropped.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let dir, srv;
const get = (p) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port: srv.port, path: p, headers: { Authorization: `Bearer ${srv.authToken}` } },
    (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
  r.on('error', reject);
  r.end();
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pd-')));
  fs.mkdirSync(path.join(dir, '.shards'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ok.json'), '{"ok":1}');
  const { createServer } = require('../server.js');
  srv = await createServer(dir + path.sep, { port: 0 });
});
afterAll(() => {
  try { srv.shutdown(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('createServer with a trailing-slash project dir', () => {
  it('keeps artifacts inside the project', async () => {
    const ev = (p) => JSON.stringify({ v: 1, ts: new Date().toISOString(), session: 's1', agent: 't', type: 'chart', path: p, meta: {} }) + '\n';
    fs.appendFileSync(path.join(dir, '.shards', 'events.jsonl'), ev('ok.json') + ev(path.join(dir, 'ok.json')));
    const deadline = Date.now() + 3000;
    let list = [];
    while (Date.now() < deadline) {
      list = JSON.parse((await get('/api/artifacts')).body).artifacts;
      if (list.length) break;
      await sleep(50);
    }
    expect(list.map((a) => a.path)).toContain('ok.json');
  });
});
