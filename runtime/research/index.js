'use strict';
// Autonomous-research (AR) state machine (issue #91, H1 + H2). Backs the ar_start / ar_iterate / ar_status /
// ar_end tools.
//
// The runtime, not the agent, runs the pinned eval command, parses the metric, classifies GREEN/YELLOW/RED,
// keeps or reverts the mutable scope and journals every iteration as a commit on a shards-owned ref:
//
//   refs/shards/research/<project-slug>/<run_id>            (solo run)
//   refs/shards/research/<project-slug>/<run_id>/<branch>   (branch run, issue #91 H4)
//
// built with plumbing (temporary GIT_INDEX_FILE -> write-tree -> commit-tree -> update-ref), the same machinery
// runtime/git uses for refs/shards/pending/*. The user's branch, HEAD and index are never touched: kept state
// stays uncommitted in the working tree, and a revert writes files from a temporary index (checkout-index) and
// deletes files the loop created inside the mutable scope (never files in the pre-loop dirty snapshot).
//
// Journal shape (first parent chain, oldest first):
//   baseline   parent = pre-loop HEAD, tree = HEAD tree, trailers AR-Iter: 0, AR-Decision: baseline, AR-Config
//   iter N     tree = lastKept tree + the iteration's mutable changes (kept OR not), decision trailers
//   revert N   (only when not kept) tree = lastKept tree, AR-Revert: <lastKept sha>
//   defer      (ar_defer) AR-Decision: needs-human, AR-Needs-Human: <kind>, AR-Detail; tree = tip tree, or for a
//              retro_revert the kept state before iteration M (AR-Retro-To: M, AR-Revert: <that commit>)
//   stop       (ar_end) tree = tip tree, AR-Decision: stop, AR-Stop: <reason>
// Every commit carries AR-Run, AR-Iter, AR-Decision, AR-Metric, AR-Eval, AR-Hypothesis-Source and AR-Base
// (the pre-loop HEAD), so state can be rebuilt from `git log --format=%(trailers)` alone (rebuildFromRef).
//
// Branch runs (H4): an AR fan-out runs one branch run per approach family, all sharing one run_id. Each branch
// gets its own git worktree at <root>/.shards/worktrees/<run_id>/<branch>, detached at the pre-loop HEAD (no new
// branch, the user's checkout is never switched). The eval runs with cwd = the worktree, the mutable scope is
// kept/reverted inside it, iteration logs go to <project>/experiments/branches/<branch>/ in the main tree, and the
// worktree is removed by ar_end (unless keep_worktree). Immutable entries missing from the worktree (untracked or
// ignored data) are symlinked to the main tree's copy and pinned there.
//
// Session state: store name `research` ({active: key|null, runs: {<key>: run}}) under
// .shards/state/sessions/<key>/research.json, where key = run_id (solo) or <run_id>/<branch>.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const G = require('../git');
const L = require('../leases');

const STATE = 'research';
const REF_ROOT = 'refs/shards/research';
const DEFAULTS = Object.freeze({ repeats: 3, timeout_s: 900, timeout_grace_s: 60, full_every: 5, epsilon_pct: 1, plateau_window: 5, error_limit: 3, metric_name: 'metric' });
const SEALED = '.shards/state/research-sealed'; // sealed holdout baselines (issue #91, H5); never returned before ar_end
const OUT_CAP = 8 * 1024 * 1024; // keep at most the last 8 MB of each stream in memory
const LOG_TAIL = 64 * 1024; // bytes of each stream written to the iteration log
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const GLOB = /[*?[]/;
const FAILURES = ['crash', 'timeout', 'parse'];
const WORKTREES = '.shards/worktrees';
const MAX_BRANCHES = 4; // global cap on concurrent branch runs (branch leads) of one run id

// ---------- small helpers ----------

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const oneLine = (s, n = 200) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const fmt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? 'NA' : String(Number(v.toPrecision(12))));

function validRunId(id) {
  return typeof id === 'string' && RUN_ID_RE.test(id) && !id.includes('..') && !id.endsWith('.lock');
}
function slugOf(project) {
  const base = String(project || 'research').split('/').filter(Boolean).pop() || 'research';
  const s = base.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[.-]+/, '').replace(/\.lock$/, '-lock').replace(/\.\.+/g, '.');
  return s || 'research';
}
function defaultRunId(now = Date.now()) {
  return `ar-${iso(now).replace(/[-:]/g, '').replace(/\..*$/, '')}`;
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function stddev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

// ---------- state ----------

const runKey = (runId, branch) => (branch ? `${runId}/${branch}` : runId);
const keyOf = (run) => runKey(run.run_id, run.branch);

function readStore(state) {
  const s = state.read(STATE);
  return { active: s.active || null, runs: s.runs || {} };
}
async function saveRun(state, run, { active } = {}) {
  await state.update(STATE, (cur) => {
    cur.runs = cur.runs || {};
    cur.runs[keyOf(run)] = run;
    if (active !== undefined) cur.active = active;
    else if (cur.active === undefined) cur.active = null;
    return cur;
  });
  return run;
}
function activeRun(state) {
  const s = readStore(state);
  return s.active && s.runs[s.active] ? s.runs[s.active] : null;
}
function latestRun(state) {
  const runs = Object.values(readStore(state).runs);
  runs.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
  return runs[0] || null;
}
const liveRuns = (state) => Object.values(readStore(state).runs).filter((r) => r.status !== 'ended');

// The live run an operation targets: by run_id and/or branch, else the session's active run. Several live branch
// runs and no branch given is ambiguous.
function selectLive(state, { run_id: runId, branch } = {}, op) {
  const live = liveRuns(state);
  if (runId || branch) {
    const c = live.filter((r) => (!runId || r.run_id === runId) && (!branch || r.branch === branch));
    if (c.length > 1) throw new Error(`${op}: ${c.length} AR runs match (${c.map(keyOf).join(', ')}); pass run_id and branch`);
    return c[0] || null;
  }
  const branches = live.filter((r) => r.branch);
  if (branches.length > 1) throw new Error(`${op}: ${branches.length} AR branch runs are active (${branches.map(keyOf).join(', ')}); pass branch`);
  return activeRun(state) || (live.length === 1 ? live[0] : null);
}

// The directory that plays the session root for a run: the main root, or the same place inside its worktree.
function workRoot(root, run) {
  return run.worktree ? path.join(root, run.worktree.path, run.worktree.prefix || '') : root;
}
const logDirOf = (run) => (run.branch ? `${run.project}/experiments/branches/${run.branch}` : `${run.project}/experiments`);

// ---------- git ----------

async function repoInfo(root) {
  const st = await G.gitState(root);
  if (!st.inRepo) throw new Error('autonomous research needs a git repository (the research journal is a git ref)');
  if (!st.headSha) throw new Error('autonomous research needs at least one commit (HEAD is unborn)');
  if (st.inProgress) throw new Error(`a git ${st.inProgress} is in progress; finish or abort it first`);
  const top = (await G.gitOk(root, ['rev-parse', '--show-toplevel'])).trim();
  return { ...st, top };
}

// Root-relative paths with uncommitted changes (tracked or untracked, not ignored).
async function dirtyPaths(root, repo) {
  const out = await G.gitOk(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const recs = out.split('\0');
  const res = new Set();
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (!r || r.length < 4) continue;
    const xy = r.slice(0, 2);
    const p = r.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') i++; // the next record is the source path
    if (repo.prefix && !p.startsWith(repo.prefix)) continue;
    res.add(p.slice(repo.prefix.length).replace(/\/+$/, ''));
  }
  return [...res].sort();
}

const mutableMatcher = (mutable) => (rel) => mutable.some((e) => L.entryCovers(e, rel));
function mutableBases(mutable) {
  const bases = mutable.map((e) => (GLOB.test(e) ? L.globBase(e) : e));
  return bases.includes('') ? null : [...new Set(bases)];
}

// Mutable entries of a commit's tree: Map rel -> "mode sha".
async function treeMutable(root, repo, commit, mutable) {
  const isMut = mutableMatcher(mutable);
  const bases = mutableBases(mutable);
  const spec = bases ? bases.map((b) => repo.prefix + b) : (repo.prefix ? [repo.prefix.replace(/\/$/, '')] : []);
  const r = await G.git(root, ['ls-tree', '-r', '-z', '--full-tree', commit, ...(spec.length ? ['--', ...spec] : [])]);
  if (r.code !== 0) throw new Error(`git ls-tree ${commit} failed: ${r.stderr.trim().split('\n')[0]}`);
  const m = new Map();
  for (const rec of r.stdout.split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t');
    const [mode, type, sha] = rec.slice(0, tab).split(' ');
    const full = rec.slice(tab + 1);
    if (type !== 'blob' || (repo.prefix && !full.startsWith(repo.prefix))) continue;
    const rel = full.slice(repo.prefix.length);
    if (isMut(rel)) m.set(rel, `${mode} ${sha}`);
  }
  return m;
}

// Mutable files present in the working tree (tracked or untracked, not ignored): [{path, symlink, exec}].
async function worktreeMutable(root, repo, mutable, exclude) {
  const isMut = mutableMatcher(mutable);
  const bases = mutableBases(mutable);
  const r = await G.git(root, ['ls-files', '-z', '-c', '-o', '--exclude-standard', '--full-name', ...(bases ? ['--', ...bases] : [])]);
  if (r.code !== 0) throw new Error(`git ls-files failed: ${r.stderr.trim().split('\n')[0]}`);
  const seen = new Set();
  const out = [];
  for (const full of r.stdout.split('\0').filter(Boolean)) {
    if (repo.prefix && !full.startsWith(repo.prefix)) continue;
    const rel = full.slice(repo.prefix.length);
    if (seen.has(rel) || !isMut(rel) || (exclude && exclude.has(rel))) continue;
    seen.add(rel);
    let st;
    try { st = fs.lstatSync(path.join(root, rel)); } catch (_) { continue; } // tracked but deleted on disk
    if (st.isDirectory()) continue; // a nested repository / submodule
    out.push({ path: rel, symlink: st.isSymbolicLink(), exec: process.platform !== 'win32' && st.isFile() && (st.mode & 0o111) !== 0 });
  }
  return out;
}

// Difference between the working tree's mutable scope and a commit: {entries (index-info), changed paths, present}.
async function mutableDiff(root, repo, commit, run, { write }) {
  const exclude = new Set(run.preLoopDirty || []);
  const tree = await treeMutable(root, repo, commit, run.mutable);
  for (const p of exclude) tree.delete(p);
  const files = await worktreeMutable(root, repo, run.mutable, exclude);
  const hashed = await G.hashWorktree(root, files, write);
  const present = new Set();
  const entries = [];
  for (const h of hashed) {
    present.add(h.path);
    if (tree.get(h.path) !== `${h.mode} ${h.sha}`) entries.push(h);
  }
  for (const p of tree.keys()) if (!present.has(p)) entries.push({ path: p, del: true });
  return { tree, entries, present };
}

async function writeTreeFrom(root, repo, baseCommit, entries) {
  return G.withTmpDir(async (dir) => {
    const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
    await G.gitOk(root, ['read-tree', baseCommit], { env });
    if (entries.length) await G.gitOk(root, ['update-index', '--add', '--remove', '--index-info'], { env, input: G.indexInfo(repo.prefix, entries) });
    return (await G.gitOk(root, ['write-tree'], { env })).trim();
  });
}

async function commitTree(root, tree, parent, message) {
  const ident = await G.identEnv(root);
  const sha = (await G.gitOk(root, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-F', '-'], { env: ident, input: message })).trim();
  return sha;
}

async function advanceRef(root, ref, next, prev) {
  await G.gitOk(root, ['update-ref', '-m', `shards research: ${next.slice(0, 12)}`, ref, next, prev || G.ZERO_SHA]);
}

async function refTip(root, ref) {
  const r = await G.git(root, ['rev-parse', '-q', '--verify', `${ref}^{commit}`]);
  return r.code === 0 ? r.stdout.trim() : null;
}

async function locDelta(root, fromTree, toTree) {
  const out = await G.gitOk(root, ['diff', '--numstat', '--no-renames', fromTree, toTree]);
  let add = 0; let del = 0;
  for (const line of out.split('\n')) {
    const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
    if (!m || m[1] === '-') continue;
    add += Number(m[1]); del += Number(m[2]);
  }
  return { added: add, deleted: del, net: add - del };
}

// Restore the mutable scope of the working tree to `target` (a commit). Files are written from a temporary
// index (the user's index is untouched); files absent from the target that the loop created are deleted by
// explicit path. Pre-loop dirty paths are never touched.
async function revertMutable(root, repo, target, run) {
  const { tree, entries } = await mutableDiff(root, repo, target, run, { write: false });
  const restore = entries.filter((e) => !e.del && tree.has(e.path)).map((e) => e.path)
    .concat(entries.filter((e) => e.del).map((e) => e.path));
  const remove = entries.filter((e) => !e.del && !tree.has(e.path)).map((e) => e.path);
  for (const rel of remove) fs.rmSync(path.join(root, rel), { force: true });
  if (restore.length) {
    await G.withTmpDir(async (dir) => {
      const env = { GIT_INDEX_FILE: path.join(dir, 'index') };
      await G.gitOk(repo.top, ['read-tree', target], { env });
      for (let i = 0; i < restore.length; i += 200) {
        const part = restore.slice(i, i + 200).map((p) => repo.prefix + p);
        await G.gitOk(repo.top, ['checkout-index', '-f', '-q', '--', ...part], { env });
      }
    });
  }
  return { restored: restore.sort(), deleted: remove.sort() };
}

// ---------- immutable pins ----------

function walkFiles(abs, rel, out, skipTop) {
  let ents;
  try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch (_) { return; }
  for (const d of ents) {
    if (d.name === '.git' || (skipTop && (d.name === '.shards'))) continue;
    const a = path.join(abs, d.name); const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) walkFiles(a, r, out, false);
    else out.push(r);
  }
}
function fileDigest(abs) {
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) return `link:${sha256(fs.readlinkSync(abs))}`;
  // Chunked read: datasets above 2 GiB cannot go through readFileSync.
  const h = crypto.createHash('sha256'); const buf = Buffer.allocUnsafe(1 << 20); const fd = fs.openSync(abs, 'r');
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(n === buf.length ? buf : buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest('hex');
}
function listDigest(root, rels) {
  const lines = rels.sort().map((r) => `${r}\0${fileDigest(path.join(root, r))}\n`);
  return sha256(lines.join(''));
}

// sha256 of one immutable entry: a file's bytes, a directory's sorted (path, sha) list, or a glob's matches.
function hashEntry(root, entry) {
  if (GLOB.test(entry)) {
    const base = L.globBase(entry);
    const files = [];
    walkFiles(path.join(root, base), base, files, !base);
    return listDigest(root, files.filter((r) => L.entryCovers(entry, r)));
  }
  const abs = path.join(root, entry);
  let st;
  try { st = fs.lstatSync(abs); } catch (_) { return 'missing'; }
  if (st.isDirectory()) {
    const files = [];
    walkFiles(abs, entry, files, false);
    return listDigest(root, files);
  }
  return fileDigest(abs);
}
// linked: immutable entries symlinked into a worktree from the main tree (`mainRoot`); pinned at the source.
function pinImmutable(root, immutable, { linked, mainRoot } = {}) {
  const out = {};
  for (const e of immutable) out[e] = hashEntry(linked && linked.includes(e) ? mainRoot : root, e);
  return out;
}
const pinRun = (root, run) => pinImmutable(workRoot(root, run), run.immutable, { linked: run.worktree && run.worktree.linked, mainRoot: root });

// ---------- eval ----------

function appendCapped(buf, chunk) {
  const s = buf + chunk;
  return s.length > OUT_CAP ? s.slice(s.length - OUT_CAP) : s;
}

function killGroup(child, sig) {
  if (process.platform === 'win32') { G.killTree(child, sig); return; }
  try { process.kill(-child.pid, sig); } catch (_) { try { child.kill(sig); } catch (_e) { /* gone */ } }
}

// Run the pinned eval command through the shell with a hard timeout (the whole process group is killed).
function runCommand(command, { cwd, timeoutMs, env }) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let stdout = ''; let stderr = ''; let timedOut = false; let done = false;
    let timer = null; let killTimer = null; let hardTimer = null;
    let child;
    const finish = (code, signal, error) => {
      if (done) return; done = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(hardTimer);
      if (timedOut && child) killGroup(child, 'SIGKILL'); // grandchildren that ignored SIGTERM outlive the leader
      resolve({ code: code === null || code === undefined ? (timedOut ? 124 : 1) : code, signal: signal || null, error: error || null, stdout, stderr, timedOut, duration_ms: Date.now() - t0 });
    };
    try {
      child = spawn(command, { cwd, env: { ...process.env, ...env }, shell: true, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { finish(127, null, e.message); return; }
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout = appendCapped(stdout, c); });
    child.stderr.on('data', (c) => { stderr = appendCapped(stderr, c); });
    child.on('error', (e) => finish(127, null, e.message));
    child.on('close', (code, signal) => finish(code, signal));
    timer = setTimeout(() => {
      timedOut = true;
      killGroup(child, 'SIGTERM');
      killTimer = setTimeout(() => killGroup(child, 'SIGKILL'), 2000);
      hardTimer = setTimeout(() => finish(124, 'SIGKILL'), 5000);
    }, timeoutMs);
  });
}

