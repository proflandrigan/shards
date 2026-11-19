// Studio agent listing and activation prompt (v2): agents come from
// core/agents/*/agent.yaml, sessions activate through the runtime `activate` tool.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  it('builds a start prompt that calls the runtime activate tool', () => {
    const p = studio.buildActivationPrompt('data-scientist');
    expect(p).toContain('activate');
    expect(p).toContain('agent="data-scientist"');
    expect(p).toContain('mode="switch"');
    expect(p).not.toMatch(/\.claude\/commands/);
  });
});
