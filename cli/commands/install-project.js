'use strict';
// `shards install --project` (E9.1): copy the generated Agent Skills into <root>/.claude/skills/ and
// <root>/.agents/skills/ (plus the content/ tree they read, under <root>/.shards/content/).
// Every file written is recorded with its sha256 in <root>/.shards/project-install.json; --remove deletes
// exactly those files (a file edited since install is kept and reported). Existing files that this command
// did not write are never overwritten (reported as conflicts).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MANIFEST = path.join('.shards', 'project-install.json');
const SKILL_DIRS = [path.join('.claude', 'skills'), path.join('.agents', 'skills')];
const CONTENT_DIR = path.join('.shards', 'content');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (e.isFile()) out.push(path.relative(base, full));
  }
  return out.sort();
}

// Build the skills target to a temp dir and return Map(rel path under root -> Buffer).
function planFiles() {
  const { compile } = require('../../build/compile');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-skills-'));
  try {
    const r = compile({ target: 'skills', outDir: tmp });
    if (r.errors.length) throw new Error(`skills build failed: ${r.errors.join('; ')}`);
    const plan = new Map();
    for (const rel of walk(path.join(tmp, 'skills'))) {
      // Skills read `content/...` relative to the project root; the project copy lives under .shards/content.
      const text = fs.readFileSync(path.join(tmp, 'skills', rel), 'utf8').replace(/(?<![\w./-])content\//g, `${posix(CONTENT_DIR)}/`);
      for (const d of SKILL_DIRS) plan.set(posix(path.join(d, rel)), Buffer.from(text));
    }
    for (const rel of walk(path.join(tmp, 'content'))) plan.set(posix(path.join(CONTENT_DIR, rel)), fs.readFileSync(path.join(tmp, 'content', rel)));
    return plan;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function readManifest(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8')); } catch (_) { return null; }
}
function writeAtomic(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
}

function pruneEmpty(root, rels) {
  const dirs = new Set();
  for (const rel of rels) {
    let d = path.dirname(rel);
    while (d && d !== '.' && d !== path.dirname(d)) { dirs.add(d); d = path.dirname(d); }
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    const full = path.join(root, d);
    try { if (fs.readdirSync(full).length === 0) fs.rmdirSync(full); } catch (_) { /* absent or non-empty */ }
  }
}

function installProject(root, opts = {}) {
  const plan = opts.plan || planFiles();
  const prev = readManifest(root);
  const owned = new Map(((prev && prev.files) || []).map((f) => [f.path, f.sha256]));
  const files = []; const conflicts = []; let written = 0; let unchanged = 0;
  for (const [rel, buf] of [...plan].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const full = path.join(root, rel);
    const digest = sha(buf);
    if (fs.existsSync(full)) {
      const cur = sha(fs.readFileSync(full));
      if (cur === digest) { unchanged++; files.push({ path: rel, sha256: digest }); continue; }
      // Ours and unedited since install: safe to update. Anything else is the user's file.
      if (!(owned.has(rel) && owned.get(rel) === cur)) { conflicts.push(rel); continue; }
    }
    if (!opts.dryRun) writeAtomic(full, buf);
    written++;
    files.push({ path: rel, sha256: digest });
  }
  // Files from a previous install that the plan no longer has: remove if unedited.
  const stale = [...owned.keys()].filter((p) => !plan.has(p));
  if (!opts.dryRun) {
    for (const rel of stale) {
      const full = path.join(root, rel);
      try { if (sha(fs.readFileSync(full)) === owned.get(rel)) fs.rmSync(full, { force: true }); } catch (_) { /* gone */ }
    }
    writeAtomic(path.join(root, MANIFEST), JSON.stringify({ version: 1, files }, null, 2) + '\n');
    pruneEmpty(root, stale);
  }
  return { written, unchanged, conflicts, removedStale: stale.length, total: plan.size };
}

function removeProject(root, opts = {}) {
  const m = readManifest(root);
  if (!m) return { changed: false, removed: 0, kept: [] };
  const removed = []; const kept = [];
  for (const f of m.files || []) {
    const full = path.join(root, f.path);
    let cur;
    try { cur = sha(fs.readFileSync(full)); } catch (_) { continue; } // already gone
    if (cur !== f.sha256) { kept.push(f.path); continue; }
    if (!opts.dryRun) fs.rmSync(full, { force: true });
    removed.push(f.path);
  }
  if (!opts.dryRun) {
    if (kept.length) writeAtomic(path.join(root, MANIFEST), JSON.stringify({ version: 1, files: (m.files || []).filter((f) => kept.includes(f.path)) }, null, 2) + '\n');
    else fs.rmSync(path.join(root, MANIFEST), { force: true });
    pruneEmpty(root, [...removed, MANIFEST]);
  }
  return { changed: true, removed: removed.length, kept };
}

module.exports = { installProject, removeProject, planFiles, MANIFEST, SKILL_DIRS, CONTENT_DIR };
