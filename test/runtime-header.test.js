import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { buildHeader, estimateTokens, HEADER_TOKEN_LIMIT } = require('../runtime/header.js');
const { regroundHook, shouldReground } = require('../runtime/reground.js');

const RE = /^\[shards v\d+ \| agent=\S+ ph=\S+ gate=\S+ q=\d+\]$/;

describe('header', () => {
  it('defaults', () => {
    expect(buildHeader()).toBe('[shards v0 | agent=- ph=- gate=- q=0]');
  });
  it('format', () => {
    const h = buildHeader({ version: 12, agent: 'data-analyst', phase: 2, gate: null, queued: 0 });
    expect(h).toBe('[shards v12 | agent=data-analyst ph=2 gate=- q=0]');
    expect(h).toMatch(RE);
  });
  it('worst case stays within token limit', () => {
    const long = 'x'.repeat(500);
    const h = buildHeader({ version: 123456789, agent: long, phase: long, gate: long, queued: 99999999 });
    expect(h).toMatch(RE);
    expect(estimateTokens(h)).toBeLessThanOrEqual(HEADER_TOKEN_LIMIT);
  });
});

describe('reground stub', () => {
  it('returns empty text', async () => {
    expect(await regroundHook('activate', {})).toEqual({ event: 'activate', text: '' });
    expect(shouldReground(1, 2)).toBe(true);
    expect(shouldReground(2, 2)).toBe(false);
  });
});
