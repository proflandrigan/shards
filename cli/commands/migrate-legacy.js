'use strict';
// E10.1: manifest-driven removal of a legacy v1 Shards install. Used by `shards migrate`.
// Safety rules: only paths recorded in .claude/.shards-manifest.json are deleted (plus the
// fixed gate-hook files the v1 installer put in .shards/hooks); anything changed after install
// or not recorded is left in place and reported. Everything is reversible by git except the
// deletions themselves, so --dry-run reports the same plan without touching disk.
const fs = require('fs');
const path = require('path');

const MANIFEST_REL = '.claude/.shards-manifest.json';
const MTIME_GRACE_MS = 60 * 1000; // install writes all files within seconds of installedAt
const LEGACY_HOOK_RE = /gate-hook\.js|relay\.js|ui-push|\.shards\/ui\b|\.shards\/hooks\/gate-hook/;
const BLOCK_HEADINGS = ['## Shards — Agent Suite', '## Shards — Tool-call conventions'];

const posix = (p) => p.split(path.sep).join('/');

function readManifest(root) {
  const file = path.join(root, MANIFEST_REL);
  if (!fs.existsSync(file)) return { manifest: null, file };
  try { return { manifest: JSON.parse(fs.readFileSync(file, 'utf8')), file }; } catch (e) { return { manifest: null, file, error: e.message }; }
}

// Resolve a manifest path inside root; null if absolute or escaping.
function safeJoin(root, rel) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel)) return null;
  const abs = path.resolve(root, rel);
  const r = path.relative(path.resolve(root), abs);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) return null;
  return abs;
}

function pruneEmptyDirs(root, dirs, dryRun, removed) {
  const sorted = [...dirs].sort((a, b) => b.length - a.length);
  for (const d of sorted) {
    let cur = d;
    while (cur.startsWith(path.resolve(root) + path.sep)) {
      let ents;
      try { ents = fs.readdirSync(cur); } catch (_) { break; }
      if (ents.length) break;
      if (cur === path.join(path.resolve(root), '.claude') || cur === path.join(path.resolve(root), '.shards')) break;
      if (!dryRun) { try { fs.rmdirSync(cur); } catch (_) { break; } }
      removed.push(posix(path.relative(root, cur)) + '/');
      cur = path.dirname(cur);
    }
  }
}

function removeManifestFiles(root, manifest, dryRun, rep) {
  const installedAt = Date.parse(manifest.installedAt);
  const dirs = new Set();
  const keep = [];
  for (const rel of Array.isArray(manifest.files) ? manifest.files : []) {
    const abs = safeJoin(root, rel);
    if (!abs) { rep.skipped.push({ path: String(rel), reason: 'unsafe path in manifest' }); keep.push(rel); continue; }
    let st;
    try { st = fs.lstatSync(abs); } catch (_) { continue; } // already gone
    if (!st.isFile()) { rep.skipped.push({ path: rel, reason: 'not a regular file' }); keep.push(rel); continue; }
    if (Number.isFinite(installedAt) && st.mtimeMs > installedAt + MTIME_GRACE_MS) {
      rep.skipped.push({ path: rel, reason: 'modified after install (kept)' }); keep.push(rel); continue;
    }
    if (!dryRun) fs.unlinkSync(abs);
    rep.removed.push(rel);
    dirs.add(path.dirname(abs));
  }
  const pruned = [];
  pruneEmptyDirs(root, dirs, dryRun, pruned);
  rep.prunedDirs.push(...pruned);
  return keep;
}

