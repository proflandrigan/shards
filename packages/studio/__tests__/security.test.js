// Regression tests: cross-origin / DNS-rebinding guard, CSP, and event-path containment.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let dir, outside, srv;

function req(p, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: srv.port, path: p, method, headers },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); });
    r.on('error', reject);
    r.end();
  });
}
const auth = () => ({ Authorization: `Bearer ${srv.authToken}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (type, p) => JSON.stringify({ v: 1, ts: new Date().toISOString(), session: 's1', agent: 't', type, path: p, meta: {} }) + '\n';

beforeAll(async () => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-sec-')));
  outside = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-out-'));
  fs.writeFileSync(path.join(outside, 'secret.json'), '{"secret":1}');
  fs.mkdirSync(path.join(dir, '.shards'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'ok.json'), '{"ok":1}');
  fs.symlinkSync(outside, path.join(dir, 'link'));
  const { createServer } = require('../server.js');
  srv = await createServer(dir, { port: 0 });
});
afterAll(() => {
  try { srv.shutdown(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

describe('origin and host guard', () => {
  it('serves the page at its own origin with a CSP, no wildcard CORS, and the token', async () => {
    const r = await req('/', { Host: `localhost:${srv.port}` });
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['content-security-policy']).toContain("object-src 'none'");
    expect(r.body).toContain(srv.authToken);
  });
  it('accepts a same-origin Origin header', async () => {
    const r = await req('/api/artifacts', { ...auth(), Host: `127.0.0.1:${srv.port}`, Origin: `http://127.0.0.1:${srv.port}` });
    expect(r.status).toBe(200);
  });
  it('rejects a foreign Origin', async () => {
    for (const p of ['/', '/api/artifacts']) {
      const r = await req(p, { ...auth(), Origin: 'https://evil.example' });
      expect(r.status).toBe(403);
      expect(r.body).not.toContain(srv.authToken);
    }
  });
  it('rejects a rebinding Host', async () => {
    const r = await req('/', { Host: `evil.example:${srv.port}` });
    expect(r.status).toBe(403);
    expect((await req('/', { Host: 'localhost:1' })).status).toBe(403);
  });
  it('rejects a foreign Origin on POST /chat/start', async () => {
    const r = await req('/chat/start', { ...auth(), Origin: 'https://evil.example' }, 'POST');
    expect(r.status).toBe(403);
  });
});

describe('event path containment', () => {
  it('drops events whose path escapes the project', async () => {
    const f = path.join(dir, '.shards', 'events.jsonl');
    fs.appendFileSync(f, ev('chart', path.join(outside, 'secret.json')) + ev('chart', '../../etc/passwd') + ev('chart', 'link/secret.json') + ev('chart', 'ok.json'));
    const deadline = Date.now() + 5000;
    let list = [];
    while (Date.now() < deadline) {
      list = JSON.parse((await req('/api/artifacts', auth())).body).artifacts;
      if (list.some((a) => a.path === 'ok.json')) break;
      await sleep(50);
    }
    expect(list.map((a) => a.path)).toEqual(['ok.json']);
  });
});