function jsonGet(obj, p) {
  const segs = String(p).replace(/^\$\.?/, '').split(/\.|\[(\d+)\]/).filter((s) => s !== undefined && s !== '');
  let cur = obj;
  for (const s of segs) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[/^\d+$/.test(s) && Array.isArray(cur) ? Number(s) : s];
  }
  return cur;
}

// The metric value from the eval output, or null. metric_regex: group 1 (or the whole match) of the LAST match
// in stdout (stderr when stdout has none). json_path: stdout as JSON, else its last line that parses.
function parseMetric(ev, stdout, stderr) {
  if (ev.metric_regex) {
    const re = new RegExp(ev.metric_regex, 'gm');
    for (const text of [stdout, stderr]) {
      let last = null;
      for (const m of String(text || '').matchAll(re)) last = m;
      if (last) return toMetric(last[1] !== undefined ? last[1] : last[0]);
    }
    return null;
  }
  const cands = [String(stdout || '').trim(), ...String(stdout || '').trim().split('\n').reverse()];
  for (const c of cands) {
    if (!c) continue;
    let obj;
    try { obj = JSON.parse(c); } catch (_) { continue; }
    const v = toMetric(jsonGet(obj, ev.json_path));
    if (v !== null) return v; // a later line that parses as JSON (a bare number, `true`) is not the metric line
  }
  return null;
}
// A metric value: a finite number or a non-empty numeric string. null, '', true, [] are not 0/1.
function toMetric(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v.trim()) return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

const tail = (s) => (Buffer.byteLength(s) > LOG_TAIL ? `[... truncated ...]\n${s.slice(-LOG_TAIL)}` : s);
function writeLog(file, header, res, append) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = [
    `# ${header}`,
    `exit_code: ${res.code}${res.signal ? ` (signal ${res.signal})` : ''}${res.timedOut ? ' TIMEOUT' : ''}`,
    `duration_ms: ${res.duration_ms}`,
    res.error ? `error: ${res.error}` : null,
    `metric: ${fmt(res.metric)}`,
    '--- stdout (tail) ---', tail(res.stdout), '--- stderr (tail) ---', tail(res.stderr), '',
  ].filter((x) => x !== null).join('\n');
  if (append) fs.appendFileSync(file, text); else fs.writeFileSync(file, text);
}

// root: the main (session) root; the eval runs in the run's work root (its worktree for a branch run) and the
// log is written under the main root.
// spec: run.eval (full), run.proxy or run.holdout; kind (full|proxy|holdout) is passed as SHARDS_AR_EVAL. A fixed
// compute budget (Karpathy mode) reaches the command as SHARDS_AR_COMPUTE_BUDGET_S; the kill timeout is timeout_s.
async function evaluate(root, run, { label, logFile, append, iter, spec = run.eval, kind = 'full' }) {
  const cwd = workRoot(root, run);
  const env = { SHARDS_AR_RUN: run.run_id, SHARDS_AR_ITER: String(iter), SHARDS_AR_EVAL: kind };
  if (spec.fixed_budget_s) env.SHARDS_AR_COMPUTE_BUDGET_S = String(spec.fixed_budget_s);
  if (run.branch) Object.assign(env, { SHARDS_AR_BRANCH: run.branch, SHARDS_AR_WORKTREE: cwd, SHARDS_AR_MAIN_ROOT: root });
  const res = await runCommand(spec.command, { cwd, timeoutMs: spec.timeout_s * 1000, env });
  res.metric = res.timedOut || res.code !== 0 ? null : parseMetric(spec, res.stdout, res.stderr);
  res.failure = res.timedOut ? 'timeout' : res.code !== 0 ? 'crash' : res.metric === null ? 'parse' : null;
  writeLog(path.resolve(root, logFile), `${label}${run.branch ? ` [branch ${run.branch}, cwd ${path.relative(root, cwd) || '.'}]` : ''} | ${kind} | ${spec.command}`, res, append);
  return res;
}

// ---------- classification + convergence ----------

// ref / eps default to the full-eval reference; proxy iterations pass the proxy reference and proxy epsilon.
function classify(run, after, failure, ref = run.comparisonReference, eps = run.epsilon_abs) {
  if (failure) return 'red';
  const d = (run.eval.direction === 'minimize' ? -1 : 1) * (after - ref);
  if (d > eps) return 'green';
  if (d < -eps) return 'red';
  return 'yellow';
}

// Trailing counters derived from the iteration list (so a rebuilt run gets the same numbers).
function deriveCounters(iterations) {
  const c = { consecutiveRegressions: 0, consecutiveFailures: 0, consecutiveTimeouts: 0, consecutiveYellowKept: 0, iterationsSinceLastGreen: 0 };
  const trail = (pred) => { let n = 0; for (let i = iterations.length - 1; i >= 0 && pred(iterations[i]); i--) n++; return n; };
  c.consecutiveRegressions = trail((x) => x.decision === 'red');
  c.consecutiveFailures = trail((x) => FAILURES.includes(x.failure));
  c.consecutiveTimeouts = trail((x) => x.failure === 'timeout');
  // Kept YELLOWs since the last GREEN or re-baseline (REDs and reverted YELLOWs do not reset it, protocol C.2).
  for (let i = iterations.length - 1; i >= 0; i--) {
    const x = iterations[i];
    if (x.decision === 'green' || x.rebaselined) break;
    if (x.decision === 'yellow' && x.kept) c.consecutiveYellowKept++;
  }
  c.iterationsSinceLastGreen = trail((x) => x.decision !== 'green');
  return c;
}

