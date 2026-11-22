'use strict';
// E6.3 git binding: gate commits.
//
// commitGate() turns "the agent's output dirs at gate time" into a commit on the
// CURRENT branch without ever running a shell, `git add -A`, a checkout, or a push.
//
// Pipeline
//   1. Collect files under outputDirs (`git ls-files -co --exclude-standard -z`), drop
//      denylisted globs, oversize files (even if tracked) and leased paths. Tracked
//      files missing on disk are removals.
//   2. Snapshot: hash the files (`hash-object -w`), diff against HEAD, and write the
//      changed entries into a TEMPORARY index (GIT_INDEX_FILE in a temp dir, seeded by
//      `read-tree HEAD`) -> write-tree -> commit-tree -> `update-ref refs/shards/pending/<gate>-<seq>`
//      (one ref per record, so two records for a reused gate id never share a snapshot).
//      The user's index and working tree are not touched.
//   3. Commit. Two paths, both honouring the user's pre-commit hook and leaving the
//      user's staged files outside the gate untouched:
//        a. working tree == snapshot for every file (the normal case): untracked files are
//           `git add`ed (index backed up and restored if the commit fails), then
//           `git commit --only --pathspec-from-file` of just the changed files.
//        b. working tree moved on (replaying an old gate): build the commit from the
//           SNAPSHOT blobs via plumbing on a temp index seeded from the current HEAD,
//           run pre-commit (`git hook run --ignore-missing`, else the hook file) against
//           that temp index, `update-ref HEAD <new> <old>`, then refresh the user's real
//           index ONLY for paths whose index entry still equals the old HEAD entry (so
//           the user's staged edits to those paths survive).
//   4. Success deletes the pending record + snapshot ref. Failure keeps both.
//
// Pending store: <root>/.shards/state/git-pending.json (atomicWrite) guarded by its own
// proper-lockfile lock (git-pending.lock). `records` is keyed by an opaque record key
// (`<gate>@<session>#<seq>`, kept on the record as `rec.key`); `rec.gate` is the gate id.
// Gate ids repeat (they are scoped by agent/project/track), so the key must not be the bare
// id: a reused id confirmed for another project must not drop an earlier uncommitted record.
// A new record replaces an existing one only when it is the same gate instance (same gate
// id + session + agent + project + track, i.e. a re-confirm). Stores written before this
// change are keyed by bare gate id and their records carry no `project`; they load as-is
// (the old key becomes `rec.key`) and are treated as the same instance as a new
// confirmation of the same gate id, session and agent. It is NOT the StateStore lock, but callers must
// still not call commitGate from a context that already holds git-pending.lock; calling it
// while holding the StateStore lock is fine technically but can block for hookTimeoutMs.
//
// Ordering: records replay in ascending seq. If an older record is still failing, newer
// gates are recorded pending as `blocked_by_<gate>` so gate N never lands before N-1.
// `tries` counts real commit failures only (hook/commit errors); precondition waits
// (detached HEAD, merge in progress, signing, no_repo) retry after 60s without a try.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const lockfile = require('proper-lockfile');
const { atomicWrite } = require('../state/store');
const leases = require('./leases');

const DEFAULT_HOOK_TIMEOUT_MS = 30000;
const BACKOFF_MS = [0, 60e3, 300e3, 900e3, 3600e3];
const MAX_TRIES = 5;
const PRECONDITION_RETRY_MS = 60e3;
const ZERO_SHA = '0'.repeat(40);
const PENDING_LOCK_OPTS = { realpath: false, stale: 10000, retries: { retries: 600, factor: 1.2, minTimeout: 20, maxTimeout: 200 } };
const DEFAULT_DENYLIST = { globs: [], max_file_size_bytes: 5 * 1024 * 1024 };

// ---------- process helpers ----------

function baseEnv(extra) {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GPG_TTY']) delete env[k];
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_LITERAL_PATHSPECS = '1';
  env.GIT_EDITOR = 'true';
  env.GIT_OPTIONAL_LOCKS = '0';
  return Object.assign(env, extra || {});
}

// execFile with stdin handling and a hard timeout. SIGTERM goes to the child so git cleans up its
// own index.lock and hook children; SIGKILL follows if it lingers.
// Windows has no process groups for child.kill(): Git for Windows spawns a wrapper -> real git -> sh -> hook, and
// killing only the wrapper orphans the rest (still holding index.lock). Kill the whole tree there.
function killTree(child, signal) {
  if (process.platform === 'win32' && child.pid) {
    try { require('child_process').spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); return; } catch (_) { /* fall through */ }
  }
  try { child.kill(signal); } catch (_) { /* gone */ }
}

function exec(file, args, { cwd, env, input, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    let done = false;
    let timedOut = false;
    let timer = null;
    let killTimer = null;
    const finish = (v) => { if (done) return; done = true; clearTimeout(timer); clearTimeout(killTimer); resolve(v); };
    const child = execFile(file, args, { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') { if (!done) { done = true; clearTimeout(timer); clearTimeout(killTimer); reject(err); } return; }
      finish({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: stdout || '', stderr: stderr || '', timedOut });
    });
    child.stdin.on('error', () => { /* child exited before reading stdin */ });
    child.stdin.end(input === undefined ? undefined : input);
    if (timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child, 'SIGTERM');
        killTimer = setTimeout(() => {
          killTree(child, 'SIGKILL');
          finish({ code: 1, stdout: '', stderr: '', timedOut: true });
        }, 1500);
      }, timeoutMs);
    }
  });
}

