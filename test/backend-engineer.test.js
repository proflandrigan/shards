import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const { compile } = require('../build/compile.js');
const { tmpDir } = require('./build-fixture.js');

const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');

function build(target) {
  const out = tmpDir();
  const r = compile({ bundleDeps: false, target, outDir: out });
  expect(r.errors).toEqual([]);
  return out;
}

function expectSubagentRules(text) {
  expect(text).toMatch(/cruft/i);
  expect(text).toMatch(/duplication/i);
  expect(text).toMatch(/overly complex code/i);
  expect(text).toMatch(/unnecessary wrappers/i);
  expect(text).toMatch(/subagent spawned to review code[\s\S]*apply\s+`?modes\/review_checklist\.md`?\s+in full/i);
}

describe('backend-engineer cleanliness and checklist propagation', () => {
  const claudeOut = build('claude');
  const codexOut = build('codex');

  it('compiles claude and codex targets cleanly', () => {
    expect(fs.existsSync(path.join(claudeOut, 'content/agents/backend-engineer/AGENT.md'))).toBe(true);
    expect(fs.existsSync(path.join(codexOut, 'content/agents/backend-engineer/AGENT.md'))).toBe(true);
  });

  it('covers simplicity, duplication, and cruft in modes/review_checklist.md', () => {
    for (const out of [claudeOut, codexOut]) {
      const checklist = read(out, 'content/agents/backend-engineer/modes/review_checklist.md');
      expect(checklist).toContain('## Simplicity, Duplication and Cruft');
      expect(checklist).toMatch(/cruft/i);
      expect(checklist).toMatch(/duplication/i);
      expect(checklist).toMatch(/overly complex code/i);
      expect(checklist).toMatch(/unnecessary wrappers/i);
    }
  });

  it('propagates cleanliness and checklist rules to all emitted subagent prompts', () => {
    const claudeFiles = [
      'agents/backend-engineer.md',
      'agents/backend-engineer-review.md',
      'agents/backend-engineer-service.md',
      'agents/backend-engineer-worker.md',
    ];
    for (const rel of claudeFiles) {
      expectSubagentRules(read(claudeOut, rel));
    }

    const codexFiles = fs
      .readdirSync(path.join(codexOut, '.codex/agents'))
      .filter((f) => f.startsWith('backend-engineer') && f.endsWith('.toml'))
      .sort();
    expect(codexFiles).toEqual([
      'backend-engineer-review.toml',
      'backend-engineer-service.toml',
      'backend-engineer-worker.toml',
      'backend-engineer.toml',
    ]);
    for (const file of codexFiles) {
      expectSubagentRules(read(codexOut, '.codex/agents', file));
    }
  });

  it('includes Simplicity, Duplication & Cruft and spawned-subagent checklist rules in AGENT.md', () => {
    for (const out of [claudeOut, codexOut]) {
      const agent = read(out, 'content/agents/backend-engineer/AGENT.md');
      expect(agent).toContain('#### Simplicity, Duplication & Cruft');
      expect(agent).toContain('Propagate the full checklist to spawned review subagents');
      expect(agent).toMatch(/spawn review subagents[\s\S]*modes\/review_checklist\.md[\s\S]*in full/i);
    }
  });
});
