'use strict';
// Autonomous-research (AR) state machine (issue #91, H1 + H2). Backs the ar_start / ar_iterate / ar_status /
// ar_end tools.
//
// The runtime, not the agent, runs the pinned eval command, parses the metric, classifies GREEN/YELLOW/RED,
// keeps or reverts the mutable scope and journals every iteration as a commit on a shards-owned ref:
//
//   refs/shards/research/<project-slug>/<run_id>
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
//   stop       (ar_end) tree = tip tree, AR-Decision: stop, AR-Stop: <reason>
// Every commit carries AR-Run, AR-Iter, AR-Decision, AR-Metric, AR-Eval, AR-Hypothesis-Source and AR-Base
// (the pre-loop HEAD), so state can be rebuilt from `git log --format=%(trailers)` alone (rebuildFromRef).
//
// Session state: store name `research` ({active: run_id|null, runs: {<run_id>: run}}) under
// .shards/state/sessions/<key>/research.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const G = require('../git');
const L = require('../leases');

const STATE = 'research';
const REF_ROOT = 'refs/shards/research';
const DEFAULTS = Object.freeze({ repeats: 3, timeout_s: 900, epsilon_pct: 1, plateau_window: 5, error_limit: 3, metric_name: 'metric' });
const OUT_CAP = 8 * 1024 * 1024; // keep at most the last 8 MB of each stream in memory
const LOG_TAIL = 64 * 1024; // bytes of each stream written to the iteration log
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const GLOB = /[*?[]/;
const FAILURES = ['crash', 'timeout', 'parse'];

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

function readStore(state) {
  const s = state.read(STATE);
  return { active: s.active || null, runs: s.runs || {} };
}
async function saveRun(state, run, { active } = {}) {
  await state.update(STATE, (cur) => {
    cur.runs = cur.runs || {};
    cur.runs[run.run_id] = run;
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
  return sha256(fs.readFileSync(abs));
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
function pinImmutable(root, immutable) {
  const out = {};
  for (const e of immutable) out[e] = hashEntry(root, e);
  return out;
}

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
      if (last) {
        const v = Number(last[1] !== undefined ? last[1] : last[0]);
        return Number.isFinite(v) ? v : null;
      }
    }
    return null;
  }
  const cands = [String(stdout || '').trim(), ...String(stdout || '').trim().split('\n').reverse()];
  for (const c of cands) {
    if (!c) continue;
    let obj;
    try { obj = JSON.parse(c); } catch (_) { continue; }
    const v = Number(jsonGet(obj, ev.json_path));
    return Number.isFinite(v) ? v : null;
  }
  return null;
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

async function evaluate(root, run, { label, logFile, append, iter }) {
  const res = await runCommand(run.eval.command, {
    cwd: root, timeoutMs: run.eval.timeout_s * 1000,
    env: { SHARDS_AR_RUN: run.run_id, SHARDS_AR_ITER: String(iter) },
  });
  res.metric = res.timedOut || res.code !== 0 ? null : parseMetric(run.eval, res.stdout, res.stderr);
  res.failure = res.timedOut ? 'timeout' : res.code !== 0 ? 'crash' : res.metric === null ? 'parse' : null;
  writeLog(path.join(root, logFile), `${label} | ${run.eval.command}`, res, append);
  return res;
}

// ---------- classification + convergence ----------

function classify(run, after, failure) {
  if (failure) return 'red';
  const d = (run.eval.direction === 'minimize' ? -1 : 1) * (after - run.comparisonReference);
  if (d > run.epsilon_abs) return 'green';
  if (d < -run.epsilon_abs) return 'red';
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
  if (!N) return null;
  const last = it[N - 1];
  if (last.failure === 'tamper') return 'tamper';
  const c = deriveCounters(it);
  if (c.consecutiveFailures >= DEFAULTS.error_limit) return c.consecutiveTimeouts >= DEFAULTS.error_limit ? 'timeout-limit' : 'error-limit';
  const W = run.convergence.plateau_window;
  if (N >= activationFloor(run)) {
    if (N >= W && it.slice(-W).every((x) => x.decision !== 'green')) return 'plateau';
    if (N >= 2 * W) {
      const prev = N - 2 * W === 0 ? run.baseline : it[N - 2 * W - 1].bestSoFar;
      const gain = (run.eval.direction === 'minimize' ? -1 : 1) * (last.bestSoFar - prev);
      if (gain < diminishingAbs(run)) return 'diminishing-returns';
    }
  }
  if (N >= run.budget.iterations) return 'budget-exhausted';
  if (run.budget.minutes && now - Date.parse(run.started_at) >= run.budget.minutes * 60000) return 'time-budget';
  return null;
}
function diminishingAbs(run) {
  const pct = run.convergence.diminishing_returns_pct;
  return pct === null || pct === undefined ? 2 * run.epsilon_abs : (pct / 100) * Math.abs(run.baseline);
}

// ---------- commit messages ----------

function trailers(run, t) {
  const lines = [
    ['AR-Run', run.run_id], ['AR-Iter', t.iter], ['AR-Decision', t.decision],
    ['AR-Metric', `${run.eval.name}=${fmt(t.before)}->${fmt(t.after)}`],
    ['AR-Eval', t.evalType || 'full'], ['AR-Hypothesis-Source', t.source || 'adaptive'],
  ];
  if (t.hypothesis) lines.push(['AR-Hypothesis', oneLine(t.hypothesis, 300)]);
  if (t.kept !== undefined) lines.push(['AR-Kept', t.kept ? 'true' : 'false']);
  if (t.best !== undefined) lines.push(['AR-Best', fmt(t.best)]);
  if (t.failure) lines.push(['AR-Failure', t.failure]);
  if (t.loc) lines.push(['AR-LOC', `+${t.loc.added} -${t.loc.deleted} (net ${t.loc.net})`]);
  if (t.rebaselined) lines.push(['AR-Rebaseline', 'true']);
  if (t.revert) lines.push(['AR-Revert', t.revert]);
  if (t.stop) lines.push(['AR-Stop', oneLine(t.stop, 200)]);
  lines.push(['AR-Base', run.pre_loop_head]);
  if (t.config) lines.push(['AR-Config', JSON.stringify(t.config)]);
  return lines.map(([k, v]) => `${k}: ${v}`).join('\n');
}
function message(subject, body, tr) {
  return `${subject}\n\n${body ? `${body}\n\n` : ''}${tr}\n`;
}

// The run fields a rebuild needs (AR-Config on the baseline commit).
function configOf(run) {
  const keys = ['run_id', 'project', 'ref', 'brief_path', 'mutable', 'immutable', 'eval', 'budget', 'epsilon_pct', 'epsilon_abs', 'noise', 'baseline', 'convergence', 'hashes', 'pre_loop_head', 'preLoopDirty', 'started_at', 'session'];
  const o = {};
  for (const k of keys) o[k] = run[k];
  return o;
}

// ---------- public operations ----------

function normalizeStartArgs(args) {
  const project = L.normalizeRel(String(args.project).replace(/\/+$/, ''));
  const norm = (xs) => [...new Set((xs || []).map((p) => L.normalizeRel(String(p).replace(/\/+$/, ''))))];
  const mutable = norm(args.mutable);
  const immutable = norm(args.immutable);
  if (!mutable.length) throw new Error('ar_start: mutable must list at least one path or glob');
  for (const m of mutable) {
    const probe = GLOB.test(m) ? L.globBase(m) : m;
    if (probe && immutable.some((e) => L.entryCovers(e, probe))) throw new Error(`ar_start: mutable entry ${m} lies inside an immutable path`);
  }
  const ev = args.eval || {};
  if (!!ev.metric_regex === !!ev.json_path) throw new Error('ar_start: eval needs exactly one of metric_regex or json_path');
  if (ev.metric_regex) {
    try { new RegExp(ev.metric_regex, 'gm'); } catch (e) { throw new Error(`ar_start: invalid metric_regex: ${e.message}`); }
  }
  const evalCfg = {
    command: ev.command, metric_regex: ev.metric_regex || null, json_path: ev.json_path || null,
    direction: ev.direction, timeout_s: ev.timeout_s || DEFAULTS.timeout_s, repeats: ev.repeats || DEFAULTS.repeats,
    name: ev.name || DEFAULTS.metric_name,
  };
  const budget = { iterations: args.budget.iterations, minutes: args.budget.minutes || null };
  const conv = args.convergence || {};
  return {
    project, mutable, immutable, eval: evalCfg, budget,
    epsilon_pct: args.epsilon === undefined ? DEFAULTS.epsilon_pct : args.epsilon,
    convergence: { plateau_window: conv.plateau_window || DEFAULTS.plateau_window, diminishing_returns_pct: conv.diminishing_returns_pct === undefined ? null : conv.diminishing_returns_pct },
  };
}

const locks = new Set();
async function withRunLock(key, fn) {
  if (locks.has(key)) throw new Error(`an AR operation for run ${key} is already in progress`);
  locks.add(key);
  try { return await fn(); } finally { locks.delete(key); }
}

async function start(ctx, args) {
  const { root, state } = ctx;
  const session = { root, sessionKey: ctx.sessionKey, state };
  const cur = activeRun(state);
  if (cur && cur.status === 'active') throw new Error(`ar_start: AR run ${cur.run_id} is already active in this session; call ar_end first`);
  const lease0 = L.getActiveArLease(session);
  if (lease0) throw new Error(`ar_start: AR lease ${lease0.id} (run ${lease0.ar.run_id}) is already active; call ar_end first`);
  const cfg = normalizeStartArgs(args);
  const runId = args.run_id || defaultRunId();
  if (!validRunId(runId)) throw new Error(`ar_start: invalid run_id ${JSON.stringify(runId)} (letters, digits, . _ -; max 64)`);
  if (readStore(state).runs[runId]) throw new Error(`ar_start: run ${runId} already exists in this session`);
  const brief = L.normalizeRel(args.brief_path);
  if (!fs.existsSync(path.join(root, brief))) throw new Error(`ar_start: brief_path ${brief} does not exist (write the research brief first)`);

  return withRunLock(runId, async () => {
    const repo = await repoInfo(root);
    const ref = `${REF_ROOT}/${slugOf(cfg.project)}/${runId}`;
    if (await refTip(root, ref)) throw new Error(`ar_start: ${ref} already exists; pick another run_id`);
    const chk = await G.git(root, ['check-ref-format', ref]);
    if (chk.code !== 0) throw new Error(`ar_start: ${ref} is not a valid ref name`);

    const dirty = await dirtyPaths(root, repo);
    const isMut = mutableMatcher(cfg.mutable);
    const dirtyMut = dirty.filter(isMut);
    if (dirtyMut.length) throw new Error(`ar_start: the mutable scope has uncommitted changes (${dirtyMut.slice(0, 10).join(', ')}${dirtyMut.length > 10 ? ', ...' : ''}); ask the user to commit or stash them first, a revert would overwrite them`);

    const run = {
      run_id: runId, project: cfg.project, ref, brief_path: brief, session: ctx.sessionKey,
      mutable: cfg.mutable, immutable: cfg.immutable, eval: cfg.eval, budget: cfg.budget,
      epsilon_pct: cfg.epsilon_pct, convergence: cfg.convergence,
      hashes: { immutable: pinImmutable(root, cfg.immutable), eval_command: sha256(cfg.eval.command) },
      pre_loop_head: repo.headSha, preLoopDirty: dirty, started_at: iso(), status: 'active',
    };

    // Baseline: `repeats` runs give the mean and the noise floor.
    const logRel = `${cfg.project}/experiments/iter_0.log`;
    const values = [];
    for (let i = 0; i < cfg.eval.repeats; i++) {
      const r = await evaluate(root, run, { label: `AR ${runId} baseline run ${i + 1}/${cfg.eval.repeats}`, logFile: logRel, append: i > 0, iter: 0 });
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
    run.iterations = [];
    run.converged = false; run.stop_reason = null;

    const lease = await L.openArLease(session, { runId, project: cfg.project, mutable: cfg.mutable, immutable: cfg.immutable, meta: { ref } });
    run.lease_id = lease.id;
    try {
      const headTree = (await G.gitOk(root, ['rev-parse', `${repo.headSha}^{tree}`])).trim();
      const msg = message(
        `research(${slugOf(cfg.project)}): baseline ${runId}`,
        `Baseline ${cfg.eval.name} = ${fmt(m)} (n=${values.length}, sd=${fmt(sd)}); epsilon = ${fmt(run.epsilon_abs)}.`,
        trailers(run, { iter: 0, decision: 'baseline', before: null, after: m, source: 'baseline', best: m, config: configOf(run) }),
      );
      const sha = await commitTree(root, headTree, repo.headSha, msg);
      await advanceRef(root, ref, sha, null);
      run.baseline_commit = sha;
      run.tip = sha;
    } catch (e) {
      await L.closeArLease(session, runId);
      throw e;
    }
    await saveRun(state, run, { active: runId });
    return run;
  });
}

async function iterate(ctx, args) {
  const { root, state } = ctx;
  const session = { root, sessionKey: ctx.sessionKey, state };
  const run0 = activeRun(state);
  if (!run0) throw new Error('ar_iterate: no active AR run in this session; call ar_start (or ar_status with resume=true after a context loss)');
  if (run0.status !== 'active') throw new Error(`ar_iterate: run ${run0.run_id} has stopped (${run0.stop_reason}); call ar_end`);
  const lease = L.getActiveArLease(session);
  if (!lease || lease.ar.run_id !== run0.run_id) throw new Error(`ar_iterate: the AR lease for run ${run0.run_id} is not active; call ar_status with resume=true to reopen it`);

  return withRunLock(run0.run_id, async () => {
    const run = JSON.parse(JSON.stringify(run0));
    const repo = await repoInfo(root);
    const tip = await refTip(root, run.ref);
    if (!tip) throw new Error(`ar_iterate: research ref ${run.ref} is missing`);
    if (run.tip && tip !== run.tip) throw new Error(`ar_iterate: research ref ${run.ref} moved outside the runtime (${tip.slice(0, 12)} != ${run.tip.slice(0, 12)}); run ar_status`);
    const N = run.iterations.length + 1;
    const before = run.comparisonReference;
    const logRel = `${run.project}/experiments/iter_${N}.log`;

    // 1. Tamper check: immutable pins and the eval command.
    const now = pinImmutable(root, run.immutable);
    const tampered = Object.keys(run.hashes.immutable).filter((k) => now[k] !== run.hashes.immutable[k]);
    if (sha256(run.eval.command) !== run.hashes.eval_command) tampered.push('<eval command>');

    let res = null; let failure = null; let after = null;
    if (tampered.length) {
      failure = 'tamper';
      fs.mkdirSync(path.dirname(path.join(root, logRel)), { recursive: true });
      fs.writeFileSync(path.join(root, logRel), `# AR ${run.run_id} iteration ${N}: TAMPER\nimmutable paths changed since ar_start: ${tampered.join(', ')}\nThe eval was not run.\n`);
    } else {
      res = await evaluate(root, run, { label: `AR ${run.run_id} iteration ${N}`, logFile: logRel, iter: N });
      failure = res.failure; after = res.metric;
    }
    const decision = classify(run, after, failure);

    // 2. Snapshot the iteration's mutable state on top of lastKept.
    const diff = await mutableDiff(root, repo, run.lastKeptCommit, run, { write: true });
    const keptTree = (await G.gitOk(root, ['rev-parse', `${run.lastKeptCommit}^{tree}`])).trim();
    const iterTree = await writeTreeFrom(root, repo, run.lastKeptCommit, diff.entries);
    const loc = await locDelta(root, keptTree, iterTree);
    const kept = decision === 'green' || (decision === 'yellow' && loc.net < 0);

    let best = run.comparisonReference;
    if (decision === 'green') best = after;
    const counters = deriveCounters([...run.iterations, { decision, kept, failure }]);
    const rebaselined = decision === 'yellow' && kept && counters.consecutiveYellowKept >= 3;
    if (rebaselined) best = after; // three kept YELLOWs: judge later iterations against what the kept state scores now

    const hyp = oneLine(args.hypothesis, 300);
    const source = args.source || 'adaptive';
    const slug = slugOf(run.project);
    const iterMsg = message(
      `research(${slug}): iter ${N} ${decision}${kept ? '' : ' (reverted)'}: ${oneLine(args.hypothesis, 60)}`,
      `${run.eval.name}: ${fmt(before)} -> ${fmt(after)}${failure ? ` [${failure}]` : ''}; epsilon ${fmt(run.epsilon_abs)}; log ${logRel}.`,
      trailers(run, { iter: N, decision, before, after, source, hypothesis: hyp, kept, best, failure, loc, rebaselined }),
    );
    const iterCommit = await commitTree(root, iterTree, tip, iterMsg);
    await advanceRef(root, run.ref, iterCommit, tip);
    run.tip = iterCommit;

    // 3. Revert (after the iteration's diff is on the ref) or move the pointers (after the commit exists).
    let reverted = null; let revertCommit = null;
    if (!kept) {
      reverted = await revertMutable(root, repo, run.lastKeptCommit, run);
      const revMsg = message(
        `research(${slug}): revert iter ${N} to ${run.lastKeptCommit.slice(0, 12)}`,
        `Restored ${reverted.restored.length} path(s), deleted ${reverted.deleted.length} file(s) created by the iteration.`,
        trailers(run, { iter: N, decision, before, after, source, kept: false, best, failure, revert: run.lastKeptCommit }),
      );
      revertCommit = await commitTree(root, keptTree, iterCommit, revMsg);
      await advanceRef(root, run.ref, revertCommit, iterCommit);
      run.tip = revertCommit;
    } else {
      run.lastKeptCommit = iterCommit;
      if (decision === 'green') run.lastGreenCommit = iterCommit;
    }
    run.comparisonReference = best;
    run.bestSoFar = best;

    const entry = {
      n: N, decision, kept, reverted: !kept, before, after, failure, hypothesis: hyp, source,
      eval_type: 'full', loc, rebaselined: rebaselined || undefined, bestSoFar: best,
      commit: iterCommit, revert_commit: revertCommit, log: logRel, at: iso(),
      exit_code: res ? res.code : null, duration_ms: res ? res.duration_ms : null,
      tampered: tampered.length ? tampered : undefined,
      restored: reverted ? reverted.restored : undefined, deleted: reverted ? reverted.deleted : undefined,
    };
    run.iterations.push(entry);
    Object.assign(run, deriveCounters(run.iterations));

    // Defensive scope check (protocol C.3 step 4): report, do not clean.
    const dirty = await dirtyPaths(root, repo);
    const pre = new Set(run.preLoopDirty);
    const isMut = mutableMatcher(run.mutable);
    const outOfScope = dirty.filter((p) => !pre.has(p) && !isMut(p) && !(p === run.project || p.startsWith(`${run.project}/`)) && !p.startsWith('.shards/'));

    const reason = stopReason(run);
    if (reason) { run.converged = true; run.stop_reason = reason; run.status = 'converged'; }
    await saveRun(state, run);
    return { run, entry, outOfScope };
  });
}

function summary(run, { source = 'state', leaseActive = null } = {}) {
  const its = run.iterations || [];
  const counts = { green: 0, yellow: 0, red: 0, kept: 0, reverted: 0 };
  for (const x of its) { counts[x.decision] = (counts[x.decision] || 0) + 1; if (x.kept) counts.kept++; else counts.reverted++; }
  const elapsedMin = run.started_at ? (Date.now() - Date.parse(run.started_at)) / 60000 : null;
  return {
    run_id: run.run_id, project: run.project, ref: run.ref, status: run.status, source,
    iterations: its.length, decisions: counts,
    baseline: run.baseline, noise: run.noise, epsilon_abs: run.epsilon_abs,
    comparisonReference: run.comparisonReference, bestSoFar: run.bestSoFar,
    lastKeptCommit: run.lastKeptCommit, lastGreenCommit: run.lastGreenCommit, pre_loop_head: run.pre_loop_head,
    budget: run.budget,
    budget_remaining: {
      iterations: Math.max(0, run.budget.iterations - its.length),
      minutes: run.budget.minutes ? Math.max(0, Math.round((run.budget.minutes - elapsedMin) * 10) / 10) : null,
    },
    converged: !!run.converged, stop_reason: run.stop_reason || null, ended_at: run.ended_at || null,
    lease_active: leaseActive,
    recent: its.slice(-10).map((x) => ({ n: x.n, decision: x.decision, kept: x.kept, before: x.before, after: x.after, failure: x.failure || null, hypothesis: x.hypothesis, commit: x.commit })),
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
      run = { ...cfg, ref, status: 'active', baseline_commit: sha, comparisonReference: cfg.baseline, bestSoFar: cfg.baseline, lastKeptCommit: cfg.pre_loop_head, lastGreenCommit: cfg.pre_loop_head, iterations: [], converged: false, stop_reason: null };
      run.tip = sha;
      continue;
    }
    if (!run) continue;
    run.tip = sha;
    const n = Number(t['AR-Iter']);
    if (t['AR-Decision'] === 'stop') { run.status = 'ended'; run.stop_reason = t['AR-Stop'] || null; run.converged = true; continue; }
    const [before, after] = metricPair(t['AR-Metric']);
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
      log: `${run.project}/experiments/iter_${n}.log`,
    };
    run.iterations.push(e);
    if (kept) { run.lastKeptCommit = sha; if (e.decision === 'green') run.lastGreenCommit = sha; }
    if (e.bestSoFar !== null) { run.comparisonReference = e.bestSoFar; run.bestSoFar = e.bestSoFar; }
  }
  if (!run) throw new Error(`research ref ${ref} has no baseline commit`);
  Object.assign(run, deriveCounters(run.iterations));
  if (run.status === 'active') {
    const r = stopReason(run);
    if (r) { run.status = 'converged'; run.converged = true; run.stop_reason = r; }
  }
  return run;
}

async function findRef(root, runId) {
  const refs = await listRefs(root);
  if (!runId) return refs[0] || null;
  return refs.find((r) => r.endsWith(`/${runId}`)) || null;
}

// Resolve a run: session state first (by id, else the active run, else the newest), then the research ref.
async function resolveRun(ctx, runId) {
  const s = readStore(ctx.state);
  if (runId && s.runs[runId]) return { run: s.runs[runId], source: 'state' };
  if (!runId) {
    const r = activeRun(ctx.state) || latestRun(ctx.state);
    if (r) return { run: r, source: 'state' };
  }
  const ref = await findRef(ctx.root, runId);
  if (!ref) return { run: null, source: null };
  return { run: await rebuildFromRef(ctx.root, ref), source: 'ref' };
}

async function status(ctx, args = {}) {
  const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
  const { run, source } = await resolveRun(ctx, args.run_id);
  if (!run) return null;
  let lease = L.getActiveArLease(session);
  let leaseActive = !!(lease && lease.ar.run_id === run.run_id);
  let resumed = false;
  if (args.resume && run.status !== 'ended') {
    const cur = activeRun(ctx.state);
    if (cur && cur.run_id !== run.run_id && cur.status !== 'ended') throw new Error(`ar_status: run ${cur.run_id} is active in this session; end it before resuming ${run.run_id}`);
    if (lease && !leaseActive) throw new Error(`ar_status: AR lease ${lease.id} (run ${lease.ar.run_id}) is active; end that run first`);
    if (!leaseActive) {
      lease = await L.openArLease(session, { runId: run.run_id, project: run.project, mutable: run.mutable, immutable: run.immutable, meta: { ref: run.ref, resumed: true } });
      run.lease_id = lease.id; leaseActive = true;
    }
    await saveRun(ctx.state, run, { active: run.run_id });
    resumed = true;
  }
  return { ...summary(run, { source, leaseActive }), resumed };
}

async function end(ctx, args) {
  const session = { root: ctx.root, sessionKey: ctx.sessionKey, state: ctx.state };
  const { run: run0, source } = await resolveRun(ctx, args.run_id);
  if (!run0) throw new Error(`ar_end: no AR run${args.run_id ? ` ${args.run_id}` : ''} found`);
  if (run0.status === 'ended') throw new Error(`ar_end: run ${run0.run_id} already ended (${run0.stop_reason})`);
  return withRunLock(run0.run_id, async () => {
    const run = JSON.parse(JSON.stringify(run0));
    const tip = await refTip(ctx.root, run.ref);
    if (!tip) throw new Error(`ar_end: research ref ${run.ref} is missing`);
    const reason = oneLine(args.reason, 200) || run.stop_reason || 'user-interrupt';
    const N = (run.iterations || []).length;
    const tree = (await G.gitOk(ctx.root, ['rev-parse', `${tip}^{tree}`])).trim();
    const msg = message(
      `research(${slugOf(run.project)}): end ${run.run_id} (${reason})`,
      `${N} iteration(s); best ${run.eval.name} ${fmt(run.bestSoFar)} (baseline ${fmt(run.baseline)}). Kept state: ${run.lastKeptCommit}.`,
      trailers(run, { iter: N, decision: 'stop', before: run.baseline, after: run.bestSoFar, source: 'runtime', best: run.bestSoFar, stop: reason }),
    );
    const sha = await commitTree(ctx.root, tree, tip, msg);
    await advanceRef(ctx.root, run.ref, sha, tip);
    run.tip = sha;
    run.stop_reason = reason; run.converged = true; run.status = 'ended'; run.ended_at = iso();
    const closed = await L.closeArLease(session, run.run_id);
    const cur = readStore(ctx.state);
    await saveRun(ctx.state, run, { active: cur.active === run.run_id ? null : cur.active });
    return { run, closed, source };
  });
}

// Brief line for shards_status / sessions_resume.
function brief(state) {
  try {
    const r = activeRun(state) || latestRun(state);
    if (!r) return null;
    return { run_id: r.run_id, project: r.project, ref: r.ref, status: r.status, iterations: (r.iterations || []).length, budget: r.budget, bestSoFar: r.bestSoFar, baseline: r.baseline, stop_reason: r.stop_reason || null };
  } catch (_) { return null; }
}

module.exports = {
  start, iterate, status, end, brief, rebuildFromRef, resolveRun, summary,
  // exported for tests
  parseMetric, classify, stopReason, deriveCounters, runCommand, pinImmutable, slugOf, REF_ROOT, STATE, DEFAULTS,
};