function git(root, args, opts = {}) {
  return exec('git', args, { cwd: root, env: baseEnv(opts.env), input: opts.input, timeoutMs: opts.timeoutMs });
}

async function gitOk(root, args, opts) {
  const r = await git(root, args, opts);
  if (r.code !== 0) throw new Error(`git ${args.slice(0, 3).join(' ')} failed (${r.code}): ${(r.stderr || r.stdout).trim().split('\n')[0]}`);
  return r.stdout;
}

async function chunked(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(await fn(items.slice(i, i + size)));
  return out;
}

function firstLine(...texts) {
  for (const t of texts) {
    const lines = String(t || '').split('\n').map((s) => s.trim()).filter(Boolean);
    // Skip git's own "warning: ... LF will be replaced by CRLF" noise (core.autocrlf on Windows) when a real line follows.
    const l = lines.find((x) => !/^warning:/i.test(x)) || lines[0];
    if (l) return l.slice(0, 200);
  }
  return '';
}

// ---------- git state ----------

async function gitState(root) {
  const st = { inRepo: false, detached: false, branch: null, headSha: null, inProgress: null, signing: false, prefix: '' };
  let r;
  try { r = await git(root, ['rev-parse', '--is-inside-work-tree']); } catch (_) { return st; }
  if (r.code !== 0 || r.stdout.trim() !== 'true') return st;
  st.inRepo = true;
  const pre = await git(root, ['rev-parse', '--show-prefix']);
  st.prefix = pre.code === 0 ? pre.stdout.replace(/\n$/, '') : '';
  const sym = await git(root, ['symbolic-ref', '-q', '--short', 'HEAD']);
  if (sym.code === 0) st.branch = sym.stdout.trim(); else st.detached = true;
  const head = await git(root, ['rev-parse', '-q', '--verify', 'HEAD']);
  if (head.code === 0) st.headSha = head.stdout.trim();
  const probes = [['MERGE_HEAD', 'merge'], ['rebase-merge', 'rebase'], ['rebase-apply', 'rebase'], ['CHERRY_PICK_HEAD', 'cherry_pick'], ['REVERT_HEAD', 'revert']];
  for (const [name, kind] of probes) {
    const p = await git(root, ['rev-parse', '--git-path', name]);
    if (p.code === 0 && fs.existsSync(path.resolve(root, p.stdout.trim()))) { st.inProgress = kind; break; }
  }
  const sg = await git(root, ['config', '--bool', 'commit.gpgsign']);
  st.signing = sg.code === 0 && sg.stdout.trim() === 'true';
  return st;
}

async function identEnv(root) {
  const n = await git(root, ['config', 'user.name']);
  const e = await git(root, ['config', 'user.email']);
  if (n.stdout.trim() && e.stdout.trim()) return {};
  return {
    GIT_AUTHOR_NAME: 'Shards', GIT_AUTHOR_EMAIL: 'shards@localhost',
    GIT_COMMITTER_NAME: 'Shards', GIT_COMMITTER_EMAIL: 'shards@localhost',
  };
}

// ---------- globs / paths ----------

function globToRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function makeDenyMatcher(globs) {
  const compiled = (globs || []).filter((g) => typeof g === 'string' && g).map((g) => {
    const dirOnly = g.endsWith('/');
    const body = dirOnly ? g.slice(0, -1) : g;
    const anchored = body.includes('/');
    const clean = body.replace(/^\.?\//, '');
    return { re: globToRegex(dirOnly ? `${clean}/**` : clean), anchored, dirOnly };
  });
  return (p) => compiled.some(({ re, anchored, dirOnly }) => {
    if (dirOnly) return re.test(p) || re.test(`${p}`) || p.split('/').slice(0, -1).some((_, i, a) => re.test(`${a.slice(0, i + 1).join('/')}/x`));
    return anchored ? re.test(p) : re.test(path.posix.basename(p));
  });
}

function normRel(root, p) {
  let s = String(p).replace(/\\/g, '/');
  if (path.isAbsolute(s)) s = path.relative(root, s).replace(/\\/g, '/');
  s = s.replace(/^(\.\/)+/, '').replace(/\/+$/, '');
  return s;
}

function isLeased(p, leased) {
  return leased.some((l) => l && (p === l || p.startsWith(`${l}/`)));
}

// Snapshot ref of one pending record: `<gateRef(gate)>-<seq>`. Unique per record, so a reused
// gate id never overwrites another record's snapshot. (Pre-existing records keep the ref
// they stored in `snapshot_ref`, which may be the bare gateRef(gate).)
function recordRef(gate, seq) {
  return Number.isInteger(seq) ? `${gateRef(gate)}-${seq}` : gateRef(gate);
}

function gateRef(gate) {
  let s = String(gate).replace(/[^A-Za-z0-9._-]/g, '_');
  s = s.replace(/\.{2,}/g, '_').replace(/^\.+/, '_').replace(/\.+$/, '_').replace(/\.lock$/, '_lock');
  if (!s) s = 'gate';
  if (s !== gate) s += `-${crypto.createHash('sha1').update(String(gate)).digest('hex').slice(0, 8)}`;
  return `refs/shards/pending/${s}`;
}

// ---------- file collection ----------

function walkFs(root, dir, out) {
  let ents;
  try { ents = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch (_) { return; }
  for (const e of ents) {
    if (e.name === '.git') continue;
    const rel = dir && dir !== '.' ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) walkFs(root, rel, out); else out.push(rel);
  }
}

async function collectFiles(root, outputDirs, st, cfg, leased) {
  // Drop any path with a `..` segment: one escaping pathspec makes `git ls-files` fail for all of them.
  const dirs = [...new Set((outputDirs || []).map((d) => normRel(root, d) || '.').filter((d) => !d.split('/').includes('..')))];
  let listed = [];
  if (st.inRepo) {
    const r = await git(root, ['ls-files', '-co', '--exclude-standard', '-z', '--', ...dirs]);
    if (r.code === 0) listed = r.stdout.split('\0').filter(Boolean);
  } else {
    for (const d of dirs) {
      const p = path.join(root, d);
      let s; try { s = fs.lstatSync(p); } catch (_) { continue; }
      if (s.isDirectory()) walkFs(root, d, listed); else listed.push(d);
    }
  }
  const deny = makeDenyMatcher(cfg.denylist.globs);
  const maxSize = cfg.denylist.max_file_size_bytes;
  const leasedN = (leased || []).map((l) => normRel(root, l));
  const out = [];
  for (const p of [...new Set(listed)].sort()) {
    if (p === '.git' || p.startsWith('.git/') || isLeased(p, leasedN) || deny(p)) continue;
    let s = null;
    try { s = fs.lstatSync(path.join(root, p)); } catch (_) { /* missing */ }
    if (!s) { if (st.inRepo) out.push({ path: p, del: true }); continue; }
    if (s.isDirectory()) continue;
    if (!s.isFile() && !s.isSymbolicLink()) continue;
    if (typeof maxSize === 'number' && s.size > maxSize) continue;
    out.push({ path: p, symlink: s.isSymbolicLink(), exec: s.isFile() && (s.mode & 0o111) !== 0 });
  }
  return out;
}

// ---------- tree/index helpers ----------

async function hashWorktree(root, files, write) {
  // files: [{path, symlink, exec}] -> [{path, mode, sha}]
  const res = [];
  const regular = files.filter((f) => !f.symlink);
  const args = ['hash-object', ...(write ? ['-w'] : []), '--stdin-paths'];
  for (let i = 0; i < regular.length; i += 500) {
    const part = regular.slice(i, i + 500);
    const out = await gitOk(root, args, { input: `${part.map((f) => path.join(root, f.path)).join('\n')}\n` });
    const shas = out.split('\n').filter(Boolean);
    part.forEach((f, j) => res.push({ path: f.path, mode: f.exec ? '100755' : '100644', sha: shas[j] }));
  }
  for (const f of files.filter((x) => x.symlink)) {
    const target = fs.readlinkSync(path.join(root, f.path));
    const out = await gitOk(root, ['hash-object', ...(write ? ['-w'] : []), '--stdin'], { input: target });
    res.push({ path: f.path, mode: '120000', sha: out.trim() });
  }
  return res;
}

async function lsTree(root, treeish, files) {
  // -> Map path -> "mode sha"
  const m = new Map();
  if (!treeish) return m;
  await chunked(files, 200, async (part) => {
    const r = await git(root, ['ls-tree', '-r', '-z', treeish, '--', ...part]);
    if (r.code !== 0) return;
    for (const rec of r.stdout.split('\0').filter(Boolean)) {
      const tab = rec.indexOf('\t');
      const [mode, , sha] = rec.slice(0, tab).split(' ');
      m.set(rec.slice(tab + 1), `${mode} ${sha}`);
    }
  });
  return m;
}

async function lsIndex(root, files) {
  const m = new Map();
  await chunked(files, 200, async (part) => {
    const r = await git(root, ['ls-files', '-s', '-z', '--', ...part]);
    if (r.code !== 0) return;
    for (const rec of r.stdout.split('\0').filter(Boolean)) {
      const tab = rec.indexOf('\t');
      const [mode, sha, stage] = rec.slice(0, tab).split(' ');
      if (stage === '0') m.set(rec.slice(tab + 1), `${mode} ${sha}`);
    }
  });
  return m;
}

function indexInfo(prefix, entries) {
  // entries: [{path, mode, sha}|{path, del:true}]
  return `${entries.map((e) => (e.del ? `0 ${ZERO_SHA}\t${prefix}${e.path}` : `${e.mode} ${e.sha}\t${prefix}${e.path}`)).join('\n')}\n`;
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-gitidx-'));
  return Promise.resolve().then(() => fn(dir)).finally(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* best effort */ } });
}

function msgParts(rec) {
  return [`shards gate ${rec.gate}`, `Shards-Gate: ${rec.gate}\nShards-Agent: ${rec.agent || 'unknown'}`];
}

