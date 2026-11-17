import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { commitGate, listPending, gitState } = require('../runtime/git');
const { sh, tmp, makeRepo, write, hook, cleanup, CFG } = require('./git-binding-fixture.js');

afterEach(() => { cleanup(); });
const base = (root, extra) => ({ root, gate: 'g1', agent: 'a', outputDirs: ['out'], config: CFG, session: 's', ...extra });
const refs = (cwd) => sh(cwd, 'for-each-ref', '--format=%(refname)', 'refs/shards/pending').split('\n').filter(Boolean);
const snapshotFiles = (cwd, ref) => sh(cwd, 'ls-tree', '-r', '--name-only', ref).split('\n');

describe('git binding: fallbacks', () => {
  it('merge in progress -> commit_pending, snapshot ref, no commit', async () => {
    const { root } = makeRepo();
    sh(root, 'checkout', '-q', '-b', 'side');
    write(root, 'f.txt', 'side\n'); sh(root, 'add', 'f.txt'); sh(root, 'commit', '-q', '-m', 'side');
    sh(root, 'checkout', '-q', 'main');
    write(root, 'f.txt', 'main\n'); sh(root, 'add', 'f.txt'); sh(root, 'commit', '-q', '-m', 'main');
    try { sh(root, 'merge', 'side'); } catch (_) { /* conflict expected */ }
    expect((await gitState(root)).inProgress).toBe('merge');
    const head = sh(root, 'rev-parse', 'HEAD');
    write(root, 'out/a.md', 'a\n');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('commit_pending');
    expect(r.reason).toBe('merge_in_progress');
    expect(r.pending).toBe(true);
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(refs(root)).toEqual([r.snapshot_ref]);
    expect(snapshotFiles(root, r.snapshot_ref)).toContain('out/a.md');
    expect(listPending(root)).toHaveLength(1);
  });

  it('failing pre-commit hook -> commit_pending, nothing changed', async () => {
    const { root, top } = makeRepo();
    hook(top, 'pre-commit', 'echo "lint exploded" >&2; exit 1');
    write(root, 'mine.txt', 's\n'); sh(root, 'add', 'mine.txt');
    write(root, 'out/a.md', 'a\n');
    const head = sh(root, 'rev-parse', 'HEAD');
    const cachedBefore = sh(root, 'ls-files', '-s');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('commit_pending');
    expect(r.reason).toBe('hook_failed: lint exploded');
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(refs(root)).toHaveLength(1);
    expect(sh(root, 'ls-files', '-s')).toBe(cachedBefore);
    expect(fs.readFileSync(path.join(root, 'out/a.md'), 'utf8')).toBe('a\n');
    expect(sh(root, 'status', '--porcelain', '--', 'out')).toBe('?? out/');
    expect(listPending(root)[0].tries).toBe(1);
  });

  it('pre-commit hook timeout -> hook_timeout', async () => {
    const { root, top } = makeRepo();
    hook(top, 'pre-commit', 'sleep 20'); // long enough that a slow Windows runner still proves the hook was killed, not awaited
    write(root, 'out/a.md', 'a\n');
    const t0 = Date.now();
    const r = await commitGate(base(root, { hookTimeoutMs: 300 }));
    expect(Date.now() - t0).toBeLessThan(15000);
    expect(r.outcome).toBe('commit_pending');
    expect(r.reason).toBe('hook_timeout');
    // On Windows the killed hook tree (sh -> sleep) can outlive the kill for a moment; a lock that is merely
    // in flight must clear. Only a lock that is still there after the grace period counts as stale.
    const lock = path.join(top, '.git', 'index.lock');
    const until = Date.now() + (process.platform === 'win32' ? 8000 : 0);
    while (fs.existsSync(lock) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
    expect(fs.existsSync(lock)).toBe(false);
    const st = sh(root, 'status', '--porcelain', '--', 'out');
    expect(st, `out=${fs.existsSync(path.join(root, 'out/a.md'))} log=${sh(root, 'log', '--oneline', '-3')}`).toBe('?? out/');
  });

  it('detached HEAD -> commit_pending', async () => {
    const { root } = makeRepo();
    sh(root, 'checkout', '-q', '--detach');
    write(root, 'out/a.md', 'a\n');
    const head = sh(root, 'rev-parse', 'HEAD');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('commit_pending');
    expect(r.reason).toBe('detached_head');
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(r.snapshot_ref).toBeTruthy();
  });

  it('non-repo -> commit_pending no_repo with file list only', async () => {
    const root = tmp();
    write(root, 'out/a.md', 'a\n');
    write(root, 'out/data.parquet', 'p');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('commit_pending');
    expect(r.reason).toBe('no_repo');
    expect(r.snapshot_ref).toBeNull();
    const rec = listPending(root)[0];
    expect(rec.files).toEqual(['out/a.md']);
    expect(rec.snapshot_ref).toBeNull();
  });

  it('commit.gpgsign=true -> signing_required pending, no hang', async () => {
    const { root } = makeRepo();
    sh(root, 'config', 'commit.gpgsign', 'true');
    write(root, 'out/a.md', 'a\n');
    const r = await commitGate(base(root));
    expect(r.outcome).toBe('commit_pending');
    expect(r.reason).toBe('signing_required');
    expect(refs(root)).toHaveLength(1);
  });

  it('config.commit=false -> commit_disabled pending with snapshot', async () => {
    const { root } = makeRepo();
    write(root, 'out/a.md', 'a\n');
    const head = sh(root, 'rev-parse', 'HEAD');
    const r = await commitGate(base(root, { config: { ...CFG, commit: false } }));
    expect(r.outcome).toBe('commit_pending');
    expect(r.reason).toBe('commit_disabled');
    expect(sh(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(refs(root)).toHaveLength(1);
    expect(listPending(root)[0].status).toBe('pending');
  });
});
