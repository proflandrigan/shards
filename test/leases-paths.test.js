import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const L = require('../runtime/leases');

let root; let s;
beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'leasep-')); s = { root, sessionKey: 'sess-a' };
  await L.openLease(s, { owner: 'fanout', worker_type: 'ml-engineer', slices: [{ id: 'a', paths: ['models/p1', 'docs/x.md'] }] });
});

describe('isPathAllowed', () => {
  it('allows in slice, denies out', () => {
    expect(L.isPathAllowed(s, 'ml-engineer', 'models/p1/train.py').allowed).toBe(true);
    expect(L.isPathAllowed(s, 'ml-engineer', 'models/p1').allowed).toBe(true);
    expect(L.isPathAllowed(s, 'ml-engineer', './docs/x.md').allowed).toBe(true);
    const r = L.isPathAllowed(s, 'ml-engineer', 'models/p10/a.py');
    expect(r.allowed).toBe(false); expect(r.lease_id).toMatch(/^lease-/);
    expect(L.isPathAllowed(s, 'ml-engineer', 'src/a.js').allowed).toBe(false);
  });
  it('absolute paths resolve against root; escapes denied', () => {
    expect(L.isPathAllowed(s, 'ml-engineer', path.join(root, 'models/p1/a.py')).allowed).toBe(true);
    expect(L.isPathAllowed(s, 'ml-engineer', '/etc/passwd').allowed).toBe(false);
    expect(L.isPathAllowed(s, 'ml-engineer', '../outside').allowed).toBe(false);
    expect(L.isPathAllowed(s, 'ml-engineer', 'models/p1/../../x').allowed).toBe(false);
  });
  it('other agents unconstrained; expired lease unconstrains', () => {
    expect(L.isPathAllowed(s, 'data-analyst', 'anything')).toEqual({ allowed: true, lease_id: null, reason: 'no active lease for agent' });
    expect(L.isPathAllowed(s, 'ml-engineer', 'src/a.js', Date.now() + 10 * 3600e3).allowed).toBe(true);
  });
  it('pathsOverlap is segment-aware', () => {
    expect(L.pathsOverlap('a/b', 'a/b')).toBe(true);
    expect(L.pathsOverlap('a', 'a/b/c')).toBe(true);
    expect(L.pathsOverlap('a/b/c', 'a')).toBe(true);
    expect(L.pathsOverlap('a/b', 'a/bc')).toBe(false);
  });
});