async function createSnapshot(root, st, gate, entries, ident, message, seq) {
  const ref = recordRef(gate, seq);
  const sha = await withTmpDir(async (dir) => {
    const env = { GIT_INDEX_FILE: path.join(dir, 'index'), ...ident };
    if (st.headSha) await gitOk(root, ['read-tree', st.headSha], { env });
    if (entries.length) await gitOk(root, ['update-index', '--add', '--index-info'], { env, input: indexInfo(st.prefix, entries) });
    const tree = (await gitOk(root, ['write-tree'], { env })).trim();
    const args = ['commit-tree', tree, ...(st.headSha ? ['-p', st.headSha] : []), '-m', message || `shards snapshot ${gate}`];
    return (await gitOk(root, args, { env })).trim();
  });
  await gitOk(root, ['update-ref', ref, sha]);
  return ref;
}

async function deleteRef(root, ref) {
  if (ref) await git(root, ['update-ref', '-d', ref]);
}

// Hash worktree files and keep only entries that differ from HEAD.
async function diffAgainstHead(root, st, files) {
  const existing = files.filter((f) => !f.del);
  const hashed = await hashWorktree(root, existing, true);
  const entries = [...hashed, ...files.filter((f) => f.del).map((f) => ({ path: f.path, del: true }))];
  const head = await lsTree(root, st.headSha, entries.map((e) => e.path));
  const changed = entries.filter((e) => {
    const h = head.get(e.path);
    return e.del ? h !== undefined : h !== `${e.mode} ${e.sha}`;
  });
  return changed.sort((a, b) => (a.path < b.path ? -1 : 1));
}

// ---------- hooks / commit ----------

async function hookExists(root, name) {
  const r = await git(root, ['rev-parse', '--git-path', `hooks/${name}`]);
  if (r.code !== 0) return null;
  const p = path.resolve(root, r.stdout.trim());
  return fs.existsSync(p) ? p : null;
}

async function runPreCommit(root, env, timeoutMs) {
  let r = await git(root, ['hook', 'run', '--ignore-missing', 'pre-commit'], { env, timeoutMs });
  if (r.timedOut) return r;
  if (r.code !== 0 && /not a git command|is not a git/i.test(r.stderr)) {
    const hp = await hookExists(root, 'pre-commit');
    if (!hp) return { code: 0, stdout: '', stderr: '', timedOut: false };
    r = await exec(hp, [], { cwd: root, env: baseEnv(env), timeoutMs });
  }
  return r;
}

function classifyFailure(r, hasHook) {
  if (r.timedOut) return 'hook_timeout';
  const line = firstLine(r.stderr, r.stdout);
  return `${hasHook ? 'hook_failed' : 'commit_failed'}: ${line}`.trim();
}

async function readIndexBackup(root) {
  const p = await git(root, ['rev-parse', '--git-path', 'index']);
  const file = path.resolve(root, p.stdout.trim());
  let buf = null;
  try { buf = fs.readFileSync(file); } catch (_) { /* no index yet */ }
  return { file, buf };
}

function restoreIndex(b) {
  try {
    if (b.buf) { const tmp = `${b.file}.shards-restore.${process.pid}`; fs.writeFileSync(tmp, b.buf); fs.renameSync(tmp, b.file); } else fs.rmSync(b.file, { force: true });
  } catch (_) { /* best effort */ }
}

async function commitOnlyPath(root, changed, rec, ctx) {
  const paths = changed.map((e) => e.path);
  const inIndex = await lsIndex(root, paths);
  const toAdd = changed.filter((e) => !e.del && !inIndex.has(e.path)).map((e) => e.path);
  let backup = null;
  if (toAdd.length) {
    backup = await readIndexBackup(root);
    const a = await git(root, ['add', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: toAdd.join('\0'), env: ctx.ident });
    if (a.code !== 0) { restoreIndex(backup); return { ok: false, reason: `commit_failed: ${firstLine(a.stderr)}` }; }
  }
  const [subject, trailers] = msgParts(rec);
  const startedAt = Date.now();
  const r = await git(root, ['commit', '--only', '-m', subject, '-m', trailers, '--pathspec-from-file=-', '--pathspec-file-nul'], {
    input: paths.join('\0'), env: ctx.ident, timeoutMs: ctx.hookTimeoutMs,
  });
  if (r.code !== 0) {
    if (r.timedOut) await removeKilledIndexLock(root, startedAt);
    if (backup) restoreIndex(backup);
    const hasHook = !!(await hookExists(root, 'pre-commit')) || !!(await hookExists(root, 'commit-msg'));
    return { ok: false, reason: classifyFailure(r, hasHook), tried: true };
  }
  return { ok: true };
}

