import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { commitGate, replayPending, listPending } = require('../runtime/git');
const { sh, makeRepo, write, hook, cleanup, CFG } = require('./git-binding-fixture.js');

afterEach(() => { cleanup(); });
const base = (root, extra) => ({ root, gate: 'g1', agent: 'a', outputDirs: ['out'], config: CFG, session: 's', ...extra });
const refs = (cwd) => sh(cwd, 'for-each-ref', '--format=%(refname)', 'refs/shards/pending').split('\n').filter(Boolean);

describe('git binding: replay', () => {
  it('two pending gates replay in order from their snapshots', async () => {
    const { root, top } = makeRepo();
    const flag = path.join(top, 'FAIL');
    fs.writeFileSync(flag, '1');
    hook(top, 'pre-commit', `[ -e "${flag}" ] && { echo blocked >&2; exit 1; }; exit 0`);
    const head0 = sh(root, 'rev-parse', 'HEAD');
    write(root, 'out/a.md', 'gate-1 content\n');
    const r1 = await commitGate(base(root, { gate: 'gate-1' }));
    expect(r1.reason).toMatch(/^hook_failed/);
    write(root, 'out/a.md', 'gate-2 content\n');
    write(root, 'out/b.md', 'only in gate 2\n');
    const r2 = await commitGate(base(root, { gate: 'gate-2' }));
    expect(r2.outcome).toBe('commit_pending');
    expect(r2.reason).toBe('blocked_by_gate-1');
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head0);
    expect(listPending(root).map((r) => r.gate)).toEqual(['gate-1', 'gate-2']);

    fs.unlinkSync(flag);
    const out = await replayPending(root, { config: CFG, force: true });
    expect(out.map((o) => [o.gate, o.outcome])).toEqual([['gate-1', 'committed'], ['gate-2', 'committed']]);
    const log = sh(root, 'log', '--format=%H', `${head0}..HEAD`).split('\n').reverse();
    expect(log).toHaveLength(2);
    expect(sh(root, 'show', `${log[0]}:out/a.md`)).toBe('gate-1 content');
    expect(sh(root, 'show', '--name-only', '--format=', log[0])).toBe('out/a.md');
    expect(sh(root, 'show', `${log[1]}:out/a.md`)).toBe('gate-2 content');
    expect(sh(root, 'show', '--name-only', '--format=', log[1]).split('\n').sort()).toEqual(['out/a.md', 'out/b.md']);
    expect(sh(root, 'log', '-1', '--format=%B', log[0])).toContain('Shards-Gate: gate-1');
    expect(refs(root)).toEqual([]);
    expect(listPending(root)).toEqual([]);
    // working tree keeps the latest content and is clean afterwards
    expect(fs.readFileSync(path.join(root, 'out/a.md'), 'utf8')).toBe('gate-2 content\n');
    expect(sh(root, 'status', '--porcelain', '--', 'out')).toBe('');
  });

  it("replay preserves the user's staged edits to the same paths", async () => {
    const { root, top } = makeRepo();
    const flag = path.join(top, 'FAIL');
    fs.writeFileSync(flag, '1');
    hook(top, 'pre-commit', `[ -e "${flag}" ] && exit 1; exit 0`);
    write(root, 'out/a.md', 'v1\n');
    sh(root, 'add', 'out/a.md'); sh(root, 'commit', '-q', '--no-verify', '-m', 'seed');
    write(root, 'out/a.md', 'gate content\n');
    await commitGate(base(root, { gate: 'g-x' }));
    write(root, 'out/a.md', 'user edit\n');
    sh(root, 'add', 'out/a.md');
    fs.unlinkSync(flag);
    const out = await replayPending(root, { config: CFG, force: true });
    expect(out[0].outcome).toBe('committed');
    expect(sh(root, 'show', 'HEAD:out/a.md')).toBe('gate content');
    expect(sh(root, 'show', ':out/a.md')).toBe('user edit');
  });

  it('five failed tries -> stuck (injected now), force retries', async () => {
    const { root, top } = makeRepo();
    const flag = path.join(top, 'FAIL');
    fs.writeFileSync(flag, '1');
    hook(top, 'pre-commit', `[ -e "${flag}" ] && exit 1; exit 0`);
    write(root, 'out/a.md', 'a\n');
    await commitGate(base(root));
    expect(listPending(root)[0].tries).toBe(1);
    // not due yet
    const early = await replayPending(root, { config: CFG, now: Date.now() });
    expect(early[0]).toMatchObject({ outcome: 'skipped', reason: 'not_due' });
    let now = Date.now();
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      now += 2 * 3600e3;
      const r = await replayPending(root, { config: CFG, now });
      statuses.push([r[0].tries, r[0].status]);
    }
    expect(statuses).toEqual([[2, 'pending'], [3, 'pending'], [4, 'pending'], [5, 'stuck']]);
    now += 2 * 3600e3;
    expect((await replayPending(root, { config: CFG, now }))[0]).toMatchObject({ outcome: 'skipped', reason: 'stuck' });
    fs.unlinkSync(flag);
    const forced = await replayPending(root, { config: CFG, now, force: true });
    expect(forced[0].outcome).toBe('committed');
    expect(listPending(root)).toEqual([]);
  });

  it('commit disabled: replay skips and keeps records', async () => {
    const { root } = makeRepo();
    const off = { ...CFG, commit: false };
    write(root, 'out/a.md', 'a\n');
    await commitGate(base(root, { config: off }));
    const head = sh(root, 'rev-parse', 'HEAD');
    const r = await replayPending(root, { config: off, force: true });
    expect(r[0]).toMatchObject({ outcome: 'skipped', reason: 'commit_disabled' });
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head);
    // re-enabled: replays
    const on = await replayPending(root, { config: CFG, force: true });
    expect(on[0].outcome).toBe('committed');
  });

  it('no_repo record replays once a repo exists', async () => {
    const { tmp } = require('./git-binding-fixture.js');
    const root = tmp();
    write(root, 'out/a.md', 'a\n');
    await commitGate(base(root));
    sh(root, 'init', '-q', '-b', 'main');
    sh(root, 'config', 'user.name', 'T'); sh(root, 'config', 'user.email', 't@e.com'); sh(root, 'config', 'commit.gpgsign', 'false');
    const r = await replayPending(root, { config: CFG, force: true });
    expect(r[0].outcome).toBe('committed');
    expect(sh(root, 'show', '--name-only', '--format=')).toBe('out/a.md');
  });
});