function activationFloor(run) { return Math.max(10, Math.ceil(run.budget.iterations * 0.2)); }

// First stop condition that fires after the latest iteration (protocol §E order, safety rails first), or null.
function stopReason(run, now = Date.now()) {
  const it = run.iterations; const N = it.length;
  const timeUp = !!(run.budget && run.budget.minutes) && now - Date.parse(run.started_at) >= run.budget.minutes * 60000;
  if (!N) return timeUp ? 'time-budget' : null;
  const last = it[N - 1];
  if (last.failure === 'tamper') return 'tamper';
  const c = deriveCounters(it);
  if (c.consecutiveFailures >= DEFAULTS.error_limit) return c.consecutiveTimeouts >= DEFAULTS.error_limit ? 'timeout-limit' : 'error-limit';
  const W = run.convergence.plateau_window;
  if (N >= activationFloor(run)) {
    if (N >= W && it.slice(-W).every((x) => x.decision !== 'green' || x.unwound)) return 'plateau';
    if (N >= 2 * W) {
      const prev = N - 2 * W === 0 ? run.baseline : it[N - 2 * W - 1].bestSoFar;
      const gain = (run.eval.direction === 'minimize' ? -1 : 1) * (last.bestSoFar - prev);
      if (gain < diminishingAbs(run)) return 'diminishing-returns';
    }
  }
  if (N >= run.budget.iterations) return 'budget-exhausted';
  if (timeUp) return 'time-budget';
  return null;
}
function diminishingAbs(run) {
  const pct = run.convergence.diminishing_returns_pct;
  return pct === null || pct === undefined ? 2 * run.epsilon_abs : (pct / 100) * Math.abs(run.baseline);
}

// ---------- commit messages ----------

function trailers(run, t) {
  const lines = [
    ['AR-Run', run.run_id], ...(run.branch ? [['AR-Branch', run.branch]] : []), ['AR-Iter', t.iter], ['AR-Decision', t.decision],
    ['AR-Metric', `${run.eval.name}=${fmt(t.before)}->${fmt(t.after)}`],
    ['AR-Eval', t.evalType || 'full'], ['AR-Hypothesis-Source', t.source || 'adaptive'],
  ];
  if (t.hypothesis) lines.push(['AR-Hypothesis', oneLine(t.hypothesis, 300)]);
  if (t.kept !== undefined) lines.push(['AR-Kept', t.kept ? 'true' : 'false']);
  if (t.best !== undefined) lines.push(['AR-Best', fmt(t.best)]);
  if (t.failure) lines.push(['AR-Failure', t.failure]);
  if (t.loc) lines.push(['AR-LOC', `+${t.loc.added} -${t.loc.deleted} (net ${t.loc.net})`]);
  if (t.rebaselined) lines.push(['AR-Rebaseline', 'true']);
  if (t.proxyBest !== undefined) lines.push(['AR-Proxy-Best', fmt(t.proxyBest)]);
  if (t.unwind) lines.push(['AR-Unwind', t.unwind.join(',')]);
  if (t.revert) lines.push(['AR-Revert', t.revert]);
  if (t.stop) lines.push(['AR-Stop', oneLine(t.stop, 200)]);
  if (t.holdout) lines.push(['AR-Holdout', holdoutTrailer(run, t.holdout)]);
  if (t.needsHuman) lines.push(['AR-Needs-Human', t.needsHuman]);
  if (t.retroTo) lines.push(['AR-Retro-To', t.retroTo]);
  if (t.detail) lines.push(['AR-Detail', oneLine(t.detail, 300)]);
  lines.push(['AR-Base', run.pre_loop_head]);
  if (t.config) lines.push(['AR-Config', JSON.stringify(t.config)]);
  return lines.map(([k, v]) => `${k}: ${v}`).join('\n');
}
function message(subject, body, tr) {
  return `${subject}\n\n${body ? `${body}\n\n` : ''}${tr}\n`;
}

// The run fields a rebuild needs (AR-Config on the baseline commit).
function configOf(run) {
  // run.holdout is configuration only; its sealed baseline value lives under SEALED, never in the journal.
  const keys = ['run_id', 'branch', 'worktree', 'project', 'ref', 'brief_path', 'mutable', 'immutable', 'eval', 'proxy', 'holdout', 'budget', 'epsilon_pct', 'epsilon_abs', 'noise', 'baseline', 'convergence', 'hashes', 'pre_loop_head', 'preLoopDirty', 'started_at', 'session'];
  const o = {};
  for (const k of keys) o[k] = run[k];
  return o;
}

// ---------- public operations ----------

// One eval command spec (the full eval, the proxy or the holdout): exactly one metric extractor, a kill timeout and
// an optional fixed compute budget (Karpathy mode, issue #91 H5): fixed_budget_s (alias compute_budget_s) is passed
// to the command as SHARDS_AR_COMPUTE_BUDGET_S and, without an explicit timeout_s, the kill timeout becomes
// fixed_budget_s + timeout_grace_s (default 60).
function evalSpec(ev, label, { timeout_s: inheritTimeout } = {}) {
  if (!ev || typeof ev.command !== 'string' || !ev.command.trim()) throw new Error(`ar_start: ${label} needs a command`);
  if (!!ev.metric_regex === !!ev.json_path) throw new Error(`ar_start: ${label} needs exactly one of metric_regex or json_path`);
  if (ev.metric_regex) {
    try { new RegExp(ev.metric_regex, 'gm'); } catch (e) { throw new Error(`ar_start: invalid ${label} metric_regex: ${e.message}`); }
  }
  const fb = ev.fixed_budget_s; const cb = ev.compute_budget_s;
  if (fb != null && cb != null && fb !== cb) throw new Error(`ar_start: ${label} has both fixed_budget_s and compute_budget_s (aliases); pass one`);
  const budget = fb != null ? fb : cb != null ? cb : null;
  if (budget !== null && !(Number.isFinite(budget) && budget > 0)) throw new Error(`ar_start: ${label} fixed_budget_s must be a positive number`);
  const grace = ev.timeout_grace_s != null ? ev.timeout_grace_s : DEFAULTS.timeout_grace_s;
  const timeout = ev.timeout_s || (budget ? budget + grace : inheritTimeout || DEFAULTS.timeout_s);
  if (budget && timeout <= budget) throw new Error(`ar_start: ${label} timeout_s (${timeout}) must exceed fixed_budget_s (${budget}); omit timeout_s to get fixed_budget_s + timeout_grace_s`);
  return {
    command: ev.command, metric_regex: ev.metric_regex || null, json_path: ev.json_path || null, timeout_s: timeout,
    ...(budget ? { fixed_budget_s: budget, timeout_grace_s: grace } : {}),
  };
}

function normalizeStartArgs(args) {
  const project = L.normalizeRel(String(args.project).replace(/\/+$/, ''));
  const norm = (xs) => [...new Set((xs || []).map((p) => L.normalizeRel(String(p).replace(/\/+$/, ''))))];
  const mutable = norm(args.mutable);
  const holdoutPaths = norm(args.holdout_paths);
  if (holdoutPaths.length && !args.holdout) throw new Error('ar_start: holdout_paths needs a holdout command');
  // Holdout data is immutable (pinned, denied by the lease) on top of being sealed by intent.
  const immutable = [...new Set([...norm(args.immutable), ...holdoutPaths])];
  if (!mutable.length) throw new Error('ar_start: mutable must list at least one path or glob');
  // The AR project dir holds the iteration logs and the agent's docs, and .shards/ holds runtime state: a mutable
  // entry covering either would commit and revert them with every iteration.
  if (args.eval && args.eval.name !== undefined && !/^[A-Za-z0-9_.-]+$/.test(String(args.eval.name))) throw new Error('ar_start: eval.name must match [A-Za-z0-9_.-]+ (it is written into journal trailers)');
  const reserved = [project, `${project}/experiments/iter_1.log`, `${project}/project-specs.md`, `${project}/README.md`, '.shards', '.shards/state/x.json'];
  for (const m of mutable) {
    const hit = reserved.find((r) => L.entryCovers(m, r));
    if (hit) throw new Error(`ar_start: mutable entry ${m} covers ${hit.startsWith('.shards') ? '.shards/' : `the AR project dir ${project}`}; list the code/config paths the loop may change, outside ${project}/ and .shards/`);
  }
  for (const m of mutable) {
    const probe = GLOB.test(m) ? L.globBase(m) : m;
    if (probe && immutable.some((e) => L.entryCovers(e, probe))) throw new Error(`ar_start: mutable entry ${m} lies inside an immutable${holdoutPaths.some((e) => L.entryCovers(e, probe)) ? ' (holdout)' : ''} path`);
    if (holdoutPaths.some((h) => L.entryCovers(m, GLOB.test(h) ? L.globBase(h) || h : h))) throw new Error(`ar_start: holdout path inside the mutable entry ${m}`);
  }
  const ev = args.eval || {};
  const full = evalSpec(ev, 'eval');
  const evalCfg = { ...full, direction: ev.direction, repeats: ev.repeats || DEFAULTS.repeats, name: ev.name || DEFAULTS.metric_name };
  let proxy = null;
  if (ev.proxy) {
    proxy = { ...evalSpec(ev.proxy, 'eval.proxy', { timeout_s: full.timeout_s }), repeats: ev.proxy.repeats || evalCfg.repeats };
    const every = ev.full_every != null ? ev.full_every : ev.proxy.every != null ? ev.proxy.every : DEFAULTS.full_every;
    if (!Number.isInteger(every) || every < 1) throw new Error('ar_start: eval.full_every must be an integer >= 1');
    evalCfg.full_every = every;
  } else if (ev.full_every != null) throw new Error('ar_start: eval.full_every needs eval.proxy');
  let holdout = null;
  if (args.holdout) {
    holdout = { ...evalSpec(args.holdout, 'holdout', { timeout_s: full.timeout_s }), paths: holdoutPaths, baseline: args.holdout.baseline !== false };
  }
  const budget = { iterations: args.budget.iterations, minutes: args.budget.minutes || null };
  const conv = args.convergence || {};
  return {
    project, mutable, immutable, eval: evalCfg, proxy, holdout, budget,
    epsilon_pct: args.epsilon === undefined ? DEFAULTS.epsilon_pct : args.epsilon,
    convergence: { plateau_window: conv.plateau_window || DEFAULTS.plateau_window, diminishing_returns_pct: conv.diminishing_returns_pct === undefined ? null : conv.diminishing_returns_pct },
  };
}

// ---------- sealed holdout (issue #91, H5) ----------

