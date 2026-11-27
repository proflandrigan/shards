'use strict';
// Review runtime (verified review delegation): run ids, slice rules for purpose=review leases, the verdict merge
// for review leases, and the content snapshot a review uses to prove it changed nothing outside its scratch dirs.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const leases = require('../leases');

const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_SLICES_PER_CALL = 4;
const MAX_SLICES_PER_RUN = 16;
const STATUSES = ['CONFIRMED', 'PLAUSIBLE', 'REFUTED'];
const RULES = 'verifier: no gates, no delegation (never spawn subagents), no source fixes; write only inside owned_paths (your scratch dir); run code only if the brief says code execution is approved; return status JSON {slice_id, status: CONFIRMED|PLAUSIBLE|REFUTED, summary, findings}';
const SKIP_NAMES = new Set(['.git', '.shards', 'node_modules', 'venv', '.venv', '__pycache__', '.pytest_cache']);

function validateRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_RE.test(runId)) throw new Error(`run_id must match ${RUN_ID_RE} (got ${JSON.stringify(runId)})`);
  return runId;
}

function runDir(runId) {
  return `.shards/review/${runId}`;
}

// Every review slice path must sit strictly inside .shards/review/<run_id>/ (slices are normalized already).
function assertRunSlices(slices, runId) {
  validateRunId(runId);
  if (slices.length > MAX_SLICES_PER_CALL) throw new Error(`fanout_start: at most ${MAX_SLICES_PER_CALL} review slices per call (got ${slices.length})`);
  const prefix = `${runDir(runId)}/`;
  for (const s of slices) {
    for (const p of s.paths) {
      if (!p.startsWith(prefix)) throw new Error(`fanout_start: review slice "${s.id}" path ${p} must be inside ${runDir(runId)}/`);
    }
  }
}

// Lease guard (runs under the state lock): 16 slices per run_id in the session, open or closed.
function assertRunCap(leasesObj, runId, adding) {
  let used = 0;
  for (const l of Object.values(leasesObj || {})) {
    if (l && l.owner === 'review' && l.meta && l.meta.run_id === runId) used += (l.slices || []).length;
  }
  if (used + adding > MAX_SLICES_PER_RUN) {
    throw new Error(`fanout_start refused: run ${runId} already has ${used} review slice(s); at most ${MAX_SLICES_PER_RUN} per run_id (this call adds ${adding})`);
  }
}

// mergeReview(results, lease): one {slice_id, status, summary?, findings?} per slice. APPROVED only when every
// finding was REFUTED: a CONFIRMED one is a real issue and a PLAUSIBLE one was never tested. All are kept in per_slice.
function mergeReview(results, lease) {
  if (!Array.isArray(results) || !results.length) throw new Error('mergeReview: results must be a non-empty array');
  const want = new Set((lease.slices || []).map((s) => s.id));
  const per_slice = {};
  for (const r of results) {
    if (!r || typeof r.slice_id !== 'string' || !r.slice_id || !want.has(r.slice_id)) throw new Error(`mergeVerdicts: unknown slice "${r && r.slice_id}"`);
    if (Object.prototype.hasOwnProperty.call(per_slice, r.slice_id)) throw new Error(`mergeVerdicts: duplicate result for slice "${r.slice_id}"`);
    if (!STATUSES.includes(r.status)) throw new Error(`mergeVerdicts: invalid status "${r.status}" for slice "${r.slice_id}" (CONFIRMED, PLAUSIBLE or REFUTED)`);
    per_slice[r.slice_id] = { status: r.status, ...(r.summary !== undefined ? { summary: r.summary } : {}), ...(r.findings !== undefined ? { findings: r.findings } : {}) };
  }
  const missing = [...want].filter((id) => !(id in per_slice));
  if (missing.length) throw new Error(`mergeVerdicts: missing result for slice(s): ${missing.join(', ')}`);
  const counts = { CONFIRMED: 0, PLAUSIBLE: 0, REFUTED: 0 };
  for (const x of Object.values(per_slice)) counts[x.status] += 1;
  const verdict = counts.CONFIRMED + counts.PLAUSIBLE > 0 ? 'NEEDS REVISION' : 'APPROVED';
  return { verdict, counts, per_slice };
}

// ---------- content snapshot (review_snapshot) ----------
function skipped(name) {
  return SKIP_NAMES.has(name);
}

// Walk rel (project-relative file or directory) and record a sha256 per file. Symlinks are recorded by their
// target text and never followed. Missing paths contribute nothing (their files show up as deleted).
function hashTree(root, rel, out) {
  const abs = path.join(root, rel);
  let st;
  try { st = fs.lstatSync(abs); } catch (e) { if (e.code === 'ENOENT') return out; throw e; }
  if (st.isSymbolicLink()) {
    out[rel] = `link:${crypto.createHash('sha256').update(fs.readlinkSync(abs)).digest('hex')}`;
  } else if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs).sort()) {
      if (skipped(name)) continue;
      hashTree(root, rel === '.' ? name : `${rel}/${name}`, out);
    }
  } else if (st.isFile()) {
    out[rel] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  }
  return out;
}

function snapshotFile(state, runId) {
  return path.join(state.sessionDir, 'review-snapshots', `${runId}.json`);
}

function hashPaths(root, paths) {
  const files = {};
  for (const p of paths) hashTree(root, p, files);
  return files;
}

// action start: record the baseline for paths (project-relative). action check: re-hash the same paths.
function snapshot(root, state, { action, run_id: runId, paths } = {}) {
  validateRunId(runId);
  const file = snapshotFile(state, runId);
  if (action === 'start') {
    if (!Array.isArray(paths) || !paths.length) throw new Error('review_snapshot start requires paths (project-relative)');
    // '.' means the whole project: reviews are often pointed at the root (lease paths cannot be, snapshots can).
    const norm = [...new Set(paths.map((p) => (p === '.' || p === './' ? '.' : leases.normalizeRel(p))))];
    const files = hashPaths(root, norm);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ run_id: runId, paths: norm, started_at: new Date().toISOString(), files }, null, 2));
    fs.renameSync(tmp, file);
    return { run_id: runId, paths: norm, files: Object.keys(files).length };
  }
  if (action === 'check') {
    if (!fs.existsSync(file)) throw new Error(`review_snapshot: no snapshot for run ${runId}; call action start first`);
    const base = JSON.parse(fs.readFileSync(file, 'utf8'));
    const now = hashPaths(root, base.paths);
    const added = []; const modified = []; const deleted = [];
    for (const [f, h] of Object.entries(now)) if (!(f in base.files)) added.push(f); else if (base.files[f] !== h) modified.push(f);
    for (const f of Object.keys(base.files)) if (!(f in now)) deleted.push(f);
    const clean = !added.length && !modified.length && !deleted.length;
    return { clean, added: added.sort(), modified: modified.sort(), deleted: deleted.sort() };
  }
  throw new Error('review_snapshot action must be start or check');
}

module.exports = {
  RULES, STATUSES, RUN_ID_RE, MAX_SLICES_PER_CALL, MAX_SLICES_PER_RUN,
  validateRunId, runDir, assertRunSlices, assertRunCap, mergeReview, hashTree, snapshot,
};
