import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020');
const { ARTIFACT_TYPES, validateMeta, emitEvent } = require('../runtime/lib/events.js');
const tool = require('../runtime/tools/artifact_emit.js');

const dir = path.join(__dirname, '..', 'core', 'schema', 'artifacts');
const valid = {
  'data-viewer': { title: 'T' }, chart: { title: 'T', chart_type: 'bar' }, dag: { title: 'T' },
  'experiment-dashboard': { title: 'T', mode: 'autonomous-research' }, 'eval-dashboard': { title: 'T', variant: 'ml-engineer' },
  'model-card': { title: 'T' }, 'prompt-lab': { title: 'T' }, brainstorm: { title: 'T' },
  'pr-review': { title: 'PR #3', pr: 3 }, 'notebook-walkthrough': { title: 'T', panel_id: 'nw-1' }, close: { panel_id: 'x' },
};
// Missing-required / wrong-type variants.
const invalid = {
  'data-viewer': {}, chart: { chart_type: 'bar' }, dag: { title: '' }, 'experiment-dashboard': { title: 5 },
  'eval-dashboard': { title: 'T', variant: 'other' }, 'model-card': {}, 'prompt-lab': {}, brainstorm: {},
  'pr-review': { title: 'T' }, 'notebook-walkthrough': { title: 'T' }, close: { panel_id: '' },
};

describe('artifact schemas', () => {
  it('has all 11 types', () => expect(ARTIFACT_TYPES).toHaveLength(11));
  for (const t of ['data-viewer','chart','dag','experiment-dashboard','eval-dashboard','model-card','prompt-lab','brainstorm','pr-review','notebook-walkthrough','close']) {
    it(`${t}: schema compiles, valid passes, invalid rejected`, () => {
      const f = path.join(dir, `${t}.schema.json`);
      expect(fs.existsSync(f)).toBe(true);
      const ajv = new Ajv2020({ strict: false });
      expect(() => ajv.compile(JSON.parse(fs.readFileSync(f, 'utf8')))).not.toThrow();
      expect(validateMeta(t, valid[t]).valid).toBe(true);
      const r = validateMeta(t, invalid[t]);
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    });
  }
  it('close tolerates empty meta; extra fields allowed', () => {
    expect(validateMeta('close', {}).valid).toBe(true);
    expect(validateMeta('chart', { title: 'T', whatever: 1 }).valid).toBe(true);
  });
  it('unknown type rejected', () => expect(validateMeta('bogus', {}).valid).toBe(false));
});

describe('emit through validation', () => {
  const ctx = (root) => ({ root, sessionKey: 's', state: { read: () => ({ frames: [] }) } });
  it('valid writes a line; invalid meta throws a clear error and writes nothing; unknown type rejected', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-art-'));
    try {
      const f = path.join(root, '.shards', 'events.jsonl');
      for (const t of ARTIFACT_TYPES) {
        await emitEvent(ctx(root), { type: t, path: t === 'close' ? null : 'a/x.json', meta: valid[t] });
      }
      expect(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)).toHaveLength(11);
      await expect(emitEvent(ctx(root), { type: 'chart', path: 'a.json', meta: {} })).rejects.toThrow(/invalid meta for chart: .*title/);
      await expect(emitEvent(ctx(root), { type: 'bogus', path: 'a.json', meta: {} })).rejects.toThrow(/unknown event type/);
      expect(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)).toHaveLength(11);
      // via the tool handler
      const r = await tool.handler({ type: 'chart', path: 'a.json', meta: { title: 'T' } }, ctx(root));
      expect(r.data.ok).toBe(true);
      await expect(tool.handler({ type: 'dag', path: 'a.mmd' }, ctx(root))).rejects.toThrow(/invalid meta for dag/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