const sealedFile = (root, run) => path.join(root, SEALED, slugOf(run.project), `${keyOf(run)}.json`);
function readSealed(root, run) {
  try { return JSON.parse(fs.readFileSync(sealedFile(root, run), 'utf8')); } catch (_) { return null; }
}
function writeSealed(root, run, data) {
  const f = sealedFile(root, run);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify(data, null, 2)}\n`);
}
function holdoutTrailer(run, h) {
  if (h.skipped) return 'skipped';
  if (h.tampered) return `tampered (${h.tampered.join(', ')})`;
  const base = `${run.eval.name}=${fmt(h.baseline)}->${fmt(h.final)}`;
  return h.failure ? `${base} (failed: ${h.failure})` : `${base} (delta ${fmt(h.delta)})`;
}
function parseHoldoutTrailer(v) {
  if (!v) return null;
  if (v === 'skipped') return { skipped: true };
  const t = /^tampered \((.*)\)$/.exec(v);
  if (t) return { tampered: t[1].split(', ') };
  const m = /=(\S+)->(\S+) \((?:delta (\S+)|failed: (\S+))\)$/.exec(v);
  if (!m) return { raw: v };
  return { baseline: num(m[1]), final: num(m[2]), delta: m[3] !== undefined ? num(m[3]) : null, ...(m[4] ? { failure: m[4] } : {}) };
}
function holdoutTamper(root, run) {
  const now = pinRun(root, run);
  const bad = run.holdout.paths.filter((k) => now[k] !== run.hashes.immutable[k]);
  if (run.hashes.holdout_command && sha256(run.holdout.command) !== run.hashes.holdout_command) bad.push('<holdout command>');
  return bad;
}
// The one holdout evaluation of the kept state (ar_end). The sealed pre-loop value is unsealed here.
async function runHoldout(root, run) {
  const tampered = holdoutTamper(root, run);
  const sealed = readSealed(root, run);
  const baseline = sealed && Number.isFinite(sealed.baseline) ? sealed.baseline : null;
  if (tampered.length) return { metric: run.eval.name, tampered, baseline, final: null, delta: null };
  const logFile = `${logDirOf(run)}/holdout.log`;
  const N = (run.iterations || []).length;
  const r = await evaluate(root, run, { label: `AR ${keyOf(run)} holdout (kept state, ar_end)`, logFile, iter: N, spec: run.holdout, kind: 'holdout' });
  const final = r.failure ? null : r.metric;
  return {
    metric: run.eval.name, direction: run.eval.direction, baseline, final,
    delta: final !== null && baseline !== null ? final - baseline : null,
    ...(r.failure ? { failure: r.failure } : {}), log: logFile,
    ...(baseline === null && run.holdout.baseline ? { note: 'the sealed baseline value was not found (.shards/state/research-sealed/)' } : {}),
  };
}

const locks = new Set();
async function withRunLock(key, fn) {
  if (locks.has(key)) throw new Error(`an AR operation for run ${key} is already in progress`);
  locks.add(key);
  try { return await fn(); } finally { locks.delete(key); }
}

// ---------- branch worktrees (issue #91, H4) ----------

// Make sure <root>/.shards/worktrees/ is ignored by the main repository (else every branch worktree shows up as
// an untracked nested repository): add it to the repo-local info/exclude when no ignore rule covers it.
async function excludeWorktrees(root, repo) {
  const probe = `${WORKTREES}/probe`;
  const ig = await G.git(root, ['check-ignore', '-q', '--no-index', probe]);
  if (ig.code === 0) return false;
  const p = (await G.gitOk(root, ['rev-parse', '--git-path', 'info/exclude'])).trim();
  const file = path.resolve(root, p);
  const line = `/${repo.prefix}${WORKTREES}/`;
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { /* none yet */ }
  if (text.split('\n').includes(line)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${text && !text.endsWith('\n') ? '\n' : ''}# shards: autonomous-research branch worktrees\n${line}\n`);
  return true;
}