function filterHooks(settings, manifest) {
  const recorded = Array.isArray(manifest && manifest.hookEntries) ? manifest.hookEntries : [];
  const dropped = [];
  for (const ev of Object.keys(settings.hooks || {})) {
    if (!Array.isArray(settings.hooks[ev])) continue;
    const out = [];
    for (const entry of settings.hooks[ev]) {
      if (!entry || !Array.isArray(entry.hooks)) { out.push(entry); continue; }
      const keepInner = entry.hooks.filter((h) => {
        const cmd = h && h.command;
        if (typeof cmd !== 'string') return true;
        const isRecorded = recorded.some((r) => r.event === ev && (r.matcher || '') === (entry.matcher || '') && r.command === cmd);
        if (isRecorded || LEGACY_HOOK_RE.test(cmd)) { dropped.push(`${ev}: ${cmd}`); return false; }
        return true;
      });
      if (keepInner.length === entry.hooks.length) out.push(entry);
      else if (keepInner.length) out.push({ ...entry, hooks: keepInner });
    }
    if (out.length) settings.hooks[ev] = out; else delete settings.hooks[ev];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  return dropped;
}

function cleanSettings(root, manifest, dryRun, rep) {
  const file = path.join(root, '.claude', 'settings.json');
  if (!fs.existsSync(file)) return;
  let settings;
  try { settings = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    rep.skipped.push({ path: '.claude/settings.json', reason: `invalid JSON, hooks not cleaned (${e.message})` }); rep.failures++;
    return;
  }
  if (!settings || typeof settings !== 'object' || !settings.hooks) return;
  const dropped = filterHooks(settings, manifest);
  if (!dropped.length) return;
  if (!dryRun) fs.writeFileSync(file, JSON.stringify(settings, null, 2));
  rep.hooksRemoved.push(...dropped);
}

function removeGateHookFiles(root, dryRun, rep) {
  const hooksDir = path.join(root, '.shards', 'hooks');
  if (!fs.existsSync(hooksDir)) return;
  for (const name of ['gate-hook.js', 'gate-hook']) {
    const p = path.join(hooksDir, name);
    let st;
    try { st = fs.lstatSync(p); } catch (_) { continue; }
    if (!dryRun) fs.rmSync(p, { recursive: st.isDirectory(), force: true });
    rep.removed.push(`.shards/hooks/${name}${st.isDirectory() ? '/' : ''}`);
  }
  let left = [];
  try { left = fs.readdirSync(hooksDir); } catch (_) { /* gone */ }
  if (!left.length || (dryRun && left.every((n) => ['gate-hook.js', 'gate-hook'].includes(n)))) {
    if (!dryRun) { try { fs.rmdirSync(hooksDir); } catch (_) { /* ignore */ } }
    rep.prunedDirs.push('.shards/hooks/');
  } else {
    rep.skipped.push({ path: '.shards/hooks', reason: `not recorded by the installer (${left.join(', ')}); kept` });
  }
}

// Remove "## Shards — ..." blocks: heading through the line before the next other "## " heading.
function stripClaudeMd(text) {
  const lines = text.split('\n');
  const out = [];
  let removed = 0;
  let skipping = false;
  for (const line of lines) {
    if (BLOCK_HEADINGS.includes(line.trimEnd())) { skipping = true; removed++; continue; }
    if (skipping && /^## /.test(line)) skipping = false;
    if (!skipping) out.push(line);
  }
  return { text: out.join('\n'), removed };
}

function cleanClaudeMd(root, dryRun, rep) {
  const file = path.join(root, 'CLAUDE.md');
  if (!fs.existsSync(file)) return;
  const orig = fs.readFileSync(file, 'utf8');
  const { text, removed } = stripClaudeMd(orig);
  if (!removed) return;
  const tidy = text.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  const remove = tidy.trim() === '' || tidy.trim() === '# Project';
  if (!dryRun) {
    if (remove) fs.unlinkSync(file); else fs.writeFileSync(file, tidy + '\n');
  }
  rep.claudeMd = { blocksRemoved: removed, fileRemoved: remove };
}

function isSourceRepo(root) {
  return fs.existsSync(path.join(root, 'tools', 'install.js')) && fs.existsSync(path.join(root, 'core', 'agents')) && fs.existsSync(path.join(root, 'package.json'));
}

// Returns a report. Never throws for per-file problems.
function removeLegacyInstall({ root, dryRun = false }) {
  const rep = { manifestFound: false, removed: [], skipped: [], prunedDirs: [], hooksRemoved: [], claudeMd: null, manifestAction: 'none', failures: 0 };
  const { manifest, file, error } = readManifest(root);
  if (error) { rep.skipped.push({ path: MANIFEST_REL, reason: `unreadable manifest (${error}); file removal skipped` }); rep.failures++; }
  if (manifest) {
    rep.manifestFound = true;
    let keep;
    try { keep = removeManifestFiles(root, manifest, dryRun, rep); } catch (e) { rep.failures++; rep.skipped.push({ path: '(manifest files)', reason: e.message }); keep = manifest.files; }
    cleanSettings(root, manifest, dryRun, rep);
    if (!dryRun) {
      if (keep.length) {
        fs.writeFileSync(file, JSON.stringify({ ...manifest, files: keep, hookEntries: [] }, null, 2));
        rep.manifestAction = 'rewritten (skipped files remain recorded)';
      } else { fs.unlinkSync(file); rep.manifestAction = 'removed'; }
    } else rep.manifestAction = keep.length ? 'would rewrite' : 'would remove';
  } else if (!error) {
    cleanSettings(root, null, dryRun, rep); // fallback: pattern-based hook cleanup still applies
  }
  removeGateHookFiles(root, dryRun, rep);
  cleanClaudeMd(root, dryRun, rep);
  if (fs.existsSync(path.join(root, '.shards', 'runtime'))) {
    rep.skipped.push({ path: '.shards/runtime', reason: 'legacy hook support libs, not recorded in manifest; remove manually if unused' });
  }
  return rep;
}

module.exports = { removeLegacyInstall, stripClaudeMd, filterHooks, isSourceRepo, MANIFEST_REL };