// A `git commit` killed on timeout cannot clean up after itself on Windows (TerminateProcess), leaving a stale
// index.lock that would wedge every later git command. We killed the process tree ourselves, so drop the lock it
// created (only if it appeared after this commit started).
async function removeKilledIndexLock(root, startedAt) {
  try {
    const p = await git(root, ['rev-parse', '--git-path', 'index.lock']);
    if (p.code !== 0) return;
    const lock = path.resolve(root, p.stdout.trim());
    for (let i = 0; i < 10; i++) {
      let st;
      try { st = fs.statSync(lock); } catch (_) { return; }
      if (st.mtimeMs < startedAt - 1000) return; // not ours
      try { fs.unlinkSync(lock); return; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
    }
  } catch (_) { /* best effort */ }
}

async function plumbingPath(root, st, snapEntries, changed, rec, ctx) {
  const paths = changed.map((e) => e.path);
  const headOld = await lsTree(root, st.headSha, paths);
  const outcome = await withTmpDir(async (dir) => {
    const env = { GIT_INDEX_FILE: path.join(dir, 'index'), ...ctx.ident };
    if (st.headSha) await gitOk(root, ['read-tree', st.headSha], { env });
    await gitOk(root, ['update-index', '--add', '--index-info'], { env, input: indexInfo(st.prefix, changed) });
    const tree = (await gitOk(root, ['write-tree'], { env })).trim();
    const [subject, trailers] = msgParts(rec);
    const commit = (await gitOk(root, ['commit-tree', tree, ...(st.headSha ? ['-p', st.headSha] : []), '-m', subject, '-m', trailers], { env })).trim();
    const hook = await runPreCommit(root, { GIT_INDEX_FILE: env.GIT_INDEX_FILE }, ctx.hookTimeoutMs);
    if (hook.timedOut || hook.code !== 0) return { ok: false, reason: classifyFailure(hook, true), tried: true };
    const up = await git(root, ['update-ref', '-m', `shards: ${rec.gate}`, 'HEAD', commit, st.headSha || ZERO_SHA]);
    if (up.code !== 0) return { ok: false, reason: `head_moved: ${firstLine(up.stderr)}` };
    return { ok: true, commit };
  });
  if (!outcome.ok) return outcome;
  const real = await lsIndex(root, paths);
  const refresh = changed.filter((e) => real.get(e.path) === headOld.get(e.path));
  if (refresh.length) await git(root, ['update-index', '--add', '--index-info'], { input: indexInfo(st.prefix, refresh) });
  return { ok: true };
}

// ---------- attempt one record ----------

async function attempt(root, rec, ctx) {
  const st = await gitState(root);
  if (!st.inRepo) return { outcome: 'commit_pending', reason: 'no_repo' };
  const ident = ctx.ident || (ctx.ident = await identEnv(root));
  ctx.ident = ident;

  // A record saved after a commit_error before its files were known: re-collect from its output dirs.
  if (!rec.snapshot_ref && !(rec.files || []).length && Array.isArray(rec.output_dirs) && rec.output_dirs.length) {
    const leased = await leases.getLeasedPaths(sessionOf(root, rec.session));
    rec.files = (await collectFiles(root, rec.output_dirs, st, ctx.cfg, leased || [])).map((f) => f.path);
  }

  if (!rec.snapshot_ref) {
    const probe = rec.files.map((p) => {
      let s = null; try { s = fs.lstatSync(path.join(root, p)); } catch (_) { /* missing */ }
      return s ? { path: p, symlink: s.isSymbolicLink(), exec: s.isFile() && (s.mode & 0o111) !== 0 } : { path: p, del: true };
    });
    const changed = await diffAgainstHead(root, st, probe);
    if (!changed.length) return { outcome: 'skipped', reason: 'nothing_to_commit' };
    rec.files = changed.map((e) => e.path);
    rec.snapshot_ref = await createSnapshot(root, st, rec.gate, changed, ident, `shards snapshot ${rec.gate}`, rec.seq);
  }

  if (ctx.cfg.commit === false) return { outcome: 'commit_pending', reason: 'commit_disabled' };
  if (st.detached) return { outcome: 'commit_pending', reason: 'detached_head' };
  if (st.inProgress) return { outcome: 'commit_pending', reason: `${st.inProgress}_in_progress` };
  if (st.signing) return { outcome: 'commit_pending', reason: 'signing_required' };

  const ref = await git(root, ['rev-parse', '-q', '--verify', rec.snapshot_ref]);
  if (ref.code !== 0) return { outcome: 'commit_pending', reason: 'snapshot_missing', fatal: true };

  const snap = await lsTree(root, rec.snapshot_ref, rec.files);
  const head = await lsTree(root, st.headSha, rec.files);
  const entries = [];
  for (const p of rec.files) {
    const s = snap.get(p);
    if (s) { const [mode, sha] = s.split(' '); entries.push({ path: p, mode, sha }); } else entries.push({ path: p, del: true });
  }
  const changed = entries.filter((e) => (e.del ? head.get(e.path) !== undefined : head.get(e.path) !== `${e.mode} ${e.sha}`));
  if (!changed.length) return { outcome: 'skipped', reason: 'nothing_to_commit' };

  // Is the working tree still equal to the snapshot for the changed files?
  const present = changed.filter((e) => !e.del).map((e) => {
    const s = fs.lstatSync(path.join(root, e.path), { throwIfNoEntry: false });
    return s ? { path: e.path, symlink: s.isSymbolicLink(), exec: s.isFile() && (s.mode & 0o111) !== 0, e } : { path: e.path, missing: true, e };
  });
  let same = changed.filter((e) => e.del).every((e) => !fs.existsSync(path.join(root, e.path)));
  if (same) {
    if (present.some((p) => p.missing)) same = false;
    else {
      const wt = await hashWorktree(root, present, false);
      same = wt.every((w) => { const e = changed.find((c) => c.path === w.path); return e.sha === w.sha && e.mode === w.mode; });
    }
  }
  const res = same ? await commitOnlyPath(root, changed, rec, ctx) : await plumbingPath(root, st, entries, changed, rec, ctx);
  if (!res.ok) return { outcome: 'commit_pending', reason: res.reason, tried: !!res.tried };
  const after = await gitState(root);
  return { outcome: 'committed', sha: after.headSha, files: changed.map((e) => e.path) };
}

// ---------- pending store ----------

function pendingPaths(root) {
  const dir = path.join(root, '.shards', 'state');
  return { dir, file: path.join(dir, 'git-pending.json'), lock: path.join(dir, 'git-pending.lock') };
}

function loadStore(root) {
  const { file } = pendingPaths(root);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return { version: 1, next_seq: 1, records: {} };
    throw e;
  }
  let s;
  try { s = JSON.parse(text); } catch (e) {
    throw new Error(`Corrupt git pending store ${file}: ${e.message}. Refusing to overwrite; fix or delete it.`);
  }
  s.records = s.records && typeof s.records === 'object' ? s.records : {};
  s.next_seq = s.next_seq || 1;
  // Old stores were keyed by bare gate id with no `key` field: the existing key is the record key.
  for (const [k, r] of Object.entries(s.records)) {
    if (!r || typeof r !== 'object') { delete s.records[k]; continue; }
    if (typeof r.key !== 'string' || !r.key) r.key = k;
    if (typeof r.gate !== 'string' || !r.gate) r.gate = k;
  }
  return s;
}

