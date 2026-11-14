import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { StateStore } = require('../runtime/state/store.js');
const { buildHeader, headerInfoFromStore } = require('../runtime/header.js');
const { createCorrelator } = require('../runtime/session/correlate.js');
const { toSessionKey } = require('../hooks/lib/host.js');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-iso-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const SA = '11111111-1111-4111-8111-111111111111';
const SB = '22222222-2222-4222-8222-222222222222';
function hs(file, sid, chain) {
  const dir = path.join(root, '.shards', 'state', 'handshake');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), JSON.stringify({ session_id: sid, source: 'startup', cwd: root, ts: new Date().toISOString(), pid: 1, ppid_chain: chain }));
}
function setup() {
  hs('1.json', SA, [101, 500]);
  hs('2.json', SB, [201, 500]);
  const ca = createCorrelator({ root, ancestry: () => [101, 500], env: {}, host: 'claude-code' }).resolve();
  const cb = createCorrelator({ root, ancestry: () => [201, 500], env: {}, host: 'claude-code' }).resolve();
  return { a: new StateStore(root, ca.key), b: new StateStore(root, cb.key), ka: ca.key, kb: cb.key };
}
const hdr = (s) => buildHeader(headerInfoFromStore(s));
const pendingGate = (agent) => ({ gates: { g1: { id: 'g1', status: 'pending', agent } } });

describe('session isolation (gate-audit Bug 1)', () => {
  it('keys are distinct and map from session ids', () => {
    const { ka, kb } = setup();
    expect(ka).toBe(toSessionKey(SA));
    expect(kb).toBe(toSessionKey(SB));
    expect(ka).not.toBe(kb);
  });

  it('(a) A pending gate does not appear in B header', async () => {
    const { a, b } = setup();
    await a.update('frames', () => ({ frames: [{ id: 'f1', agent: 'x', phase: 1 }] }));
    await a.update('gates', () => pendingGate('x'));
    await b.update('frames', () => ({ frames: [{ id: 'f2', agent: 'y', phase: 2 }] }));
    expect(hdr(a)).toContain('gate=g1');
    expect(hdr(b)).toContain('gate=-');
    expect(hdr(b)).toContain('agent=y');
  });

  it('(b) B writes do not discard or alter A pending gate', async () => {
    const { a, b } = setup();
    await a.update('frames', () => ({ frames: [{ id: 'f1', agent: 'x', phase: 1 }] }));
    await a.update('gates', () => pendingGate('x'));
    await b.update('frames', () => ({ frames: [{ id: 'f2', agent: 'y' }] }));
    await b.update('gates', () => ({ gates: {} }));
    expect(a.read('gates')).toEqual(pendingGate('x'));
    expect(hdr(a)).toContain('gate=g1');
  });

  it('(c) B confirming its own gate leaves A pending', async () => {
    const { a, b } = setup();
    await a.update('frames', () => ({ frames: [{ id: 'f1', agent: 'x' }] }));
    await b.update('frames', () => ({ frames: [{ id: 'f2', agent: 'x' }] }));
    await a.update('gates', () => pendingGate('x'));
    await b.update('gates', () => pendingGate('x'));
    await b.update('gates', (g) => { g.gates.g1.status = 'confirmed'; return g; });
    expect(a.read('gates').gates.g1.status).toBe('pending');
    expect(hdr(a)).toContain('gate=g1');
    expect(hdr(b)).toContain('gate=-');
  });

  it('(d) versions are per-session', async () => {
    const { a, b } = setup();
    await a.update('frames', () => ({ frames: [] }));
    const va = a.getVersion();
    await b.update('frames', () => ({ frames: [] }));
    await b.update('frames', () => ({ frames: [] }));
    expect(a.getVersion()).toBe(va);
    expect(b.getVersion()).toBe(2);
  });

  it('(e) sessions use separate directories under one root', async () => {
    const { a, b, ka, kb } = setup();
    await a.update('frames', () => ({ frames: [] }));
    await b.update('frames', () => ({ frames: [] }));
    const dirs = fs.readdirSync(path.join(root, '.shards', 'state', 'sessions')).sort();
    expect(dirs).toEqual([ka, kb].sort());
  });
});
