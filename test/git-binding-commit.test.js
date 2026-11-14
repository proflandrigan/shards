import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { commitGate, listPending, gateRef } = require('../runtime/git');
const leases = require('../runtime/git/leases');
const { sh, makeRepo, write, cleanup, CFG } = require('./git-binding-fixture.js');

afterEach(() => { cleanup(); });
const base = (root, extra) => ({ root, gate: 'g1', agent: 'data-analyst', outputDirs: ['out'], config: CFG, session: 's1', ...extra });
const files = (cwd, ref = 'HEAD') => sh(cwd, 'show', '--name-only', '--format=', ref).split('\n').filter(Boolean).sort();

describe('git binding: commit', () => {
  it('clean tree -> skipped', async () => {
    const { root } = makeRepo();
    const head = sh(root, 'rev-parse', 'HEAD');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('skipped');
    expect(r.reason).toBe('nothing_to_commit');
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(listPending(root)).toEqual([]);
  });

  it('empty outputDirs -> skipped', async () => {
    const { root } = makeRepo();
    expect((await commitGate(base(root, { outputDirs: [] }))).outcome).toBe('skipped');
  });

  it('untracked outputs committed with trailers', async () => {
    const { root } = makeRepo();
    write(root, 'out/a.md', 'a\n');
    write(root, 'out/sub/b.md', 'b\n');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('committed');
    expect(r.sha).toBe(sh(root, 'rev-parse', 'HEAD'));
    expect(files(root)).toEqual(['out/a.md', 'out/sub/b.md']);
    const msg = sh(root, 'log', '-1', '--format=%B');
    expect(msg).toContain('Shards-Gate: g1');
    expect(msg).toContain('Shards-Agent: data-analyst');
    expect(sh(root, 'for-each-ref', 'refs/shards')).toBe('');
    expect(sh(root, 'status', '--porcelain', '--', 'out')).toBe('');
  });

  it("user's staged files are untouched and not committed", async () => {
    const { root } = makeRepo();
    write(root, 'mine.txt', 'staged\n');
    sh(root, 'add', 'mine.txt');
    write(root, 'out/a.md', 'a\n');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('committed');
    expect(files(root)).toEqual(['out/a.md']);
    expect(sh(root, 'diff', '--cached', '--name-only')).toBe('mine.txt');
  });

  it('denylisted, oversize and ignored files are not committed (even tracked)', async () => {
    const { root } = makeRepo();
    write(root, 'out/keep.md', 'v1\n');
    write(root, 'out/data.parquet', 'p1');
    write(root, 'out/big.txt', 'small');
    sh(root, 'add', '-f', 'out');
    sh(root, 'commit', '-q', '-m', 'seed');
    write(root, 'out/keep.md', 'v2\n');
    write(root, 'out/data.parquet', 'p2');
    write(root, 'out/big.txt', 'x'.repeat(5000));
    write(root, '.gitignore', 'out/ignored.md\n');
    write(root, 'out/ignored.md', 'ign');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('committed');
    expect(files(root)).toEqual(['out/keep.md']);
  });

  it('tracked deletion is committed as a removal', async () => {
    const { root } = makeRepo();
    write(root, 'out/a.md', 'a\n');
    write(root, 'out/b.md', 'b\n');
    sh(root, 'add', 'out'); sh(root, 'commit', '-q', '-m', 'seed');
    fs.unlinkSync(path.join(root, 'out/a.md'));
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('committed');
    expect(sh(root, 'show', '--name-status', '--format=')).toBe('D\tout/a.md');
  });

  it('leased path excluded via stubbed getLeasedPaths', async () => {
    const { root } = makeRepo();
    write(root, 'out/a.md', 'a\n');
    write(root, 'out/leased/x.md', 'x\n');
    const seen = [];
    const orig = leases.getLeasedPaths;
    leases.getLeasedPaths = (s) => { seen.push(s); return ['out/leased']; };
    try {
      const r = await commitGate({ ...base(root), getLeasedPaths: (s) => leases.getLeasedPaths(s) });
      expect(r.outcome).toBe('committed');
    } finally { leases.getLeasedPaths = orig; }
    expect(seen).toEqual(['s1']);
    expect(files(root)).toEqual(['out/a.md']);
  });

  it('default getLeasedPaths hook is used when not injected', async () => {
    const { root } = makeRepo();
    write(root, 'out/a.md', 'a\n');
    const orig = leases.getLeasedPaths;
    leases.getLeasedPaths = () => ['out/a.md'];
    try { expect((await commitGate(base(root))).outcome).toBe('skipped'); } finally { leases.getLeasedPaths = orig; }
  });

  it('monorepo: project root is a subdirectory of the toplevel', async () => {
    const { top, root } = makeRepo({ sub: 'proj' });
    write(root, 'out/a.md', 'a\n');
    write(top, 'other/x.md', 'x\n');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('committed');
    expect(files(top)).toEqual(['proj/out/a.md']);
    expect(sh(top, 'status', '--porcelain', '--', 'other')).toBe('?? other/');
  });

  it('works on an unborn branch', async () => {
    const { tmp } = require('./git-binding-fixture.js');
    const root = tmp();
    sh(root, 'init', '-q', '-b', 'main');
    sh(root, 'config', 'user.name', 'T'); sh(root, 'config', 'user.email', 't@e.com'); sh(root, 'config', 'commit.gpgsign', 'false');
    write(root, 'out/a.md', 'a\n');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('committed');
    expect(files(root)).toEqual(['out/a.md']);
  });

  it('gate ref names are sanitized deterministically', () => {
    expect(gateRef('ml-engineer-phase-1')).toBe('refs/shards/pending/ml-engineer-phase-1');
    const a = gateRef('weird gate..x');
    expect(a).toMatch(/^refs\/shards\/pending\/weird_gate_x-[0-9a-f]{8}$/);
    expect(gateRef('weird gate..x')).toBe(a);
  });
});