function recordKey(store, gate, session, seq) {
  const base = `${gate}@${session || '-'}#${seq}`;
  let k = base; let n = 2;
  while (store.records[k]) k = `${base}.${n++}`;
  return k;
}

// Is pending record `r` the same gate instance as {gate, session, agent, project, track}?
// Legacy records (no `project` field) match on gate id + session + agent, as before.
function sameInstance(r, { gate, session, agent, project, track }) {
  if (!r || r.gate !== gate) return false;
  if ((r.session || null) !== (session || null)) return false;
  if ((r.agent || null) !== (agent || null)) return false;
  if (!Object.prototype.hasOwnProperty.call(r, 'project')) return true;
  if ((r.project || null) !== (project || null)) return false;
  return !r.track || !track || r.track === track;
}

// Does gate-state entry `g` belong to the instance that pending record `rec` was made for?
function entryMatches(g, rec) {
  if (!g || g.id !== rec.gate) return false;
  if (rec.agent && g.agent && g.agent !== rec.agent) return false;
  if (!Object.prototype.hasOwnProperty.call(rec, 'project')) return true;
  if ((g.project || null) !== (rec.project || null)) return false;
  return !g.track || !rec.track || g.track === rec.track;
}

function saveStore(root, store) {
  const { dir, file } = pendingPaths(root);
  fs.mkdirSync(dir, { recursive: true });
  atomicWrite(file, `${JSON.stringify(store, null, 2)}\n`);
}

async function withPendingLock(root, fn) {
  const { dir, lock } = pendingPaths(root);
  fs.mkdirSync(dir, { recursive: true });
  fs.closeSync(fs.openSync(lock, 'a'));
  const release = await lockfile.lock(lock, PENDING_LOCK_OPTS);
  try { return await fn(); } finally { try { await release(); } catch (_) { /* lock already gone */ } }
}

function nowMs(now) {
  if (typeof now === 'function') return nowMs(now());
  if (now instanceof Date) return now.getTime();
  return typeof now === 'number' ? now : Date.now();
}

// Callers that pass no config (sessions end, force-close, doctor) get the project's git config,
// so `git.commit: false` is honoured on replay too. No config file -> defaults (none is created).
function projectGitConfig(root, config) {
  if (config !== undefined) return config;
  const { loadOrCreateConfig, CONFIG_FILENAME } = require('../config');
  if (!fs.existsSync(path.join(root, CONFIG_FILENAME))) return undefined;
  const c = loadOrCreateConfig(root).config;
  return c ? c.git : undefined;
}

// Session key (string) or session object -> what leases.getLeasedPaths expects.
function sessionOf(root, session) {
  if (typeof session === 'string' && session) return { root, sessionKey: session };
  return session || null;
}
function sessionKeyOf(session) {
  if (session && typeof session === 'object') return session.sessionKey || null;
  return session || null;
}

// An attempt that throws is a failed try for that record, never an abort of the whole replay.
async function safeAttempt(root, rec, ctx) {
  try { return await attempt(root, rec, ctx); } catch (e) {
    return { outcome: 'commit_pending', reason: `commit_error: ${e && e.message ? e.message : e}`, tried: true };
  }
}

// Best-effort: write a replayed record's final outcome back to its gate entry in gates.json.
async function writeBackGate(root, rec, res) {
  if (!rec.session || typeof rec.session !== 'string') return;
  try {
    const { StateStore } = require('../state/store');
    if (!fs.existsSync(path.join(root, '.shards', 'state', 'sessions', rec.session, 'gates.json'))) return;
    await new StateStore(root, rec.session).update('gates', (cur) => {
      // The id may have been reused (another project) since this record was made: the original
      // instance then lives in the current entry's `previous` list.
      const top = (cur.gates || {})[rec.gate];
      const cands = top ? [top, ...(Array.isArray(top.previous) ? top.previous.slice().reverse() : [])] : [];
      const g = cands.find((c) => entryMatches(c, rec));
      if (g && g.status === 'confirmed' && (!g.commit || g.commit.outcome !== 'committed')) {
        g.commit = res.outcome === 'committed'
          ? { outcome: 'committed', sha: res.sha, files: res.files || rec.files, replayed: true }
          : { outcome: 'skipped', reason: res.reason, replayed: true };
        g.updated_at = new Date().toISOString();
      }
      return cur;
    });
  } catch (_) { /* best-effort */ }
}

