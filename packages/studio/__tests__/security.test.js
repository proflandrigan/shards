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

describe('host policy (proxies and exposed binds)', () => {
  const { buildHostPolicy, requestOriginAllowed } = require('../server.js');
  const mk = (host, { localPort = 7842, origin, encrypted = false } = {}) => ({
    headers: origin === undefined ? { host } : { host, origin },
    socket: { localPort, encrypted },
  });
  const ifaces = () => ({
    lo: [{ address: '127.0.0.1' }, { address: '::1' }],
    eth0: [{ address: '192.168.1.20' }, { address: 'fe80::abcd' }],
  });

  it('default bind: loopback on the arrival port only', () => {
    const p = buildHostPolicy({ bind: '127.0.0.1', allowedHosts: '' });
    expect(requestOriginAllowed(mk('localhost:7842'), p)).toBe(true);
    expect(requestOriginAllowed(mk('[::1]:7842'), p)).toBe(true);
    expect(requestOriginAllowed(mk('localhost:9999'), p)).toBe(false);
    expect(requestOriginAllowed(mk('evil.example:7842'), p)).toBe(false);
  });

  it('accepts a reverse proxy public name listed in SHARDS_ALLOWED_HOSTS without a port', () => {
    const p = buildHostPolicy({ bind: '127.0.0.1', allowedHosts: 'studio.example.com, other.example:8443' });
    expect(requestOriginAllowed(mk('studio.example.com'), p)).toBe(true);
    expect(requestOriginAllowed(mk('studio.example.com', { origin: 'https://studio.example.com' }), p)).toBe(true);
    expect(requestOriginAllowed(mk('STUDIO.example.com:443'), p)).toBe(true);
    expect(requestOriginAllowed(mk('other.example:8443'), p)).toBe(true);
    expect(requestOriginAllowed(mk('other.example:80'), p)).toBe(false);
    expect(requestOriginAllowed(mk('studio.example.com', { origin: 'https://evil.example' }), p)).toBe(false);
    expect(requestOriginAllowed(mk('evil.example'), p)).toBe(false);
  });

  it('still checks Host when bound to 0.0.0.0 or :: (DNS rebinding)', () => {
    for (const bind of ['0.0.0.0', '::']) {
      const p = buildHostPolicy({ bind, allowedHosts: '', hostname: () => 'MyBox', interfaces: ifaces });
      expect(requestOriginAllowed(mk('evil.example:7842'), p)).toBe(false);
      expect(requestOriginAllowed(mk('evil.example:7842', { origin: 'http://evil.example:7842' }), p)).toBe(false);
      expect(requestOriginAllowed(mk('192.168.1.20:7842'), p)).toBe(true);
      expect(requestOriginAllowed(mk('[fe80::abcd]:7842'), p)).toBe(true);
      expect(requestOriginAllowed(mk('mybox:7842'), p)).toBe(true);
      expect(requestOriginAllowed(mk('localhost:7842'), p)).toBe(true);
      expect(requestOriginAllowed(mk('192.168.1.20:9999'), p)).toBe(false);
    }
  });

  it('allows a non-loopback bind host on the arrival port, IPv6 in brackets', () => {
    expect(requestOriginAllowed(mk('10.0.0.5:7842'), buildHostPolicy({ bind: '10.0.0.5' }))).toBe(true);
    expect(requestOriginAllowed(mk('[fd00::5]:7842'), buildHostPolicy({ bind: 'fd00::5' }))).toBe(true);
    expect(requestOriginAllowed(mk('[fd00::6]:7842'), buildHostPolicy({ bind: 'fd00::5', allowedHosts: 'fd00::6' }))).toBe(true);
  });
});

describe('insideProject path normalization', () => {
  const { insideProject } = require('../server.js');
  let alias;
  beforeAll(() => {
    alias = path.join(os.tmpdir(), `studio-alias-${process.pid}-${Date.now()}`);
    fs.symlinkSync(dir, alias);
  });
  afterAll(() => { try { fs.unlinkSync(alias); } catch {} });

  it('accepts files under a trailing-slash or relative project dir', () => {
    expect(insideProject(path.join(dir, 'ok.json'), dir + path.sep)).toBe(true);
    const rel = path.relative(process.cwd(), dir) || '.';
    expect(insideProject(path.join(dir, 'ok.json'), rel)).toBe(true);
    expect(insideProject(path.join(dir, 'new-file.json'), dir + path.sep)).toBe(true);
  });

  it('accepts an event path spelled through a symlinked alias of the project dir', () => {
    expect(insideProject(path.join(alias, 'ok.json'), dir)).toBe(true);
    expect(insideProject(path.join(dir, 'ok.json'), alias)).toBe(true);
    expect(insideProject(path.join(alias, 'not-yet.json'), dir)).toBe(true);
  });

  it('still rejects paths outside the project and symlinks escaping it', () => {
    expect(insideProject(path.join(outside, 'secret.json'), dir)).toBe(false);
    expect(insideProject(path.join(dir, 'link', 'secret.json'), dir)).toBe(false);
    expect(insideProject(path.join(dir, 'link', 'missing.json'), dir)).toBe(false);
    expect(insideProject(path.join(dir, '..', 'x.json'), dir)).toBe(false);
  });
});
