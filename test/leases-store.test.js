import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const L = require('../runtime/leases');
const git = require('../runtime/git/leases.js');

let root; let s;
const spec = (over = {}) => ({ owner: 'task', worker_type: 'ml-engineer', slices: [{ id: 'a', paths: ['models/p1/'] }], ...over });
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'leases-')); s = { root, sessionKey: 'sess-a' }; });

describe('lease store', () => {
  it('opens, heartbeats, closes', async () => {
    const l = await L.openLease(s, spec({ slices: [{ id: 'a', paths: ['./models/p1/'] }] }));
    expect(l.id).toMatch(/^lease-[0-9a-f]{8}$/);
    expect(l.slices[0].paths).toEqual(['models/p1']);
    expect(l.status).toBe('active');
    expect(L.listActive(s)).toHaveLength(1);
    const h = await L.heartbeat(s, l.id);
    expect(Date.parse(h.expires_at)).toBeGreaterThanOrEqual(Date.parse(l.expires_at));
    expect((await L.closeLease(s, l.id)).status).toBe('closed');
    expect((await L.closeLease(s, l.id)).status).toBe('closed');
    expect(L.listActive(s)).toHaveLength(0);
    await expect(L.heartbeat(s, l.id)).rejects.toThrow();
    await expect(L.closeLease(s, 'lease-nope')).rejects.toThrow(/unknown/);
  });

  it('validates input', async () => {
    await expect(L.openLease(s, spec({ owner: 'x' }))).rejects.toThrow(/owner/);
    await expect(L.openLease(s, spec({ slices: [] }))).rejects.toThrow(/slices/);
    await expect(L.openLease(s, spec({ slices: [{ id: 'a', paths: [] }] }))).rejects.toThrow(/path/);
    await expect(L.openLease(s, spec({ slices: [{ id: 'a', paths: ['/abs'] }] }))).rejects.toThrow(/absolute/);
    await expect(L.openLease(s, spec({ slices: [{ id: 'a', paths: ['a/../b'] }] }))).rejects.toThrow(/\.\./);
    await expect(L.openLease(s, spec({ slices: [{ id: 'a', paths: [''] }] }))).rejects.toThrow();
  });

  it('expires by TTL and crashed-worker paths vanish', async () => {
    const l = await L.openLease(s, spec({ ttl_ms: 1000 }));
    expect(await git.getLeasedPaths(s)).toEqual(['models/p1']);
    const later = Date.now() + 5000;
    expect(L.listActive(s, later)).toHaveLength(0);
    expect(await L.expireStale(s, later)).toEqual([l.id]);
    expect(await L.expireStale(s, later)).toEqual([]);
    expect(await git.getLeasedPaths(s)).toEqual([]);
    await expect(L.heartbeat(s, l.id)).rejects.toThrow(/expired/);
  });

  it('getLeasedPaths is [] with no state and dedupes', async () => {
    expect(await git.getLeasedPaths(s)).toEqual([]);
    await L.openLease(s, spec());
    await L.openLease(s, spec({ worker_type: 'x' }));
    expect(await git.getLeasedPaths(s)).toEqual(['models/p1']);
    expect(await git.getLeasedPaths({ root, sessionKey: 'other' })).toEqual([]);
  });

  it('persists 10 concurrent opens', async () => {
    const r = await Promise.all(Array.from({ length: 10 }, (_, i) => L.openLease(s, spec({ slices: [{ id: `s${i}`, paths: [`d${i}`] }] }))));
    expect(new Set(r.map((x) => x.id)).size).toBe(10);
    expect(L.listActive(s)).toHaveLength(10);
  });
});