function normalizeConfig(config) {
  const c = config || {};
  const d = c.denylist || {};
  return {
    commit: c.commit !== false,
    push: false,
    denylist: {
      globs: Array.isArray(d.globs) ? d.globs : DEFAULT_DENYLIST.globs,
      max_file_size_bytes: typeof d.max_file_size_bytes === 'number' ? d.max_file_size_bytes : DEFAULT_DENYLIST.max_file_size_bytes,
    },
  };
}

// Apply an attempt result to a record. Returns 'done' | 'pending' | 'stuck'.
function applyResult(rec, res, t) {
  if (res.outcome === 'committed' || res.outcome === 'skipped') { rec.status = 'done'; if (res.sha) rec.sha = res.sha; return 'done'; }
  rec.reason = res.reason;
  if (res.tried) {
    rec.tries = (rec.tries || 0) + 1;
    if (rec.tries >= MAX_TRIES) { rec.status = 'stuck'; rec.next_try_at = null; return 'stuck'; }
    rec.status = 'pending';
    rec.next_try_at = t + BACKOFF_MS[Math.min(rec.tries, BACKOFF_MS.length - 1)];
    return 'pending';
  }
  if (res.fatal) { rec.status = 'stuck'; rec.next_try_at = null; return 'stuck'; }
  rec.status = 'pending';
  rec.next_try_at = t + PRECONDITION_RETRY_MS;
  return 'pending';
}

async function finishRecord(root, store, rec, status) {
  if (status === 'done') {
    await deleteRef(root, rec.snapshot_ref);
    delete store.records[rec.key];
  } else store.records[rec.key] = rec;
}

// ---------- replay ----------

async function replayLocked(root, { config, now, force, hookTimeoutMs, before } = {}) {
  const cfg = normalizeConfig(config);
  const t = nowMs(now);
  const store = loadStore(root);
  const recs = Object.values(store.records)
    .filter((r) => r.status === 'pending' || r.status === 'stuck')
    .filter((r) => before === undefined || r.seq < before)
    .sort((a, b) => a.seq - b.seq);
  const results = [];
  if (!cfg.commit) {
    for (const r of recs) results.push({ gate: r.gate, outcome: 'skipped', reason: 'commit_disabled', tries: r.tries, status: r.status });
    return { results, blockedBy: recs.length ? recs[0].gate : null };
  }
  const ctx = { cfg, hookTimeoutMs: hookTimeoutMs || DEFAULT_HOOK_TIMEOUT_MS };
  let blocker = null;
  for (const rec of recs) {
    const row = (o) => ({ gate: rec.gate, tries: rec.tries, status: rec.status, ...o });
    if (blocker) { results.push(row({ outcome: 'skipped', reason: `blocked_by_${blocker}` })); continue; }
    if (rec.status === 'stuck' && !force) { blocker = rec.gate; results.push(row({ outcome: 'skipped', reason: 'stuck' })); continue; }
    if (!force && rec.next_try_at && rec.next_try_at > t) { blocker = rec.gate; results.push(row({ outcome: 'skipped', reason: 'not_due' })); continue; }
    const res = await safeAttempt(root, rec, ctx);
    const wasStuck = rec.status === 'stuck';
    const status = applyResult(rec, res, t);
    if (wasStuck && status === 'pending' && res.tried === undefined) rec.status = 'stuck';
    await finishRecord(root, store, rec, status);
    saveStore(root, store);
    if (status !== 'done') blocker = rec.gate;
    else await writeBackGate(root, rec, res);
    results.push({ gate: rec.gate, outcome: res.outcome, sha: res.sha, reason: res.reason, tries: rec.tries, status: rec.status });
  }
  saveStore(root, store);
  return { results, blockedBy: blocker };
}

function replayPending(root, opts = {}) {
  let config;
  try { config = projectGitConfig(root, opts.config); } catch (e) { return Promise.reject(e); }
  return withPendingLock(root, async () => (await replayLocked(root, { ...opts, config })).results);
}

function listPending(root) {
  return Object.values(loadStore(root).records).filter((r) => r.status !== 'done').sort((a, b) => a.seq - b.seq);
}

// ---------- commitGate ----------

function commitGate(args) {
  const root = args.root;
  if (!root) return Promise.reject(new Error('commitGate requires root'));
  let config;
  try { config = projectGitConfig(root, args.config); } catch (e) { return Promise.reject(e); }
  return withPendingLock(root, () => commitGateLocked({ ...args, config }));
}

