import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
const require = createRequire(import.meta.url);
const { regroundHook, buildReground } = require('../runtime/reground');
const { StateStore } = require('../runtime/state/store');
const { pushFrame } = require('../runtime/stack');
const { buildFixture, SHAS } = require('../scripts/reground-fixture');
const sessionStart = require('../hooks/session-start');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rg-'));

describe('regroundHook', () => {
  for (const event of ['activate', 'load_phase', 'compact', 'resume']) {
    it(`${event} renders the full block`, async () => {
      const fx = await buildFixture();
      const { text } = await regroundHook(event, { root: fx.root, sessionKey: fx.sessionKey });
      expect(text).toMatch(/Who: Syn's condescending/);
      expect(text).toContain('Current phase: 4 (track deep)');
      expect(text).toContain('Project: churn-study');
      for (const sha of SHAS) expect(text).toContain(`sha=${sha.slice(0, 12)}`);
      expect(text).not.toContain(SHAS[0]); // short form only
      expect(text).toMatch(/data-scientist-phase-4 \(pending, kind phase, phase 4\) -> wait for the user; do NOT re-request confirmed gates/);
      expect(text).toContain('Copy queue: (empty)');
      expect(text).toContain('Do not re-ask for gates listed as confirmed.');
    });
  }
  it('shows commit_pending and suspended gates and the frame stack', async () => {
    const fx = await buildFixture();
    await pushFrame(fx.state, { agent: 'researcher', project: 'x' });
    await fx.state.update('gates', (cur) => {
      cur.gates['data-scientist-phase-2'].commit = { outcome: 'commit_pending' };
      cur.gates['data-scientist-phase-4'].status = 'suspended';
      return cur;
    });
    const { text } = await regroundHook('compact', { root: fx.root, sessionKey: fx.sessionKey });
    expect(text).toContain('Frame stack: data-scientist > researcher');
    expect(text).toContain('data-scientist-phase-2 commit_pending');
    expect(text).toMatch(/data-scientist-phase-4 \(suspended/);
  });
  it('caps a long confirmed list at 15 and counts the rest', async () => {
    const fx = await buildFixture();
    await fx.state.update('gates', (cur) => {
      for (let i = 10; i < 40; i++) {
        const id = `g-${i}`;
        cur.gates[id] = { id, status: 'confirmed', kind: 'phase', phase: i, updated_at: new Date(Date.now() + 100000 + i).toISOString(), commit: { outcome: 'committed', sha: 'f'.repeat(40) } };
      }
      return cur;
    });
    const { text } = await regroundHook('compact', { root: fx.root, sessionKey: fx.sessionKey });
    expect(text.match(/^ {2}- .* sha=/gm)).toHaveLength(15);
    expect(text).toMatch(/\(18 earlier confirmed gates not shown\)/);
    expect(text).toContain('g-39');
    expect(text).not.toContain('g-10 ');
  });
  it('is safe with no frames and no gates', async () => {
    const root = tmp();
    const ctx = { root, sessionKey: 'empty' };
    expect(await regroundHook('compact', ctx)).toEqual({ event: 'compact', text: '' });
    expect(await regroundHook('resume', ctx)).toEqual({ event: 'resume', text: '' });
    expect(() => buildReground(ctx)).not.toThrow();
    expect(await regroundHook('compact', {})).toEqual({ event: 'compact', text: '' });
  });
  it('version_change is a documented no-op', async () => {
    const fx = await buildFixture();
    expect((await regroundHook('version_change', { root: fx.root, sessionKey: fx.sessionKey })).text).toBe('');
  });
});

describe('session-start shim handler', () => {
  it('returns additionalContext JSON for compact with a fixture session, nothing for startup', async () => {
    const fx = await buildFixture();
    const sid = fx.sessionKey; // toSessionKey passes safe ids through
    const mk = (source) => ({ sessionId: sid, source, host: 'claude-code', cwd: fx.root });
    const out = await sessionStart.handler(mk('compact'), fx.root);
    const j = JSON.parse(out);
    expect(j.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(j.hookSpecificOutput.additionalContext).toContain(`sha=${SHAS[1].slice(0, 12)}`);
    expect(j.hookSpecificOutput.additionalContext).toContain('Do not re-ask for gates listed as confirmed.');
    expect(JSON.parse(await sessionStart.handler(mk('resume'), fx.root)).hookSpecificOutput.additionalContext).toContain('Re-ground');
    expect(await sessionStart.handler(mk('startup'), fx.root)).toBe('');
  });
});
