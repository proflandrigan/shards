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

describe('Studio standalone (no runtime/)', () => {
  it('lists agents from the bundled agents-catalog.json and reads INDEX.json read-only', () => {
    const { execFileSync } = require('node:child_process');
    const pkg = path.dirname(require.resolve('../server.js'));
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-standalone-'));
    for (const f of fs.readdirSync(pkg)) {
      if (f.endsWith('.js')) fs.copyFileSync(path.join(pkg, f), path.join(copy, f));
    }
    fs.writeFileSync(path.join(copy, 'agents-catalog.json'), JSON.stringify({ version: 1, agents: [
      { id: 'syn', description: 'Orch', activation: ['switch', 'consult'] },
      { id: 'researcher', description: 'R', activation: ['consult'] },
    ] }));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-standalone-proj-'));
    fs.mkdirSync(path.join(proj, '.shards', 'sessions'), { recursive: true });
    fs.mkdirSync(path.join(proj, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(proj, '.claude', 'agents', 'old.md'), '---\ndescription: v1\n---\n');
    fs.writeFileSync(path.join(proj, '.shards', 'sessions', 'INDEX.json'), JSON.stringify({ version: 1, sessions: [
      { sessionId: 'a', agent: 'syn', status: 'ended', createdAt: '2026-01-01T00:00:00Z' },
      { sessionId: 'b', agent: 'syn', status: 'active', createdAt: '2026-02-01T00:00:00Z' },
    ] }));
    const script = `
      const s = require(${JSON.stringify(path.join(copy, 'server.js'))});
      s.createServer(${JSON.stringify(proj)}, { port: 0 }).then(async (srv) => {
        const http = require('http');
        const body = await new Promise((r) => http.get({ host: '127.0.0.1', port: srv.port, path: '/sessions/index', headers: { Authorization: 'Bearer ' + srv.authToken } }, (res) => { let b=''; res.on('data', c => b += c); res.on('end', () => r(b)); }));
        console.log(JSON.stringify({ agents: s.listAgents().map(a => a.name), index: JSON.parse(body).sessions.map(x => x.sessionId) }));
        srv.shutdown(); process.exit(0);
      });`;
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }).trim().split('\n').pop());
    expect(out.agents).toEqual(['syn']);
    expect(out.index).toEqual(['b', 'a']);
    fs.rmSync(copy, { recursive: true, force: true });
    fs.rmSync(proj, { recursive: true, force: true });
  });
});
