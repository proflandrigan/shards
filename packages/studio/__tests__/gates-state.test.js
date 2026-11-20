import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const gs = require('../gates-state.js');

let shards;
function writeGates(session, gates) {
  const d = path.join(shards, 'state', 'sessions', session);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'gates.json'), JSON.stringify({ gates }));
}

beforeEach(() => { shards = fs.mkdtempSync(path.join(os.tmpdir(), 'gates-state-')); });
afterEach(() => { fs.rmSync(shards, { recursive: true, force: true }); });

describe('readGateState (v2 runtime gates.json)', () => {
  it('is closed with no sessions', () => {
    expect(gs.readGateState(shards)).toEqual({ open: false, pending: [], history: [] });
  });

  it('reports the newest pending gate and a confirm command', () => {
    writeGates('s1', {
      'a-phase-1': { id: 'a-phase-1', status: 'confirmed', kind: 'phase', phase: 1, decided_at: '2026-01-01T00:00:00Z' },
      'a-phase-2': { id: 'a-phase-2', status: 'pending', kind: 'phase', phase: 2, agent: 'ml-engineer', summary: 'done', requested_at: '2026-01-02T00:00:00Z' },
    });
    writeGates('s2', { 'b-phase-1': { id: 'b-phase-1', status: 'pending', kind: 'final', phase: 1, requested_at: '2026-01-01T00:00:00Z' } });
    const s = gs.readGateState(shards);
    expect(s).toMatchObject({ open: true, id: 'a-phase-2', session: 's1', phase: 2, kind: 'phase', agent: 'ml-engineer' });
    expect(s.confirmCommand).toBe(`shards gates confirm a-phase-2 --session s1 --root ${path.dirname(shards)}`);
    // The project root (parent of .shards) is quoted when it has special characters.
    const spaced = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gs sp ')), '.shards');
    const d = path.join(spaced, 'state', 'sessions', 's1');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'gates.json'), JSON.stringify({ gates: { g: { id: 'g', status: 'pending', requested_at: '2026-01-01T00:00:00Z' } } }));
    expect(gs.readGateState(spaced).confirmCommand).toBe(`shards gates confirm g --session s1 --root '${path.dirname(spaced)}'`);
    fs.rmSync(path.dirname(spaced), { recursive: true, force: true });
    expect(s.pending).toHaveLength(2);
    expect(s.history.map((h) => h.id)).toEqual(['a-phase-1']);
  });

  it('ignores corrupt files and falls back to closed', () => {
    const d = path.join(shards, 'state', 'sessions', 's1');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'gates.json'), '{half');
    expect(gs.readGateState(shards).open).toBe(false);
  });

  it('snapshot gives open gate id/phase, else last decided phase', () => {
    writeGates('s1', { g1: { id: 'g1', status: 'confirmed', phase: 3, decided_at: '2026-01-01T00:00:00Z' } });
    expect(gs.readGateSnapshot(shards)).toEqual({ phase: 3, gateOpenAtEnd: null });
    writeGates('s1', { g1: { id: 'g1', status: 'pending', phase: 4, requested_at: '2026-01-01T00:00:00Z' } });
    expect(gs.readGateSnapshot(shards)).toEqual({ phase: 4, gateOpenAtEnd: 'g1' });
  });

  it('signature changes when a gates.json changes', () => {
    writeGates('s1', { g1: { id: 'g1', status: 'pending' } });
    const a = gs.gateSignature(shards);
    writeGates('s1', { g1: { id: 'g1', status: 'confirmed', decided_at: 'x' } });
    expect(gs.gateSignature(shards)).not.toBe(a);
  });
});
