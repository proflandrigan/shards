import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { Registry } = require('../runtime/registry');
const { loadTools } = require('../runtime/tools');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const leases = require('../runtime/leases');
const fanout = require('../runtime/fanout');

let root; let state; let reg;
const call = (name, args) => reg.call(name, args, { root, getConfig: () => ({ config: {} }), state, sessionKey: 's1' });
const text = (r) => r.content[1].text;
const slices = () => [{ id: 'a', paths: ['models/a/'], acceptance: 'ok a' }, { id: 'b', paths: ['models/b/'], acceptance: 'ok b' }];
const res = (a, b) => [{ slice_id: 'a', verdict: a }, { slice_id: 'b', verdict: b }];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fo-'));
  state = new StateStore(root, 's1');
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});

describe('mergeVerdicts rule table', () => {
  const lease = { slices: [{ id: 'a' }, { id: 'b' }] };
  const V = ['APPROVED', 'NEEDS REVISION', 'BLOCKED'];
  for (const a of V) for (const b of V) {
    const expected = [a, b].includes('BLOCKED') ? 'BLOCKED' : [a, b].includes('NEEDS REVISION') ? 'NEEDS REVISION' : 'APPROVED';
    it(`${a} + ${b} -> ${expected}`, () => {
      const m = fanout.mergeVerdicts(res(a, b), lease);
      expect(m.verdict).toBe(expected);
      expect(m.per_slice.a.verdict).toBe(a);
    });
  }
  it('rejects unknown, duplicate, missing and invalid', () => {
    expect(() => fanout.mergeVerdicts([...res('APPROVED', 'APPROVED'), { slice_id: 'z', verdict: 'APPROVED' }], lease)).toThrow(/unknown slice/);
    expect(() => fanout.mergeVerdicts([...res('APPROVED', 'APPROVED'), { slice_id: 'a', verdict: 'APPROVED' }], lease)).toThrow(/duplicate/);
    expect(() => fanout.mergeVerdicts([{ slice_id: 'a', verdict: 'APPROVED' }], lease)).toThrow(/missing/);
    expect(() => fanout.mergeVerdicts(res('APPROVED', 'MAYBE'), lease)).toThrow(/invalid verdict/);
  });
});

describe('tools', () => {
  it('are registered', () => {
    const names = loadTools().map((t) => t.name);
    for (const n of ['fanout_start', 'fanout_claim', 'fanout_collect']) expect(names).toContain(n);
  });
  it('start -> claim -> collect closes the lease', async () => {
    const s = await call('fanout_start', { agent: 'ml-engineer', slices: slices() });
    expect(s.isError).toBeFalsy();
    const data = JSON.parse(text(s).slice(text(s).indexOf('{\n')));
    expect(data.cards).toHaveLength(2);
    const c = await call('fanout_claim', { lease_id: data.lease_id, slice_id: 'a' });
    expect(JSON.parse(text(c))).toMatchObject({ slice_id: 'a', owned_paths: ['models/a'], acceptance: 'ok a' });
    expect((await call('fanout_claim', { lease_id: data.lease_id, slice_id: 'zz' })).isError).toBe(true);
    expect((await call('fanout_collect', { lease_id: data.lease_id, results: [{ slice_id: 'a', verdict: 'APPROVED' }] })).isError).toBe(true);
    const r = await call('fanout_collect', { lease_id: data.lease_id, results: res('APPROVED', 'NEEDS REVISION') });
    expect(text(r)).toContain('NEEDS REVISION');
    expect(leases.listActive({ root, sessionKey: 's1', state })).toHaveLength(0);
    expect((await call('fanout_claim', { lease_id: data.lease_id, slice_id: 'a' })).isError).toBe(true);
  });
});
