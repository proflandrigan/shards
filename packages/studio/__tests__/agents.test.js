// Studio agent listing and activation prompt (v2): agents come from
// core/agents/*/agent.yaml, sessions activate through the runtime `activate` tool.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let dir, srv, studio;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-agents-'));
  studio = require('../server.js');
  srv = await studio.createServer(dir, { port: 0 });
});
afterAll(() => {
  try { srv.shutdown(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('Studio agents (v2 core catalog)', () => {
  it('lists switchable agents from core/agents/*/agent.yaml without any .claude/agents dir', () => {
    const agents = studio.listAgents();
    const names = agents.map((a) => a.name);
    expect(names).toContain('syn');
    expect(names).toContain('data-scientist');
    const syn = agents.find((a) => a.name === 'syn');
    expect(syn.source).toBe('core');
    expect(syn.description).toMatch(/Orchestrator/);
  });

  it('POST /chat/start accepts a listed core agent with no .claude/agents dir, rejects unknown ones', async () => {
    const post = (body) => new Promise((resolve, reject) => {
      const s = JSON.stringify(body);
      const r = http.request({ host: '127.0.0.1', port: srv.port, path: '/chat/start', method: 'POST',
        headers: { Authorization: `Bearer ${srv.authToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
      r.on('error', reject);
      r.end(s);
    });
    expect((await post({ agent: 'no-such-agent' })).status).toBe(404);
    expect((await post({ agent: '../../etc/passwd' })).status).toBe(404);
    // A listed core agent starts; keep `claude` off PATH so the spawn fails harmlessly.
    const oldPath = process.env.PATH;
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-nopath-'));
    process.env.PATH = empty;
    try {
      const r = await post({ agent: 'syn' });
      expect(r.status).toBe(200);
      expect(JSON.parse(r.body).agent).toBe('syn');
    } finally {
      process.env.PATH = oldPath;
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('prefers the monorepo src/docs over a package docs/ copy (a failed pack can leave a stale one)', () => {
    const roots = studio.docRoots();
    const src = roots.indexOf(path.join(path.dirname(require.resolve('../server.js')), '..', '..', 'src', 'docs'));
    const pkg = roots.indexOf(path.join(path.dirname(require.resolve('../server.js')), 'docs'));
    expect(src).toBeGreaterThan(-1);
    expect(src).toBeLessThan(pkg);
  });

  it('builds a start prompt that calls the runtime activate tool', () => {
    const p = studio.buildActivationPrompt('data-scientist');
    expect(p).toContain('activate');
    expect(p).toContain('agent="data-scientist"');
    expect(p).toContain('mode="switch"');
    expect(p).not.toMatch(/\.claude\/commands/);
  });
});
