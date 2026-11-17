import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { compile } = require('../build/compile');
const pkg = require('../package.json');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agent-skills-'));

describe('generic agent-skills target (E9.2)', () => {
  const out = tmp();
  const r = compile({ target: 'skills', outDir: out });
  const j = (f) => JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));

  it('builds cleanly with Agent Skills layout', () => {
    expect(r.errors).toEqual([]);
    for (const s of ['syn', 'agents', 'resume']) {
      const t = fs.readFileSync(path.join(out, 'skills', s, 'SKILL.md'), 'utf8');
      expect(t).toMatch(/^---\nname: /);
      expect(t).toContain(`name: ${s}`);
    }
    expect(fs.existsSync(path.join(out, 'content', 'agents', 'syn', 'AGENT.md'))).toBe(true);
  });

  it('emits an Agent Plugins plugin.json pointing at skills/ and mcp.json', () => {
    const p = j('plugin.json');
    expect(p).toMatchObject({ name: 'shards', version: pkg.version, skills: './skills/', mcp: './mcp.json' });
    expect(typeof p.description).toBe('string');
    expect(fs.existsSync(path.join(out, p.skills))).toBe(true);
    expect(fs.existsSync(path.join(out, p.mcp))).toBe(true);
  });

  it('mcp.json declares the shards server via the published runtime package', () => {
    const m = j('mcp.json');
    expect(Object.keys(m.mcpServers)).toEqual(['shards']);
    expect(m.mcpServers.shards.command).toBe('npx');
    expect(m.mcpServers.shards.args).toContain('@proflandrigan/shards-mcp@next');
  });

  it('is deterministic and the codex target does not get these files', () => {
    const o2 = tmp();
    compile({ target: 'skills', outDir: o2 });
    expect(fs.readFileSync(path.join(o2, 'plugin.json'), 'utf8')).toBe(fs.readFileSync(path.join(out, 'plugin.json'), 'utf8'));
    const o3 = tmp();
    compile({ target: 'codex', outDir: o3, bundleDeps: false });
    expect(fs.existsSync(path.join(o3, 'mcp.json'))).toBe(false);
    for (const d of [o2, o3, out]) fs.rmSync(d, { recursive: true, force: true });
  });
});