// Symlink immutable entries the worktree lacks (untracked or ignored data, local configs) to the main tree's
// copy. Returns the linked entries (pinned at the main tree). Globs are not linked.
function linkMissingImmutable(root, wroot, immutable) {
  const linked = [];
  for (const e of immutable) {
    if (GLOB.test(e)) continue;
    const dst = path.join(wroot, e); const src = path.join(root, e);
    let have = false;
    try { fs.lstatSync(dst); have = true; } catch (_) { /* missing */ }
    if (have || !fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const isDir = fs.statSync(src).isDirectory();
    try { fs.symlinkSync(src, dst, isDir ? 'junction' : 'file'); } catch (err) {
      // Windows without symlink rights (EPERM): copy the file; a directory junction needs no rights.
      if (err.code !== 'EPERM' || isDir) throw new Error(`cannot link immutable ${e} into the branch worktree: ${err.message}`);
      fs.copyFileSync(src, dst);
    }
    linked.push(e);
  }
  return linked;
}

async function addWorktree(root, wtAbs, commit) {
  fs.mkdirSync(path.dirname(wtAbs), { recursive: true });
  const r = await G.git(root, ['worktree', 'add', '--detach', '--quiet', wtAbs, commit]);
  if (r.code === 0) return;
  // A stale registration of this path (worktree dir deleted by hand) blocks `add`; prune it and retry once.
  // Prune is repo-wide, so it only runs when add failed.
  await G.git(root, ['worktree', 'prune']);
  await G.gitOk(root, ['worktree', 'add', '--detach', '--quiet', wtAbs, commit]);
}

// Remove a shards-owned branch worktree. The runtime runs git itself (not through the hook's git guard).
async function removeWorktree(root, run) {
  if (!run.worktree) return false;
  const wtAbs = path.join(root, run.worktree.path);
  const wroot = workRoot(root, run);
  for (const e of run.worktree.linked || []) {
    try { if (fs.lstatSync(path.join(wroot, e)).isSymbolicLink()) fs.unlinkSync(path.join(wroot, e)); } catch (_) { /* gone */ }
  }
  let removed = false;
  if (fs.existsSync(wtAbs)) {
    const r = await G.git(root, ['worktree', 'remove', '--force', '--force', wtAbs]);
    if (r.code !== 0) { fs.rmSync(wtAbs, { recursive: true, force: true }); await G.git(root, ['worktree', 'prune']); }
    removed = true;
  }
  try { fs.rmdirSync(path.dirname(wtAbs)); } catch (_) { /* other branches still there */ }
  return removed;
}

// Recreate a lost worktree (resume after a crash or a manual removal): detached at the pre-loop HEAD, immutable
// entries relinked, the mutable scope restored to lastKeptCommit.
async function ensureWorktree(root, run) {
  if (!run.worktree) return false;
  const wtAbs = path.join(root, run.worktree.path);
  const wroot = workRoot(root, run);
  let created = false;
  if (!fs.existsSync(path.join(wtAbs, '.git'))) {
    if (fs.existsSync(wtAbs)) fs.rmSync(wtAbs, { recursive: true, force: true });
    await addWorktree(root, wtAbs, run.pre_loop_head);
    created = true;
  }
  const linked = linkMissingImmutable(root, wroot, run.immutable);
  run.worktree.linked = [...new Set([...(run.worktree.linked || []), ...linked])];
  if (created && run.lastKeptCommit !== run.pre_loop_head) await revertMutable(wroot, await repoInfo(wroot), run.lastKeptCommit, run);
  return created;
}

async function start(ctx, args) {
  const { root, state } = ctx;
  const session = { root, sessionKey: ctx.sessionKey, state };
  const branch = args.branch === undefined || args.branch === null || args.branch === '' ? null : args.branch;
  if (args.worktree === true && !branch) throw new Error('ar_start: worktree=true needs a branch name');
  if (branch && args.worktree === false) throw new Error('ar_start: a branch run needs its own worktree (concurrent branches cannot share the working tree); omit worktree or pass worktree=true');
  if (branch && !validRunId(branch)) throw new Error(`ar_start: invalid branch ${JSON.stringify(branch)} (letters, digits, . _ -; max 64)`);
  const runId = args.run_id || defaultRunId();
  if (!validRunId(runId)) throw new Error(`ar_start: invalid run_id ${JSON.stringify(runId)} (letters, digits, . _ -; max 64)`);
  for (const r of liveRuns(state)) {
    const sibling = branch && r.branch && r.run_id === runId;
    if (!sibling) throw new Error(`ar_start: AR run ${keyOf(r)} is already active in this session; call ar_end first${branch && r.run_id === runId ? ' (a run id is either solo or branched)' : ''}`);
  }
  if (branch) {
    const siblings = liveRuns(state).filter((r) => r.run_id === runId && r.branch);
    if (siblings.length >= MAX_BRANCHES) throw new Error(`ar_start: run ${runId} already has ${siblings.length} active branch runs (cap ${MAX_BRANCHES}); end one first`);
  }
  const lease0 = L.getActiveArLease(session);
  if (lease0 && !(branch && lease0.ar.run_id === runId && lease0.ar.branches)) throw new Error(`ar_start: AR lease ${lease0.id} (run ${lease0.ar.run_id}) is already active; call ar_end first`);
  const cfg = normalizeStartArgs(args);
  const key = runKey(runId, branch);
  const existing = readStore(state).runs[key];
  if (existing) throw new Error(`ar_start: run ${key} already exists in this session`);
  const brief = L.normalizeRel(args.brief_path);
  if (!fs.existsSync(path.join(root, brief))) throw new Error(`ar_start: brief_path ${brief} does not exist (write the research brief first)`);

  return withRunLock(key, async () => {
    const repo = await repoInfo(root);
    const slug = slugOf(cfg.project);
    const runRef = `${REF_ROOT}/${slug}/${runId}`;
    const ref = branch ? `${runRef}/${branch}` : runRef;
    if (await refTip(root, ref)) throw new Error(`ar_start: ${ref} already exists; pick another run_id`);
    // A run id is either solo (one ref) or branched (refs under it): git cannot hold both (D/F conflict).
    if (branch && await refTip(root, runRef)) throw new Error(`ar_start: ${runRef} is a solo run; pick another run_id for a branched run`);
    if (!branch && (await listRefs(root)).some((r) => r.startsWith(`${runRef}/`))) throw new Error(`ar_start: ${runRef} already has branch runs; pick another run_id`);
    const chk = await G.git(root, ['check-ref-format', ref]);
    if (chk.code !== 0) throw new Error(`ar_start: ${ref} is not a valid ref name`);

    const dirty = await dirtyPaths(root, repo);
    const isMut = mutableMatcher(cfg.mutable);
    const dirtyMut = dirty.filter(isMut);
    if (dirtyMut.length) throw new Error(`ar_start: the mutable scope has uncommitted changes (${dirtyMut.slice(0, 10).join(', ')}${dirtyMut.length > 10 ? ', ...' : ''}); ask the user to commit or stash them first, ${branch ? 'the branch worktree starts from HEAD and would not see them' : 'a revert would overwrite them'}`);

    const run = {
      run_id: runId, project: cfg.project, ref, brief_path: brief, session: ctx.sessionKey,
      mutable: cfg.mutable, immutable: cfg.immutable, eval: cfg.eval, budget: cfg.budget,
      ...(cfg.proxy ? { proxy: cfg.proxy } : {}), ...(cfg.holdout ? { holdout: cfg.holdout } : {}),
      epsilon_pct: cfg.epsilon_pct, convergence: cfg.convergence,
      pre_loop_head: repo.headSha, started_at: iso(), status: 'active',
    };
    if (branch) run.branch = branch;

    let wtAbs = null;
    try {
      let wroot = root;
      if (branch) {
        const wtRel = `${WORKTREES}/${runId}/${branch}`;
        wtAbs = path.join(root, wtRel);
        if (fs.existsSync(wtAbs)) { wtAbs = null; throw new Error(`ar_start: ${wtRel} already exists (an earlier run kept it); remove it with \`git worktree remove ${wtRel}\` or pick another run_id`); }
        await excludeWorktrees(root, repo);
        await addWorktree(root, wtAbs, repo.headSha);
        run.worktree = { path: wtRel, prefix: repo.prefix || '', linked: [] };
        wroot = workRoot(root, run);
        run.worktree.linked = linkMissingImmutable(root, wroot, cfg.immutable);
        const linked = new Set(run.worktree.linked);
        const stale = dirty.filter((p) => cfg.immutable.some((e) => !linked.has(e) && L.entryCovers(e, p)));
        if (stale.length) throw new Error(`ar_start: immutable paths have uncommitted changes (${stale.slice(0, 10).join(', ')}${stale.length > 10 ? ', ...' : ''}); the branch worktree is created from HEAD and would evaluate the committed version. Ask the user to commit them first.`);
      }
      run.hashes = {
        immutable: pinRun(root, run), eval_command: sha256(cfg.eval.command),
        ...(cfg.proxy ? { proxy_command: sha256(cfg.proxy.command) } : {}),
        ...(cfg.holdout ? { holdout_command: sha256(cfg.holdout.command) } : {}),
      };
      run.preLoopDirty = branch ? await dirtyPaths(wroot, await repoInfo(wroot)) : dirty;

      // Baseline: `repeats` runs give the mean and the noise floor.
      const logRel = `${logDirOf(run)}/iter_0.log`;
      const values = [];
      for (let i = 0; i < cfg.eval.repeats; i++) {
        const r = await evaluate(root, run, { label: `AR ${key} baseline run ${i + 1}/${cfg.eval.repeats}`, logFile: logRel, append: i > 0, iter: 0 });
        if (r.failure) throw new Error(`ar_start: baseline eval run ${i + 1} failed (${r.failure}${r.failure === 'crash' ? `, exit ${r.code}` : ''}); see ${logRel}. Fix the eval command or harness before starting.`);
        values.push(r.metric);
      }
      const m = mean(values); const sd = stddev(values);
      run.baseline = m;
      run.noise = { values, mean: m, stddev: sd };
      run.epsilon_abs = Math.max((cfg.epsilon_pct / 100) * Math.abs(m), 2 * sd);
      run.comparisonReference = m;
      run.bestSoFar = m;
      run.lastKeptCommit = repo.headSha;
      run.lastGreenCommit = repo.headSha;
      if (cfg.proxy) {
        // Proxy noise floor, measured the same way; the proxy keeps its own reference and epsilon.
        const pv = [];
        for (let i = 0; i < cfg.proxy.repeats; i++) {
          const r = await evaluate(root, run, { label: `AR ${key} proxy baseline run ${i + 1}/${cfg.proxy.repeats}`, logFile: logRel, append: true, iter: 0, spec: cfg.proxy, kind: 'proxy' });
          if (r.failure) throw new Error(`ar_start: proxy baseline eval run ${i + 1} failed (${r.failure}${r.failure === 'crash' ? `, exit ${r.code}` : ''}); see ${logRel}.`);
          pv.push(r.metric);
        }
        const pm = mean(pv); const psd = stddev(pv);
        Object.assign(run.proxy, { baseline: pm, noise: { values: pv, mean: pm, stddev: psd }, epsilon_abs: Math.max((cfg.epsilon_pct / 100) * Math.abs(pm), 2 * psd) });
        run.proxyReference = pm;
        run.lastFullCommit = repo.headSha; run.lastFullIter = 0; run.anchorProxy = pm;
      }
      if (cfg.holdout && cfg.holdout.baseline) {
        // The holdout runs once on the pre-loop state; its value is sealed (written under .shards/state, never
        // returned, logged or journaled) until ar_end.
        const sealedLog = sealedFile(root, run).replace(/\.json$/, '.baseline.log');
        const r = await evaluate(root, run, { label: `AR ${key} holdout baseline (sealed)`, logFile: sealedLog, iter: 0, spec: cfg.holdout, kind: 'holdout' });
        if (r.failure) throw new Error(`ar_start: holdout baseline eval failed (${r.failure}${r.failure === 'crash' ? `, exit ${r.code}` : ''}); see ${path.relative(root, sealedLog)}. Fix the holdout command before starting.`);
        writeSealed(root, run, { run_id: runId, branch: branch || null, baseline: r.metric, at: iso(), command_sha256: run.hashes.holdout_command });
      }
      run.iterations = [];
      run.deferred = [];
      run.converged = false; run.stop_reason = null;
    } catch (e) {
      if (wtAbs && run.worktree) await removeWorktree(root, run).catch(() => {});
      throw e;
    }

    const workRel = run.worktree ? path.relative(root, workRoot(root, run)).split(path.sep).join('/') : undefined;
    const lease = await L.openArLease(session, { runId, project: cfg.project, mutable: cfg.mutable, immutable: run.immutable, meta: { ref }, ...(branch ? { branch, workRoot: workRel } : {}) });
    run.lease_id = lease.id;
    try {
      const headTree = (await G.gitOk(root, ['rev-parse', `${repo.headSha}^{tree}`])).trim();
      const msg = message(
        `research(${slug}): baseline ${key}`,
        `Baseline ${cfg.eval.name} = ${fmt(run.baseline)} (n=${run.noise.values.length}, sd=${fmt(run.noise.stddev)}); epsilon = ${fmt(run.epsilon_abs)}.${run.proxy ? ` Proxy baseline ${fmt(run.proxy.baseline)}, epsilon ${fmt(run.proxy.epsilon_abs)}, full eval every ${cfg.eval.full_every}.` : ''}${run.holdout ? ' Holdout sealed until ar_end.' : ''}${cfg.eval.fixed_budget_s ? ` Fixed compute budget ${cfg.eval.fixed_budget_s}s.` : ''}${branch ? ` Branch ${branch}, worktree ${run.worktree.path}.` : ''}`,
        trailers(run, { iter: 0, decision: 'baseline', before: null, after: run.baseline, source: 'baseline', best: run.baseline, ...(run.proxy ? { proxyBest: run.proxy.baseline } : {}), config: configOf(run) }),
      );
      const sha = await commitTree(root, headTree, repo.headSha, msg);
      await advanceRef(root, ref, sha, null);
      run.baseline_commit = sha;
      run.tip = sha;
    } catch (e) {
      await L.closeArLease(session, runId, branch ? { branch } : {});
      if (run.worktree) await removeWorktree(root, run).catch(() => {});
      throw e;
    }
    await saveRun(state, run, { active: key });
    return run;
  });
}

// ---------- proxy / full evals (issue #91, bug 8) ----------

// Which eval an iteration runs: always full without a proxy; with one, full on request or when full_every
// iterations have passed since the last full eval (so a proxy-kept chain is at most full_every - 1 long).
function evalTypeFor(run, N, force) {
  if (!run.proxy) return 'full';
  if (force) return 'full';
  let lastFull = 0;
  for (const x of run.iterations) if (x.eval_type === 'full') lastFull = x.n;
  return N - lastFull >= run.eval.full_every ? 'full' : 'proxy';
}
// Proxy-kept iterations since the last full-verified kept state (what a disagreeing full eval unwinds).
function proxyChain(run) {
  return (run.iterations || []).filter((x) => x.n > (run.lastFullIter || 0) && x.eval_type === 'proxy' && x.kept && !x.unwound && !x.retroInvalidated);
}
const liveKept = (x) => x.kept && !x.unwound && !x.retroInvalidated;
function lastGreenOf(run) {
  const g = (run.iterations || []).filter((x) => liveKept(x) && x.decision === 'green');
  return g.length ? g[g.length - 1].commit : run.pre_loop_head;
}

async function iterate(ctx, args) {
  const { root, state } = ctx;
  const session = { root, sessionKey: ctx.sessionKey, state };
  const run0 = selectLive(state, args, 'ar_iterate');
  if (!run0) throw new Error(`ar_iterate: no active AR run${args.branch ? ` for branch ${args.branch}` : ''} in this session; call ar_start (or ar_status with resume=true after a context loss)`);
  const key = keyOf(run0);
  if (run0.status !== 'active') throw new Error(`ar_iterate: run ${key} has stopped (${run0.stop_reason}); call ar_end`);
  // A stop reason already due (the wall-clock budget ran out while the driver idled or deferred) is applied before
  // paying for another eval.
  const due = stopReason(run0);
  if (due) {
    await withRunLock(key, async () => saveRun(state, { ...JSON.parse(JSON.stringify(run0)), status: 'converged', converged: true, stop_reason: due }));
    throw new Error(`ar_iterate: run ${key} has stopped (${due}); call ar_end`);
  }
  const lease = L.getActiveArLease(session);
  if (!lease || lease.ar.run_id !== run0.run_id || (run0.branch && !(lease.ar.branches || {})[run0.branch])) throw new Error(`ar_iterate: the AR lease for run ${key} is not active; call ar_status with resume=true to reopen it`);

  return withRunLock(key, async () => {
    const run = JSON.parse(JSON.stringify(run0));
    const wroot = workRoot(root, run);
    if (run.worktree && !fs.existsSync(path.join(root, run.worktree.path, '.git'))) throw new Error(`ar_iterate: the worktree of run ${key} (${run.worktree.path}) is missing; call ar_status with resume=true to recreate it`);
    const repo = await repoInfo(wroot);
    const tip = await refTip(root, run.ref);
    if (!tip) throw new Error(`ar_iterate: research ref ${run.ref} is missing`);
    if (run.tip && tip !== run.tip) throw new Error(`ar_iterate: research ref ${run.ref} moved outside the runtime (${tip.slice(0, 12)} != ${run.tip.slice(0, 12)}); run ar_status`);
    const N = run.iterations.length + 1;
    const evalType = evalTypeFor(run, N, args.full === true);
    const full = evalType === 'full';
    const proxyMode = !!run.proxy;
    const spec = full ? run.eval : run.proxy;
    const before = full ? run.comparisonReference : run.proxyReference;
    const eps = full ? run.epsilon_abs : run.proxy.epsilon_abs;
    const logRel = `${logDirOf(run)}/iter_${N}.log`;

    // 1. Tamper check: immutable pins (holdout paths included) and the pinned commands, before and after the eval
    // (code under test could rewrite an immutable file while the eval runs).
    const tamperCheck = () => {
      const now = pinRun(root, run);
      const t = Object.keys(run.hashes.immutable).filter((k) => now[k] !== run.hashes.immutable[k]);
      if (sha256(run.eval.command) !== run.hashes.eval_command) t.push('<eval command>');
      if (run.proxy && sha256(run.proxy.command) !== run.hashes.proxy_command) t.push('<proxy command>');
      if (run.holdout && sha256(run.holdout.command) !== run.hashes.holdout_command) t.push('<holdout command>');
      return t;
    };
    let tampered = tamperCheck();

    let res = null; let failure = null; let after = null;
    if (tampered.length) {
      failure = 'tamper';
      fs.mkdirSync(path.dirname(path.join(root, logRel)), { recursive: true });
      fs.writeFileSync(path.join(root, logRel), `# AR ${key} iteration ${N}: TAMPER\nimmutable paths changed since ar_start: ${tampered.join(', ')}\nThe eval was not run.\n`);
    } else {
      res = await evaluate(root, run, { label: `AR ${key} iteration ${N}`, logFile: logRel, iter: N, spec, kind: evalType });
      failure = res.failure; after = res.metric;
      tampered = tamperCheck();
      if (tampered.length) {
        failure = 'tamper'; after = null;
        fs.appendFileSync(path.join(root, logRel), `\n# TAMPER: immutable paths changed during the eval: ${tampered.join(', ')}\n`);
      }
    }
    const decision = classify(run, after, failure, before, eps);

    // 2. Snapshot the iteration's mutable state on top of lastKept. A full eval in proxy mode judges the whole unit
    // since the last full-verified kept state (the proxy-kept chain plus this change): LOC and any revert are
    // relative to lastFullCommit, so a full eval that disagrees with the proxy chain unwinds it (issue #91, bug 8).
    const baseCommit = full && proxyMode ? run.lastFullCommit : run.lastKeptCommit;
    const chain = full && proxyMode ? proxyChain(run) : [];
    const diff = await mutableDiff(wroot, repo, run.lastKeptCommit, run, { write: true });
    const baseTree = (await G.gitOk(wroot, ['rev-parse', `${baseCommit}^{tree}`])).trim();
    const iterTree = await writeTreeFrom(wroot, repo, run.lastKeptCommit, diff.entries);
    const loc = await locDelta(wroot, baseTree, iterTree);
    const kept = decision === 'green' || (decision === 'yellow' && loc.net < 0);
    const unwind = !kept && chain.length ? chain.map((x) => x.n) : null;

    let best = run.comparisonReference; // full-eval scale
    let proxyBest = proxyMode ? run.proxyReference : undefined;
    const counters = deriveCounters([...run.iterations, { decision, kept, failure }]);
    const rebaselined = decision === 'yellow' && kept && counters.consecutiveYellowKept >= 3;
    // A GREEN, or three kept YELLOWs (re-baseline: judge later iterations against what the kept state scores now),
    // move the reference of the eval that ran.
    if (decision === 'green' || rebaselined) { if (full) best = after; else proxyBest = after; }

    // A kept full iteration in proxy mode re-anchors the proxy reference on the new full-verified state.
    let reanchor = null;
    if (full && proxyMode && kept) {
      reanchor = await evaluate(root, run, { label: `AR ${key} iteration ${N} proxy re-anchor`, logFile: logRel, append: true, iter: N, spec: run.proxy, kind: 'proxy' });
      if (!reanchor.failure) proxyBest = reanchor.metric;
    }
    if (unwind) proxyBest = run.anchorProxy;

    const hyp = oneLine(args.hypothesis, 300);
    const source = args.source || 'adaptive';
    const slug = slugOf(run.project);
    const iterMsg = message(
      `research(${slug}): iter ${N} ${decision}${kept ? '' : unwind ? ' (unwinds proxy chain)' : ' (reverted)'}: ${oneLine(args.hypothesis, 60)}`,
      `${run.eval.name} (${evalType}): ${fmt(before)} -> ${fmt(after)}${failure ? ` [${failure}]` : ''}; epsilon ${fmt(eps)}; log ${logRel}.`,
      trailers(run, { iter: N, decision, before, after, evalType, source, hypothesis: hyp, kept, best, failure, loc, rebaselined, ...(proxyMode ? { proxyBest: kept ? proxyBest : run.proxyReference } : {}) }),
    );
    // Commits are created first and the ref advances once, after the revert: a failure before that point leaves the
    // ref and the session state consistent (ar_iterate can be retried), not a moved ref with a stale run.tip.
    const iterCommit = await commitTree(root, iterTree, tip, iterMsg);
    let newTip = iterCommit;

    // 3. Revert / unwind (after the iteration's diff is on the ref) or move the pointers (after the commit exists).
    let reverted = null; let revertCommit = null;
    if (!kept) {
      reverted = await revertMutable(wroot, repo, baseCommit, run);
      const revMsg = unwind
        ? message(
          `research(${slug}): unwind iters ${unwind.join(',')} + ${N} to ${baseCommit.slice(0, 12)}`,
          `The full eval (${fmt(after)}${failure ? ` [${failure}]` : ''}) is not better than the last full-verified kept state (${fmt(before)}) by more than ${fmt(eps)}: the proxy-kept iterations ${unwind.join(', ')} are unwound. Restored ${reverted.restored.length} path(s), deleted ${reverted.deleted.length} file(s).`,
          trailers(run, { iter: N, decision, before, after, evalType, source, kept: false, best, failure, proxyBest, unwind, revert: baseCommit }),
        )
        : message(
          `research(${slug}): revert iter ${N} to ${baseCommit.slice(0, 12)}`,
          `Restored ${reverted.restored.length} path(s), deleted ${reverted.deleted.length} file(s) created by the iteration.`,
          trailers(run, { iter: N, decision, before, after, evalType, source, kept: false, best, failure, ...(proxyMode ? { proxyBest } : {}), revert: baseCommit }),
        );
      revertCommit = await commitTree(root, baseTree, iterCommit, revMsg);
      newTip = revertCommit;
      if (unwind) {
        for (const x of run.iterations) if (unwind.includes(x.n)) x.unwound = true;
        run.lastKeptCommit = baseCommit;
        run.lastGreenCommit = lastGreenOf(run);
      }
    } else {
      run.lastKeptCommit = iterCommit;
      if (decision === 'green') run.lastGreenCommit = iterCommit;
      if (full && proxyMode) { run.lastFullCommit = iterCommit; run.lastFullIter = N; run.anchorProxy = proxyBest; }
    }
    run.comparisonReference = best;
    run.bestSoFar = best;
    if (proxyMode) run.proxyReference = proxyBest;

    const entry = {
      n: N, decision, kept, reverted: !kept, before, after, failure, hypothesis: hyp, source,
      eval_type: evalType, loc, rebaselined: rebaselined || undefined, bestSoFar: best,
      ...(proxyMode ? { proxyBest } : {}),
      commit: iterCommit, revert_commit: revertCommit, log: logRel, at: iso(),
      exit_code: res ? res.code : null, duration_ms: res ? res.duration_ms : null,
      tampered: tampered.length ? tampered : undefined,
      restored: reverted ? reverted.restored : undefined, deleted: reverted ? reverted.deleted : undefined,
      unwound_iterations: unwind || undefined,
      proxy_reanchor: reanchor ? { metric: reanchor.metric, failure: reanchor.failure || null } : undefined,
    };
    run.iterations.push(entry);
    Object.assign(run, deriveCounters(run.iterations));

    // Defensive scope check (protocol C.3 step 4): report, do not clean.
    const dirty = await dirtyPaths(wroot, repo);
    const pre = new Set(run.preLoopDirty);
    const isMut = mutableMatcher(run.mutable);
    const outOfScope = dirty.filter((p) => !pre.has(p) && !isMut(p) && !(p === run.project || p.startsWith(`${run.project}/`)) && !p.startsWith('.shards/'));

    const reason = stopReason(run);
    if (reason) { run.converged = true; run.stop_reason = reason; run.status = 'converged'; }
    await advanceRef(root, run.ref, newTip, tip);
    run.tip = newTip;
    await saveRun(state, run);
    return { run, entry, outOfScope };
  });
}

function summary(run, { source = 'state', leaseActive = null } = {}) {
  const its = run.iterations || [];
  const counts = { green: 0, yellow: 0, red: 0, kept: 0, reverted: 0, ...(run.proxy ? { unwound: 0 } : {}) };
  for (const x of its) { counts[x.decision] = (counts[x.decision] || 0) + 1; if (x.kept) counts.kept++; else counts.reverted++; if (x.unwound) counts.unwound++; }
  const elapsedMin = run.started_at ? (Date.now() - Date.parse(run.started_at)) / 60000 : null;
  return {
    run_id: run.run_id, ...(run.branch ? { branch: run.branch, worktree: run.worktree ? run.worktree.path : null } : {}),
    project: run.project, ref: run.ref, status: run.status, source,
    iterations: its.length, decisions: counts,
    baseline: run.baseline, noise: run.noise, epsilon_abs: run.epsilon_abs,
    comparisonReference: run.comparisonReference, bestSoFar: run.bestSoFar,
    lastKeptCommit: run.lastKeptCommit, lastGreenCommit: run.lastGreenCommit, pre_loop_head: run.pre_loop_head,
    ...(run.eval && run.eval.fixed_budget_s ? { compute_budget_s: run.eval.fixed_budget_s, timeout_s: run.eval.timeout_s } : {}),
    ...(run.proxy ? {
      proxy: {
        baseline: run.proxy.baseline, noise: run.proxy.noise, epsilon_abs: run.proxy.epsilon_abs, reference: run.proxyReference,
        full_every: run.eval.full_every, lastFullCommit: run.lastFullCommit,
        unverified_kept: proxyChain(run).map((x) => x.n), // proxy-kept iterations no full eval has confirmed yet
      },
    } : {}),
    // The holdout is sealed: only its configuration shows until ar_end has evaluated it.
    ...(run.holdout ? { holdout: run.holdout_result || { sealed: true, paths: run.holdout.paths, evaluated_at: 'ar_end' } } : {}),
    budget: run.budget,
    budget_remaining: {
      iterations: Math.max(0, run.budget.iterations - its.length),
      minutes: run.budget.minutes ? Math.max(0, Math.round((run.budget.minutes - elapsedMin) * 10) / 10) : null,
    },
    converged: !!run.converged, stop_reason: run.stop_reason || null, ended_at: run.ended_at || null,
    lease_active: leaseActive,
    deferred: pendingDeferred(run),
    recent: its.slice(-10).map((x) => ({ n: x.n, decision: x.decision, kept: x.kept, ...(run.proxy ? { eval_type: x.eval_type, unwound: !!x.unwound } : {}), before: x.before, after: x.after, failure: x.failure || null, hypothesis: x.hypothesis, commit: x.commit })),
  };
}

// ---------- rebuild from the ref ----------

async function listRefs(root) {
  const r = await G.git(root, ['for-each-ref', '--sort=-committerdate', '--format=%(refname)', `${REF_ROOT}/`]);
  return r.code === 0 ? r.stdout.split('\n').filter(Boolean) : [];
}

function parseTrailers(text) {
  const t = {};
  for (const line of String(text).split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim();
    if (/^AR-/.test(k)) t[k] = v;
  }
  return t;
}
const num = (s) => (s === undefined || s === 'NA' ? null : Number(s));
function metricPair(s) {
  const m = /=(.*)->(.*)$/.exec(s || '');
  return m ? [num(m[1]), num(m[2])] : [null, null];
}

// Rebuild a run from its research ref (newest commit first in git log; replayed oldest first).
async function rebuildFromRef(root, ref) {
  const tipSha = await refTip(root, ref);
  if (!tipSha) throw new Error(`research ref ${ref} not found`);
  const head = await G.gitOk(root, ['log', '-1', '--format=%(trailers:only,unfold)', tipSha]);
  const base = parseTrailers(head)['AR-Base'];
  const range = base ? [`${base}..${tipSha}`] : [tipSha];
  const out = await G.gitOk(root, ['log', '--first-parent', '--reverse', '--format=%H%n%(trailers:only,unfold)%x1e', ...range]);
  let run = null;
  for (const rec of out.split('\x1e')) {
    const s = rec.replace(/^\n+/, '');
    if (!s.trim()) continue;
    const nl = s.indexOf('\n');
    const sha = (nl < 0 ? s : s.slice(0, nl)).trim();
    const t = parseTrailers(nl < 0 ? '' : s.slice(nl + 1));
    if (!t['AR-Run']) continue;
    if (t['AR-Decision'] === 'baseline') {
      const cfg = JSON.parse(t['AR-Config']);
      run = { ...cfg, ref, status: 'active', baseline_commit: sha, comparisonReference: cfg.baseline, bestSoFar: cfg.baseline, lastKeptCommit: cfg.pre_loop_head, lastGreenCommit: cfg.pre_loop_head, iterations: [], deferred: [], converged: false, stop_reason: null };
      if (run.proxy) Object.assign(run, { proxyReference: run.proxy.baseline, lastFullCommit: cfg.pre_loop_head, lastFullIter: 0, anchorProxy: run.proxy.baseline });
      run.tip = sha;
      continue;
    }
    if (!run) continue;
    run.tip = sha;
    const n = Number(t['AR-Iter']);
    if (t['AR-Decision'] === 'stop') {
      run.status = 'ended'; run.stop_reason = t['AR-Stop'] || null; run.converged = true;
      if (t['AR-Holdout']) run.holdout_result = { metric: run.eval.name, ...parseHoldoutTrailer(t['AR-Holdout']) };
      continue;
    }
    if (t['AR-Decision'] === 'needs-human') {
      const kind = t['AR-Needs-Human'] || 'other';
      const item = { id: `d${(run.deferred || []).length + 1}`, kind, detail: t['AR-Detail'] || '', at_iteration: n, commit: sha, status: 'pending' };
      if (kind === 'retro_revert' && t['AR-Revert']) {
        const M = Number(t['AR-Retro-To']);
        const target = keptBefore(run, M);
        for (const x of run.iterations) if (x.n >= M && x.kept) x.retroInvalidated = true;
        run.lastKeptCommit = t['AR-Revert']; run.lastGreenCommit = target.green;
        run.comparisonReference = target.best; run.bestSoFar = target.best;
        if (run.proxy) Object.assign(run, { lastFullCommit: target.full.commit, lastFullIter: target.full.n, anchorProxy: target.full.proxyBest, proxyReference: target.proxyBest });
        Object.assign(item, { retro_to_iteration: M, revert_to: t['AR-Revert'] });
      }
      run.deferred = [...(run.deferred || []), item];
      continue;
    }
    const [before, after] = metricPair(t['AR-Metric']);
    if (t['AR-Unwind']) {
      const ns = t['AR-Unwind'].split(',').map(Number);
      for (const x of run.iterations) if (ns.includes(x.n)) x.unwound = true;
      const e = run.iterations.find((x) => x.n === n);
      if (e) { e.revert_commit = sha; e.unwound_iterations = ns; }
      run.lastKeptCommit = t['AR-Revert'];
      run.lastGreenCommit = lastGreenOf(run);
      if (t['AR-Proxy-Best'] !== undefined) run.proxyReference = num(t['AR-Proxy-Best']);
      continue;
    }
    if (t['AR-Revert']) {
      const e = run.iterations.find((x) => x.n === n);
      if (e) e.revert_commit = sha;
      continue;
    }
    const kept = t['AR-Kept'] === 'true';
    const loc = /^\+(\d+) -(\d+) \(net (-?\d+)\)$/.exec(t['AR-LOC'] || '');
    const e = {
      n, decision: t['AR-Decision'], kept, reverted: !kept, before, after, failure: t['AR-Failure'] || null,
      hypothesis: t['AR-Hypothesis'] || '', source: t['AR-Hypothesis-Source'] || null, eval_type: t['AR-Eval'] || 'full',
      loc: loc ? { added: Number(loc[1]), deleted: Number(loc[2]), net: Number(loc[3]) } : null,
      rebaselined: t['AR-Rebaseline'] === 'true' || undefined, bestSoFar: num(t['AR-Best']), commit: sha, revert_commit: null,
      log: `${logDirOf(run)}/iter_${n}.log`,
    };
    if (t['AR-Proxy-Best'] !== undefined) e.proxyBest = num(t['AR-Proxy-Best']);
    run.iterations.push(e);
    if (kept) { run.lastKeptCommit = sha; if (e.decision === 'green') run.lastGreenCommit = sha; }
    if (e.bestSoFar !== null) { run.comparisonReference = e.bestSoFar; run.bestSoFar = e.bestSoFar; }
    if (run.proxy && e.proxyBest !== undefined) {
      run.proxyReference = e.proxyBest;
      if (kept && e.eval_type === 'full') Object.assign(run, { lastFullCommit: sha, lastFullIter: n, anchorProxy: e.proxyBest });
    }
  }
  if (!run) throw new Error(`research ref ${ref} has no baseline commit`);
  Object.assign(run, deriveCounters(run.iterations));
  if (run.status === 'active') {
    const r = stopReason(run);
    if (r) { run.status = 'converged'; run.converged = true; run.stop_reason = r; }
  }
  return run;
}

// Research refs of a run id: [slug, run] (solo) or [slug, run, branch] under refs/shards/research/.
function refParts(ref) { return ref.slice(REF_ROOT.length + 1).split('/'); }
async function findRefs(root, runId, branch) {
  return (await listRefs(root)).filter((r) => {
    const p = refParts(r);
    if (runId && p[1] !== runId) return false;
    if (branch) return p[2] === branch;
    return true;
  });
}
async function findRef(root, runId, branch) {
  const refs = await findRefs(root, runId, branch);
  return refs[0] || null;
}

// Resolve ONE run: session state first (by id/branch, else the active run, else the newest), then the research
// ref. Several branch runs matching and no branch given is ambiguous.
// The runtime advances the ref before it saves the session state: a crash in between leaves run.tip stale. When
// the ref only moved forward from run.tip, rebuild from it (keeping the state-only lease and worktree fields).
// A ref that moved elsewhere is left for ar_iterate / ar_defer to refuse.
async function reconcileWithRef(root, run) {
  if (!run || !run.tip || !run.ref) return { run, reconciled: false };
  const tip = await refTip(root, run.ref);
  if (!tip || tip === run.tip) return { run, reconciled: false };
  const anc = await G.git(root, ['merge-base', '--is-ancestor', run.tip, tip]);
  if (anc.code !== 0) return { run, reconciled: false };
  const rebuilt = await rebuildFromRef(root, run.ref);
  const merged = { ...run, ...rebuilt, lease_id: run.lease_id };
  if (run.worktree) merged.worktree = { ...(rebuilt.worktree || {}), ...run.worktree };
  if (run.status === 'ended') Object.assign(merged, { status: 'ended', stop_reason: run.stop_reason, converged: true });
  return { run: merged, reconciled: true };
}

async function resolveRun(ctx, runId, branch) {
  const r = await resolveRunRaw(ctx, runId, branch);
  if (r.source !== 'state') return r;
  const { run, reconciled } = await reconcileWithRef(ctx.root, r.run);
  if (reconciled) await saveRun(ctx.state, run);
  return { run, source: 'state' };
}

async function resolveRunRaw(ctx, runId, branch) {
  const s = readStore(ctx.state);
  if (runId && s.runs[runKey(runId, branch)]) return { run: s.runs[runKey(runId, branch)], source: 'state' };
  if (runId && !branch) {
    const c = Object.values(s.runs).filter((r) => r.run_id === runId);
    if (c.length > 1) throw new Error(`AR run ${runId} has ${c.length} branch runs (${c.map((r) => r.branch).join(', ')}); pass branch`);
    if (c.length === 1) return { run: c[0], source: 'state' };
  }
  if (!runId && branch) {
    const c = Object.values(s.runs).filter((r) => r.branch === branch).sort((x, y) => String(y.started_at).localeCompare(String(x.started_at)));
    if (c.length) return { run: c[0], source: 'state' };
  }
  if (!runId && !branch) {
    const r = activeRun(ctx.state) || latestRun(ctx.state);
    if (r) return { run: r, source: 'state' };
  }
  const refs = await findRefs(ctx.root, runId, branch);
  if (!refs.length) return { run: null, source: null };
  if (runId && !branch && refs.length > 1 && refs.every((r) => refParts(r)[1] === runId)) throw new Error(`AR run ${runId} has ${refs.length} branch refs; pass branch`);
  return { run: await rebuildFromRef(ctx.root, refs[0]), source: 'ref' };
}

// Every branch run of a run id (state first, then refs not in state), for arbitration.
async function branchRuns(ctx, runId) {
  const s = readStore(ctx.state);
  const out = Object.values(s.runs).filter((r) => r.run_id === runId && r.branch).map((run) => ({ run, source: 'state' }));
  const have = new Set(out.map((x) => x.run.ref));
  for (const ref of await findRefs(ctx.root, runId)) {
    if (have.has(ref) || refParts(ref).length < 3) continue;
    out.push({ run: await rebuildFromRef(ctx.root, ref), source: 'ref' });
  }
  return out.sort((a, b) => String(a.run.branch).localeCompare(String(b.run.branch)));
}

const leaseCovers = (lease, run) => !!(lease && lease.ar.run_id === run.run_id && (!run.branch || (lease.ar.branches || {})[run.branch]));

// Side-by-side view of a fan-out run's branches (arbitration reads this, plus the refs' trailers).
function compareBranches(list) {
  const rows = list.map(({ run, source }) => summary(run, { source }));
  const dir = list.length && list[0].run.eval ? list[0].run.eval.direction : 'maximize';
  const sgn = dir === 'minimize' ? -1 : 1;
  const score = (r) => (r.bestSoFar === null || r.bestSoFar === undefined ? -Infinity : sgn * r.bestSoFar);
  const ranked = rows.slice().sort((a, b) => score(b) - score(a));
  return {
    direction: dir,
    leaderboard: ranked.map((r, i) => ({
      rank: i + 1, branch: r.branch, bestSoFar: r.bestSoFar, baseline: r.baseline,
      gain: r.bestSoFar !== null && r.baseline !== null && r.bestSoFar !== undefined ? sgn * (r.bestSoFar - r.baseline) : null,
      epsilon_abs: r.epsilon_abs, iterations: r.iterations, decisions: r.decisions, status: r.status, stop_reason: r.stop_reason,
      ref: r.ref, lastKeptCommit: r.lastKeptCommit, deferred: r.deferred.length,
    })),
    branches: rows,
  };
}

async function status(ctx, args = {}) {
  const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
  if (!args.branch) {
    // A branched run id (or, with no run_id, the active run being a branch run): show all its branches.
    let rid = args.run_id;
    if (!rid) { const r = activeRun(ctx.state) || latestRun(ctx.state); if (r && r.branch) rid = r.run_id; }
    if (rid) {
      const list = await branchRuns(ctx, rid);
      if (list.length > 1 || (list.length === 1 && !args.run_id)) {
        if (args.resume) throw new Error(`ar_status: run ${rid} has ${list.length} branch runs; pass branch to resume one`);
        const lease = L.getActiveArLease(session);
        const cmp = compareBranches(list);
        for (const b of cmp.branches) b.lease_active = leaseCovers(lease, { run_id: rid, branch: b.branch });
        return { run_id: rid, project: list[0].run.project, branched: true, ...cmp };
      }
    }
  }
  const { run, source } = await resolveRun(ctx, args.run_id, args.branch);
  if (!run) return null;
  let lease = L.getActiveArLease(session);
  let leaseActive = leaseCovers(lease, run);
  let resumed = false; let worktreeRecreated = false;
  if (args.resume && run.status !== 'ended') {
    const key = keyOf(run);
    const clash = liveRuns(ctx.state).find((r) => keyOf(r) !== key && !(run.branch && r.branch && r.run_id === run.run_id));
    if (clash) throw new Error(`ar_status: run ${keyOf(clash)} is active in this session; end it before resuming ${key}`);
    if (lease && lease.ar.run_id !== run.run_id) throw new Error(`ar_status: AR lease ${lease.id} (run ${lease.ar.run_id}) is active; end that run first`);
    if (run.worktree) worktreeRecreated = await ensureWorktree(ctx.root, run);
    if (!leaseActive) {
      const workRel = run.worktree ? path.relative(ctx.root, workRoot(ctx.root, run)).split(path.sep).join('/') : undefined;
      lease = await L.openArLease(session, { runId: run.run_id, project: run.project, mutable: run.mutable, immutable: run.immutable, meta: { ref: run.ref, resumed: true }, ...(run.branch ? { branch: run.branch, workRoot: workRel } : {}) });
      run.lease_id = lease.id; leaseActive = true;
    }
    await saveRun(ctx.state, run, { active: key });
    resumed = true;
  }
  return { ...summary(run, { source, leaseActive }), resumed, ...(worktreeRecreated ? { worktree_recreated: true } : {}) };
}

async function end(ctx, args) {
  const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
  let picked = null;
  if (!args.run_id && !args.branch) {
    const live = liveRuns(ctx.state).filter((r) => r.branch);
    if (live.length > 1) throw new Error(`ar_end: ${live.length} AR branch runs are active (${live.map(keyOf).join(', ')}); pass branch`);
    if (live.length === 1) picked = { run: live[0], source: 'state' };
  }
  const { run: run0, source } = picked || await resolveRun(ctx, args.run_id, args.branch);
  if (!run0) throw new Error(`ar_end: no AR run${args.run_id ? ` ${args.run_id}` : ''}${args.branch ? ` branch ${args.branch}` : ''} found`);
  const key = keyOf(run0);
  if (run0.status === 'ended') throw new Error(`ar_end: run ${key} already ended (${run0.stop_reason})`);
  return withRunLock(key, async () => {
    const run = JSON.parse(JSON.stringify(run0));
    const tip = await refTip(ctx.root, run.ref);
    if (!tip) throw new Error(`ar_end: research ref ${run.ref} is missing`);
    const reason = oneLine(args.reason, 200) || run.stop_reason || 'user-interrupt';
    const N = (run.iterations || []).length;
    // The sealed holdout: evaluated exactly once, here, on the kept state (issue #91, H5).
    let holdout = null;
    if (run.holdout) {
      if (args.skip_holdout) holdout = { metric: run.eval.name, skipped: true };
      else {
        if (run.worktree && !fs.existsSync(path.join(ctx.root, run.worktree.path, '.git'))) await ensureWorktree(ctx.root, run);
        // Score the kept state the ref records: edits to mutable paths after the last ar_iterate are not journaled.
        const wroot = workRoot(ctx.root, run);
        const repo = await repoInfo(wroot);
        const stray = await mutableDiff(wroot, repo, run.lastKeptCommit, run, { write: false });
        if (stray.entries.length) run.end_restored = await revertMutable(wroot, repo, run.lastKeptCommit, run);
        holdout = await runHoldout(ctx.root, run);
      }
      run.holdout_result = holdout;
    }
    const tree = (await G.gitOk(ctx.root, ['rev-parse', `${tip}^{tree}`])).trim();
    const msg = message(
      `research(${slugOf(run.project)}): end ${key} (${reason})`,
      `${N} iteration(s); best ${run.eval.name} ${fmt(run.bestSoFar)} (baseline ${fmt(run.baseline)}). Kept state: ${run.lastKeptCommit}.${holdout ? ` Holdout: ${holdoutTrailer(run, holdout)}.` : ''}${pendingDeferred(run).length ? ` ${pendingDeferred(run).length} deferred decision(s) need a human at the Phase 3 gate.` : ''}`,
      trailers(run, { iter: N, decision: 'stop', before: run.baseline, after: run.bestSoFar, source: 'runtime', best: run.bestSoFar, stop: reason, ...(holdout ? { holdout } : {}) }),
    );
    const sha = await commitTree(ctx.root, tree, tip, msg);
    await advanceRef(ctx.root, run.ref, sha, tip);
    run.tip = sha;
    run.stop_reason = reason; run.converged = true; run.status = 'ended'; run.ended_at = iso();
    const closed = await L.closeArLease(session, run.run_id, run.branch ? { branch: run.branch } : {});
    let worktreeRemoved = false;
    if (run.worktree) {
      if (args.keep_worktree) run.worktree.kept = true;
      else {
        try { worktreeRemoved = await removeWorktree(ctx.root, run); run.worktree.removed = true; } catch (e) { run.worktree.remove_failed = oneLine(e.message, 300); }
      }
    }
    const cur = readStore(ctx.state);
    await saveRun(ctx.state, run, { active: cur.active === key ? null : cur.active });
    return { run, closed: closed && closed.status === 'closed' ? closed : null, lease: closed, source, worktreeRemoved, holdout };
  });
}

// ---------- deferred decisions (issue #91, bug 14) ----------

const DEFER_KINDS = ['retro_revert', 'pause', 'floor_breach', 'other'];

// The kept state in force when iteration M started: the last kept iteration before M, else the pre-loop HEAD.
function keptBefore(run, M) {
  // Iterations an earlier retro_revert invalidated no longer count as kept.
  const kept = (run.iterations || []).filter((x) => x.n < M && liveKept(x));
  const green = kept.filter((x) => x.decision === 'green');
  const last = kept[kept.length - 1];
  const fulls = kept.filter((x) => x.eval_type === 'full');
  const lastFull = fulls[fulls.length - 1];
  const pb = (x) => (x && x.proxyBest !== undefined && x.proxyBest !== null ? x.proxyBest : run.proxy ? run.proxy.baseline : null);
  // The comparison reference only moves on a kept iteration (GREEN or re-baselined YELLOW).
  return {
    commit: last ? last.commit : run.pre_loop_head,
    green: green.length ? green[green.length - 1].commit : run.pre_loop_head,
    best: last && last.bestSoFar !== null && last.bestSoFar !== undefined ? last.bestSoFar : run.baseline,
    // proxy mode: the last full-verified kept state before M and the proxy reference in force then
    full: { commit: lastFull ? lastFull.commit : run.pre_loop_head, n: lastFull ? lastFull.n : 0, proxyBest: pb(lastFull) },
    proxyBest: pb(last),
  };
}

function pendingDeferred(run) { return (run.deferred || []).filter((d) => d.status === 'pending'); }

// Record a decision that needs a human without blocking the loop: a `needs-human` commit on the research ref
// and an entry in run.deferred. A retro_revert restores the mutable scope to the kept state before iteration M
// and moves lastKeptCommit / lastGreenCommit / comparisonReference there; the loop then continues (N+1).
async function defer(ctx, args) {
  const { root, state } = ctx;
  const run0 = selectLive(state, args, 'ar_defer') || (await resolveRun(ctx, args.run_id, args.branch)).run;
  if (!run0) throw new Error(`ar_defer: no AR run${args.run_id ? ` ${args.run_id}` : ''}${args.branch ? ` branch ${args.branch}` : ''} found`);
  const key = keyOf(run0);
  if (run0.status === 'ended') throw new Error(`ar_defer: run ${key} already ended (${run0.stop_reason})`);
  if (!readStore(state).runs[key]) throw new Error(`ar_defer: run ${key} is not in this session; call ar_status with resume=true first`);
  const kind = args.kind;
  if (!DEFER_KINDS.includes(kind)) throw new Error(`ar_defer: kind must be one of ${DEFER_KINDS.join(', ')}`);
  const detail = oneLine(args.detail, 2000);
  if (!detail) throw new Error('ar_defer: detail is required (what the human must decide, and why)');
  return withRunLock(key, async () => {
    const run = JSON.parse(JSON.stringify(run0));
    const wroot = workRoot(root, run);
    const repo = await repoInfo(wroot);
    const tip = await refTip(root, run.ref);
    if (!tip) throw new Error(`ar_defer: research ref ${run.ref} is missing`);
    if (run.tip && tip !== run.tip) throw new Error(`ar_defer: research ref ${run.ref} moved outside the runtime; run ar_status`);
    const N = (run.iterations || []).length;
    let tree = (await G.gitOk(root, ['rev-parse', `${tip}^{tree}`])).trim();
    let retro = null;
    if (kind === 'retro_revert') {
      const M = args.retro_to_iteration;
      if (!Number.isInteger(M) || M < 1 || M > N) throw new Error(`ar_defer: retro_revert needs retro_to_iteration between 1 and ${N} (the first invalid iteration)`);
      const target = keptBefore(run, M);
      const reverted = await revertMutable(wroot, repo, target.commit, run);
      tree = (await G.gitOk(root, ['rev-parse', `${target.commit}^{tree}`])).trim();
      for (const x of run.iterations) if (x.n >= M && x.kept) x.retroInvalidated = true;
      run.lastKeptCommit = target.commit;
      run.lastGreenCommit = target.green;
      run.comparisonReference = target.best;
      run.bestSoFar = target.best;
      if (run.proxy) Object.assign(run, { lastFullCommit: target.full.commit, lastFullIter: target.full.n, anchorProxy: target.full.proxyBest, proxyReference: target.proxyBest });
      retro = { to_iteration: M, revert_to: target.commit, best: target.best, restored: reverted.restored, deleted: reverted.deleted };
    }
    const msg = message(
      `research(${slugOf(run.project)}): needs-human ${kind}${retro ? ` (back to before iter ${retro.to_iteration})` : ''}`,
      `${detail}${retro ? `\nRestored ${retro.restored.length} path(s), deleted ${retro.deleted.length} file(s); kept state ${retro.revert_to}.` : ''}\nThe loop continues; a human confirms this at the Phase 3 gate.`,
      trailers(run, { iter: N, decision: 'needs-human', before: run.comparisonReference, after: null, source: 'runtime', best: run.bestSoFar, needsHuman: kind, detail, ...(retro ? { retroTo: retro.to_iteration, revert: retro.revert_to } : {}) }),
    );
    const sha = await commitTree(root, tree, tip, msg);
    await advanceRef(root, run.ref, sha, tip);
    run.tip = sha;
    const item = {
      id: `d${(run.deferred || []).length + 1}`, kind, detail, at_iteration: N, commit: sha, status: 'pending', at: iso(),
      ...(retro ? { retro_to_iteration: retro.to_iteration, revert_to: retro.revert_to } : {}),
    };
    run.deferred = [...(run.deferred || []), item];
    await saveRun(state, run);
    return { run, item, retro };
  });
}

// Brief line for shards_status / sessions_resume.
function brief(state) {
  try {
    const r = activeRun(state) || latestRun(state);
    if (!r) return null;
    const branches = r.branch ? liveRuns(state).filter((x) => x.run_id === r.run_id && x.branch).map((x) => x.branch) : undefined;
    return { run_id: r.run_id, ...(r.branch ? { branch: r.branch, branches } : {}), project: r.project, ref: r.ref, status: r.status, iterations: (r.iterations || []).length, budget: r.budget, bestSoFar: r.bestSoFar, baseline: r.baseline, stop_reason: r.stop_reason || null, deferred: pendingDeferred(r).length };
  } catch (_) { return null; }
}

module.exports = {
  start, iterate, status, end, defer, brief, rebuildFromRef, resolveRun, findRef, findRefs, refTip, summary, pendingDeferred, DEFER_KINDS,
  branchRuns, compareBranches, runKey, keyOf, workRoot, WORKTREES, MAX_BRANCHES,
  // exported for tests
  parseMetric, classify, stopReason, deriveCounters, runCommand, pinImmutable, slugOf, REF_ROOT, STATE, DEFAULTS, SEALED, evalTypeFor,
};
