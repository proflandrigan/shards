import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const gates = require('../runtime/gates');
const fanout = require('../runtime/fanout');
const gitLeases = require('../runtime/git/leases.js');

let root; let state; let sess;
const slices = (o = {}) => [{ id: 'a', paths: ['models/a/'], acceptance: 'ok a' }, { id: 'b', paths: ['models/b/'], acceptance: 'ok b', ...o }];

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-'));
  state = new StateStore(root, 's1');
  sess = { root, sessionKey: 's1', state };
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});

describe('startFanout', () => {
  it('is accepted without a pending gate and returns contract cards', async () => {
    const { lease, cards } = await fanout.startFanout(sess, { agent: 'ml-engineer', slices: slices() });
    expect(lease.owner).toBe('fanout');
    expect(lease.meta).toMatchObject({ fanout: true, acceptance: { a: 'ok a', b: 'ok b' } });
    expect(cards).toEqual([
      expect.objectContaining({ lease_id: lease.id, slice_id: 'a', owned_paths: ['models/a'], acceptance: 'ok a' }),
      expect.objectContaining({ slice_id: 'b', owned_paths: ['models/b'] }),
    ]);
    expect(cards[0].rules).toMatch(/no gates/);
  });
  it('is refused with a pending gate', async () => {
    const frame = (state.read('frames').frames || []).slice(-1)[0];
    await gates.requestGate(sess, { frame, id: 'g1', kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
    await expect(fanout.startFanout(sess, { agent: 'ml-engineer', slices: slices() })).rejects.toThrow(/pending gate/);
  });
  it('rejects overlapping slices, duplicate ids, empty acceptance', async () => {
    await expect(fanout.startFanout(sess, { agent: 'ml-engineer', slices: slices({ paths: ['models/a/sub'] }) })).rejects.toThrow(/overlapping/);
    await expect(fanout.startFanout(sess, { agent: 'ml-engineer', slices: slices({ id: 'a' }) })).rejects.toThrow(/duplicate/);
    await expect(fanout.startFanout(sess, { agent: 'ml-engineer', slices: slices({ acceptance: ' ' }) })).rejects.toThrow(/acceptance/);
  });
  it('rejects unknown agents and agents without fanout_worker', async () => {
    await expect(fanout.startFanout(sess, { agent: 'nope', slices: slices() })).rejects.toThrow(/unknown agent/);
    await expect(fanout.startFanout(sess, { agent: 'researcher', slices: slices() })).rejects.toThrow(/fanout_worker/);
  });
  it('lease holds slice paths so gate commits exclude them', async () => {
    await fanout.startFanout(sess, { agent: 'ml-engineer', slices: slices() });
    expect(await gitLeases.getLeasedPaths(sess)).toEqual(expect.arrayContaining(['models/a', 'models/b']));
  });
});
