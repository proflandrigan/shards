import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { compile } = require('../build/compile.js');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(ROOT, 'core');

// Per-agent artifact types that must be emitted by the compiled output.
// Rendered form (build/render.js): `mcp__plugin_shards_shards__artifact_emit`(type="X", path=...
const EXPECTED = {
  'data-analyst': ['data-viewer', 'chart'],
  'analytics-engineer': ['dag'],
  'data-modeller': ['data-viewer'],
  'ml-engineer': ['experiment-dashboard', 'eval-dashboard', 'model-card'],
  'ai-engineer': ['experiment-dashboard', 'prompt-lab', 'eval-dashboard', 'model-card'],
  'data-scientist': ['experiment-dashboard'],
  'applied-ml-scientist': ['experiment-dashboard'],
  'deep-learning-engineer': ['experiment-dashboard'],
  syn: ['brainstorm', 'pr-review'],
};

function emitPattern(type) {
  // The tool name is wrapped in backticks by render.js, so allow an optional backtick before "(".
  return new RegExp('artifact_emit`?\\(type="' + type + '"');
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function readTree(dir) {
  if (!fs.existsSync(dir)) return '';
  return walk(dir).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

describe('UI mode fold into artifact_emit', () => {
  let outDir;

  beforeAll(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-fold-'));
    const r = compile({ bundleDeps: false, target: 'claude', coreDir: CORE, outDir });
    expect(r.errors).toEqual([]);
  });

  afterAll(() => {
    if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('no core/**/*ui_mode*.md files remain', () => {
    const leftovers = walk(CORE)
      .filter((f) => /ui_mode[^/]*\.md$/.test(f))
      .map((f) => path.relative(ROOT, f));
    expect(leftovers).toEqual([]);
  });

  it('no file under core references ui.port or ui-push', () => {
    const re = /ui\.port|ui-push/;
    const hits = walk(CORE)
      .filter((f) => re.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  for (const [id, types] of Object.entries(EXPECTED)) {
    it(`${id} compiled output emits ${types.join(', ')} via artifact_emit`, () => {
      const text = readTree(path.join(outDir, 'content', 'agents', id));
      expect(text.length).toBeGreaterThan(0);
      const missing = types.filter((t) => !emitPattern(t).test(text));
      expect(missing).toEqual([]);
    });
  }

  it('protocols compiled output emits notebook-walkthrough via artifact_emit', () => {
    const text = readTree(path.join(outDir, 'content', 'protocols'));
    expect(emitPattern('notebook-walkthrough').test(text)).toBe(true);
  });
});