async function commitGateLocked({ root, gate, agent, project, track, outputDirs, config, session, seq, getLeasedPaths, hookTimeoutMs }) {
  const cfg = normalizeConfig(config);
  const timeout = hookTimeoutMs || DEFAULT_HOOK_TIMEOUT_MS;
  const t = Date.now();
  if (!outputDirs || !outputDirs.length) return { outcome: 'skipped', reason: 'no_output_dirs', files: [] };

  const store = loadStore(root);
  let mySeq;
  if (Number.isInteger(seq)) mySeq = seq; else mySeq = store.next_seq;
  store.next_seq = Math.max(store.next_seq, mySeq + 1);
  const sessionKey = sessionKeyOf(session);
  const inst = { gate, session: sessionKey, agent, project: project || null, track: track || null };
  // Only a re-confirm of the same gate instance replaces its record; other records sharing
  // the gate id (another project/session) stay pending.
  const staleRecs = Object.values(store.records).filter((r) => sameInstance(r, inst));
  if (staleRecs.length) {
    for (const r of staleRecs) delete store.records[r.key];
    saveStore(root, store);
    const live = new Set(Object.values(store.records).map((r) => r.snapshot_ref).filter(Boolean));
    for (const r of staleRecs) if (r.snapshot_ref && !live.has(r.snapshot_ref)) await deleteRef(root, r.snapshot_ref);
  }

  const rec = {
    key: recordKey(store, gate, sessionKey, mySeq),
    gate, agent, project: project || null, track: track || null,
    seq: mySeq, session: sessionKey, output_dirs: outputDirs, snapshot_ref: null, files: [], tries: 0,
    next_try_at: 0, status: 'pending', reason: null, created_at: new Date(t).toISOString(),
  };
  const pendingResult = (reason) => ({ outcome: 'commit_pending', reason, snapshot_ref: rec.snapshot_ref, files: rec.files, pending: true });

  try {
    return await commitGateBody({ root, gate, config, session, getLeasedPaths, cfg, timeout, t, store, rec, mySeq, pendingResult });
  } catch (e) {
    // Never lose the gate's commit: keep a pending record so replay can retry it.
    const fresh = loadStore(root);
    fresh.next_seq = Math.max(fresh.next_seq, store.next_seq);
    applyResult(rec, { outcome: 'commit_pending', reason: `commit_error: ${e && e.message ? e.message : e}`, tried: true }, Date.now());
    fresh.records[rec.key] = rec;
    saveStore(root, fresh);
    return pendingResult(rec.reason);
  }
}

async function commitGateBody({ root, gate, config, session, getLeasedPaths, cfg, timeout, t, store, rec, mySeq, pendingResult }) {
  const st = await gitState(root);
  const leased = typeof getLeasedPaths === 'function' ? await getLeasedPaths(session) : await leases.getLeasedPaths(sessionOf(root, session));
  const files = await collectFiles(root, rec.output_dirs, st, cfg, leased || []);
  rec.files = files.map((f) => f.path);

  if (!st.inRepo) {
    rec.files = files.filter((f) => !f.del).map((f) => f.path);
    rec.reason = 'no_repo';
    rec.next_try_at = t + PRECONDITION_RETRY_MS;
    store.records[rec.key] = rec;
    saveStore(root, store);
    return pendingResult('no_repo');
  }

  const ident = await identEnv(root);
  const changed = await diffAgainstHead(root, st, files);
  if (!changed.length) {
    // Clear a leftover bare-id ref (pre-per-record naming) unless another record still uses it.
    const legacyRef = gateRef(gate);
    if (!Object.values(store.records).some((r) => r.snapshot_ref === legacyRef)) await deleteRef(root, legacyRef);
    saveStore(root, store);
    return { outcome: 'skipped', reason: 'nothing_to_commit', files: [] };
  }
  rec.files = changed.map((e) => e.path);
  rec.snapshot_ref = await createSnapshot(root, st, gate, changed, ident, `shards snapshot ${gate}`, rec.seq);

  // Ordering guard: older pending records go first.
  let blockedBy = null;
  if (cfg.commit) {
    const r = await replayLocked(root, { config, hookTimeoutMs: timeout, before: mySeq });
    blockedBy = r.blockedBy;
  } else {
    const older = listPendingFrom(loadStore(root), mySeq);
    if (older.length) blockedBy = older[0].gate;
  }
  const fresh = loadStore(root);
  fresh.next_seq = Math.max(fresh.next_seq, store.next_seq);

  if (blockedBy) {
    rec.reason = `blocked_by_${blockedBy}`;
    fresh.records[rec.key] = rec;
    saveStore(root, fresh);
    return pendingResult(rec.reason);
  }

  const res = await safeAttempt(root, rec, { cfg, ident, hookTimeoutMs: timeout });
  const status = applyResult(rec, res, Date.now());
  await finishRecord(root, fresh, rec, status);
  saveStore(root, fresh);
  if (res.outcome === 'committed') return { outcome: 'committed', sha: res.sha, files: res.files };
  if (res.outcome === 'skipped') { await deleteRef(root, rec.snapshot_ref); return { outcome: 'skipped', reason: res.reason, files: [] }; }
  return pendingResult(res.reason);
}

function listPendingFrom(store, beforeSeq) {
  return Object.values(store.records).filter((r) => (r.status === 'pending' || r.status === 'stuck') && r.seq < beforeSeq).sort((a, b) => a.seq - b.seq);
}

module.exports = { commitGate, replayPending, listPending, loadStore, gitState, gateRef, recordRef, makeDenyMatcher, BACKOFF_MS, MAX_TRIES };
