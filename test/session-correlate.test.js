import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createCorrelator, SessionCorrelationError, FALLBACK_POLICY, HOST_SESSION_ENV, detectHostName, readHandshakes, matchHandshake } = require('../runtime/session/correlate.js');

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-corr-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const SID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function hs(file, { sid, chain, ts = new Date().toISOString(), source = 'startup', raw }) {
  const dir = path.join(root, '.shards', 'state', 'handshake');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), raw !== undefined ? raw : JSON.stringify({ session_id: sid, source, cwd: root, ts, pid: 1, ppid_chain: chain }));
}
const mk = (anc, extra = {}) => createCorrelator({ root, ancestry: () => anc, env: {}, host: 'claude-code', ...extra });

describe('correlate', () => {
  it('matches by ancestry intersection', () => {
    hs('1.json', { sid: SID(1), chain: [50, 60, 70] });
    hs('2.json', { sid: SID(2), chain: [51, 61] });
    const r = mk([10, 60, 20]).resolve();
    expect(r).toMatchObject({ key: SID(1), source: 'handshake', host: 'claude-code' });
  });

  it('prefers the nearest matching ancestor (shared shell)', () => {
    // shared shell 500 is far; each session has its own nearer claude pid
    hs('a.json', { sid: SID(1), chain: [101, 500] });
    hs('b.json', { sid: SID(2), chain: [201, 500], ts: new Date(Date.now() + 5000).toISOString() });
    expect(mk([101, 500]).resolve().key).toBe(SID(1));
    expect(mk([201, 500]).resolve().key).toBe(SID(2));
  });

  it('newest ts wins on equal distance and a later handshake re-keys', () => {
    const t0 = Date.now() - 10000;
    hs('a.json', { sid: SID(1), chain: [101], ts: new Date(t0).toISOString() });
    const c = mk([101]);
    expect(c.resolve().key).toBe(SID(1));
    hs('b.json', { sid: SID(2), chain: [101], source: 'clear', ts: new Date(t0 + 5000).toISOString() });
    expect(c.resolve().key).toBe(SID(2));
  });

  it('ignores stale, garbage, and invalid-session files', () => {
    hs('old.json', { sid: SID(1), chain: [101], ts: new Date(Date.now() - 25 * 3600 * 1000).toISOString() });
    hs('junk.json', { raw: '{not json' });
    hs('nochain.json', { sid: SID(2), chain: [] });
    hs('badsid.json', { sid: '', chain: [101] });
    hs('notobj.json', { raw: '5' });
    expect(readHandshakes(root)).toEqual([]);
    expect(mk([101]).resolve().source).toBe('process');
  });

  it('PID-reuse guard via startTimeMs', () => {
    const old = new Date(Date.now() - 60000).toISOString();
    hs('a.json', { sid: SID(1), chain: [101], ts: old });
    const anc = () => [101];
    anc.startTimeMs = () => Date.now() - 1000; // process started after the handshake
    expect(createCorrelator({ root, ancestry: anc, env: {}, host: "claude-code" }).resolve().source).toBe("process");
    expect(matchHandshake(readHandshakes(root), [101], {}).key).toBe(SID(1));
  });

  it('no match: process key on claude-code, stable across calls', () => {
    const c = mk([101]);
    const a = c.resolve();
    expect(a.source).toBe('process');
    expect(a.key).toMatch(/^mcp-/);
    expect(c.resolve().key).toBe(a.key);
  });

  it.each(['codex', 't3', 'unknown'])('no match on %s refuses with a clear error', (h) => {
    const c = mk([101], { host: h });
    let err;
    try { c.resolve(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(SessionCorrelationError);
    expect(err.code).toBe('SESSION_FALLBACK_REFUSED');
    expect(err.message).toContain(h);
    expect(err.message).toContain('SessionStart hook');
    expect(err.message).toContain('SHARDS_ASSUME_ONE_PROCESS_PER_SESSION=1');
  });

  it('override env allows the process key', () => {
    const c = mk([101], { host: 'codex', env: { SHARDS_ASSUME_ONE_PROCESS_PER_SESSION: '1' } });
    expect(c.resolve().source).toBe('process');
  });

  it('cached while dir unchanged; invalidated by ancestry change', () => {
    hs('a.json', { sid: SID(1), chain: [101] });
    let anc = [101];
    const c = createCorrelator({ root, ancestry: () => anc, env: {}, host: 'claude-code' });
    const r1 = c.resolve();
    expect(c.resolve()).toBe(r1);
    anc = [999];
    expect(c.resolve().source).toBe('process');
  });

  it('policy table and helpers', () => {
    expect(Object.keys(FALLBACK_POLICY).sort()).toEqual(['claude-code', 'codex', 't3', 'unknown']);
    expect(FALLBACK_POLICY['claude-code'].allowProcessKey).toBe(true);
    expect(HOST_SESSION_ENV).toEqual({});
    expect(detectHostName({ SHARDS_HOST: 't3' })).toBe('t3');
    expect(detectHostName({ SHARDS_HOST: 'codex' })).toBe('codex');
    expect(detectHostName({})).toBe('claude-code');
  });
});
