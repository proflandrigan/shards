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
const gates = require('../runtime/gates');
const av = require('../runtime/auto-verify');
const { isAutoApprovable, maskQuotedRegions } = require('../runtime/lib/auto-allowlist');

let root; let state; let reg; let sess;
const ctxFor = (st, key) => ({ root, getConfig: () => ({ config: {} }), state: st, sessionKey: key });
const start = (args = {}, st = state, key = 's1') => reg.call('auto_verify_start', { agent: 'data-analyst', phase: 3, tool_budget: 5, ttl_s: 60, ...args }, ctxFor(st, key));
const text = (r) => r.content[1].text;
const BASH = (command) => ({ command });

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'av-'));
  state = new StateStore(root, 's1');
  sess = { root, sessionKey: 's1', state };
  reg = new Registry(loadTools());
  await pushFrame(state, { agent: 'data-analyst', project: 'p' });
});

describe('auto_verify tools', () => {
  it('start validates args, scope, and reports budget/TTL', async () => {
    expect((await start({ tool_budget: 0 })).isError).toBe(true);
    expect((await start({ tool_budget: 201 })).isError).toBe(true);
    expect((await start({ ttl_s: 29 })).isError).toBe(true);
    expect((await start({ ttl_s: 3601 })).isError).toBe(true);
    expect((await start({ tool_budget: 1.5 })).isError).toBe(true);
    const wrong = await start({ agent: 'ml-engineer' });
    expect(wrong.isError).toBe(true);
    expect(text(wrong)).toMatch(/active agent is data-analyst/);
    const r = await start();
    expect(r.isError).toBeFalsy();
    expect(text(r)).toMatch(/Budget: 5/);
    expect(text(r)).toMatch(/TTL: 60s/);
    expect(text(r)).toMatch(/Gates always win/);
    expect(av.get(sess)).toMatchObject({ active: true, used: 0, tool_budget: 5 });
  });
  it('refuses a second start while active, allows after end', async () => {
    await start();
    expect((await start()).isError).toBe(true);
    const e = await reg.call('auto_verify_end', {}, ctxFor(state, 's1'));
    expect(text(e)).toMatch(/ended after 0 of 5/);
    expect(av.get(sess)).toMatchObject({ active: false, end_reason: 'ended_by_agent' });
    expect((await start()).isError).toBeFalsy();
  });
  it('end with no block is harmless; start without a frame is refused', async () => {
    expect(text(await reg.call('auto_verify_end', {}, ctxFor(state, 's1')))).toMatch(/No auto-verify block/);
    const other = new StateStore(root, 's2');
    expect((await start({}, other, 's2')).isError).toBe(true);
  });
  it('start refused when the top frame has a pending gate', async () => {
    const frame = (state.read('frames').frames || []).slice(-1)[0];
    await gates.requestGate(sess, { frame, id: 'g1', kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
    const r = await start();
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Gates always win/);
  });
});

describe('check()', () => {
  it('denies when no block is active', async () => {
    expect(await av.check(sess, 'Read', {})).toMatchObject({ approve: false });
    expect(av.isActive(sess)).toBe(false);
  });
  it('approves allowlisted calls and consumes budget; non-allowlisted do not consume', async () => {
    await start({ tool_budget: 3 });
    expect(av.isActive(sess)).toBe(true);
    expect((await av.check(sess, 'Read', {})).approve).toBe(true);
    expect((await av.check(sess, 'Bash', BASH('rm -rf x'))).approve).toBe(false);
    expect((await av.check(sess, 'Write', {})).approve).toBe(false);
    expect(av.get(sess).used).toBe(1);
    expect((await av.check(sess, 'Bash', BASH('git status'))).approve).toBe(true);
    expect((await av.check(sess, 'Grep', {})).approve).toBe(true);
    expect(av.get(sess)).toMatchObject({ active: false, end_reason: 'budget_exhausted', used: 3 });
    expect(av.isActive(sess)).toBe(false);
    expect((await av.check(sess, 'Read', {})).approve).toBe(false);
  });
  it('ends the block on TTL expiry', async () => {
    const t0 = Date.now();
    await av.start(sess, { agent: 'data-analyst', phase: 1, tool_budget: 5, ttl_s: 30 }, { now: t0 });
    expect((await av.check(sess, 'Read', {}, { now: t0 + 29000 })).approve).toBe(true);
    const r = await av.check(sess, 'Read', {}, { now: t0 + 31000 });
    expect(r.approve).toBe(false);
    expect(r.reason).toMatch(/ttl_expired/);
    expect(av.get(sess).end_reason).toBe('ttl_expired');
  });
  it('gates always win: a pending gate ends the block', async () => {
    await start();
    expect((await av.check(sess, 'Read', {})).approve).toBe(true);
    const frame = (state.read('frames').frames || []).slice(-1)[0];
    await gates.requestGate(sess, { frame, id: 'g1', kind: 'phase', phase: 1, summary: 's', record_ref: 'x.md' });
    const r = await av.check(sess, 'Read', {});
    expect(r.approve).toBe(false);
    expect(av.get(sess)).toMatchObject({ active: false });
    expect(av.get(sess).end_reason).toMatch(/gate_pending/);
  });
  it('sessions are isolated', async () => {
    await start();
    const s2 = new StateStore(root, 's2');
    await pushFrame(s2, { agent: 'data-analyst', project: 'p' });
    const sess2 = { root, sessionKey: 's2', state: s2 };
    expect((await av.check(sess2, 'Read', {})).approve).toBe(false);
    expect((await av.check(sess, 'Read', {})).approve).toBe(true);
    expect(av.get(sess2).active).toBeFalsy();
  });
  it('allowlist scope: SELECT-only SQL, no destructive or compound commands', async () => {
    await start({ tool_budget: 20 });
    const yes = ['psql -c "SELECT 1"', 'dbt show --select m', 'ls -la'];
    const no = ['psql -c "DROP TABLE x"', 'dbt run', 'rm x', 'ls && rm x', 'curl http://x'];
    for (const c of yes) expect((await av.check(sess, 'Bash', BASH(c))).approve, c).toBe(true);
    for (const c of no) expect((await av.check(sess, 'Bash', BASH(c))).approve, c).toBe(false);
    expect(av.get(sess).used).toBe(yes.length);
  });
});

describe('quoted-region compound detection', () => {
  it('no longer false-vetoes quoted separators', () => {
    expect(isAutoApprovable('Bash', BASH("git log --grep='a&b'"))).toBe(true);
    expect(isAutoApprovable('Bash', BASH('git log --grep="a;b"'))).toBe(true);
    expect(isAutoApprovable('Bash', BASH("git log --grep='a\nb'"))).toBe(true);
  });
  it('still denies smuggling outside quotes', () => {
    expect(isAutoApprovable('Bash', BASH('git log; rm -rf x'))).toBe(false);
    expect(isAutoApprovable('Bash', BASH("echo 'a' & rm x"))).toBe(false);
    expect(isAutoApprovable('Bash', BASH("git log --grep='a' & rm x"))).toBe(false);
    expect(isAutoApprovable('Bash', BASH("git log --grep='a'\nrm x"))).toBe(false);
    expect(isAutoApprovable('Bash', BASH("git log \\' & rm x \\'"))).toBe(false); // escaped quote
    expect(isAutoApprovable('Bash', BASH('git log "$(echo a)" & rm x'))).toBe(false);
    expect(isAutoApprovable('Bash', BASH("git log 'unterminated & rm x"))).toBe(false);
  });
  it('masks only quoted spans', () => {
    expect(maskQuotedRegions("a 'b&c' d")).toBe('a       d');
    expect(maskQuotedRegions('a\\ \'b&c\'')).toBe('a\\ \'b&c\'');
  });
});
