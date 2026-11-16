import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { compile } = require('../build/compile.js');

const root = path.join(__dirname, '..');
const protocol = fs.readFileSync(path.join(root, 'core/protocols/sources.md'), 'utf8');
let out;

beforeAll(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-sources-'));
  const r = compile({ target: 'claude', outDir: out, strict: true });
  expect(r.errors).toEqual([]);
});

describe('sources protocol', () => {
  it('is at most 80 lines', () => {
    expect(protocol.trimEnd().split('\n').length).toBeLessThanOrEqual(80);
  });
  it('covers the four required behaviours', () => {
    expect(protocol).toContain('{{knowledge.search query="');
    expect(protocol).toMatch(/Sources/);
    expect(protocol).toMatch(/cite/i);
    expect(protocol).toMatch(/re-check/i);
    expect(protocol).toMatch(/write-back/i);
    expect(protocol).toMatch(/summaries only/i);
    expect(protocol).toContain('[shards-gate:<id>]');
  });
  it('has no self-reference', () => {
    expect(protocol).not.toContain('{{protocol sources}}');
  });
  it('compiles into the build output', () => {
    expect(fs.existsSync(path.join(out, 'content/protocols/sources.md'))).toBe(true);
  });
});

describe('specialists load sources', () => {
  const closing = { 'data-analyst': 'phase-4.md', 'data-scientist': 'phase-7.md' };
  for (const agent of Object.keys(closing)) {
    it(`${agent} loads sources before Phase 1`, () => {
      const text = fs.readFileSync(path.join(out, 'content/agents', agent, 'AGENT.md'), 'utf8');
      expect(text).toContain('content/protocols/sources.md');
      expect(text).not.toContain('knowledge_retrieval');
    });
    it(`${agent} proposes write-backs at close`, () => {
      const text = fs.readFileSync(path.join(out, 'content/agents', agent, 'phases', closing[agent]), 'utf8');
      expect(text).toMatch(/write-back/i);
      expect(text).not.toContain('knowledge_harvest');
    });
  }
});
