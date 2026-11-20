'use strict';
// E10.1: manifest-driven removal of a legacy v1 Shards install. Used by `shards migrate`.
// Safety rules: only paths recorded in .claude/.shards-manifest.json are deleted (plus the
// fixed gate-hook files the v1 installer put in .shards/hooks); anything changed after install
// or not recorded is left in place and reported (--force removes changed files too). Everything is reversible by git except the
// deletions themselves, so --dry-run reports the same plan without touching disk.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MANIFEST_REL = '.claude/.shards-manifest.json';
const MTIME_GRACE_MS = 60 * 1000; // install writes all files within seconds of installedAt
// Fallback only (manifests without hookEntries): the v1 installer's hook commands were
// `node $CLAUDE_PROJECT_DIR/.shards/hooks/gate-hook.js <sub>` and `node $CLAUDE_PROJECT_DIR/.shards/ui/relay.js <sub>`
// (older: .shards/ui/ui-push.js). Anchored to those paths so unrelated user hooks (e.g. scripts/webhook-relay.js) survive.
const LEGACY_HOOK_RE = /^node\s+(?:"?\$(?:\{CLAUDE_PROJECT_DIR\}|CLAUDE_PROJECT_DIR)"?\/|\.\/)?\.shards\/(?:hooks\/gate-hook(?:\.js(?:\s|"|$)|\/)|ui\/(?:relay\.js|ui-push(?:\.js)?)(?:\s|"|$))/;
const BLOCK_HEADINGS = ['## Shards — Agent Suite', '## Shards — Tool-call conventions'];
// Last lines of the v1 installer's blocks (tools/install.js at v-legacy): a block ends after them even when the
// user appended plain text with no heading.
const BLOCK_LAST_LINES = ['The knowledge directory is preserved across installs and uninstalls.', 'explicit user approval regardless of permission mode.'];

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

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

// Content provenance from git (fresh clones reset every mtime, so mtime alone says nothing there): a manifest file
// counts as pristine when it is tracked, has no change against HEAD, and was last changed in a commit that also
// touched the install manifest (i.e. it still holds what the installer wrote and was committed with it).
// Returns a Set of pristine rel paths, or null when git is unavailable / root is not in a work tree.
function gitPristine(root, rels) {
  try {
    if (git(root, ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') return null;
    git(root, ['rev-parse', '--verify', '-q', 'HEAD']);
  } catch (_) { return null; }
  const pristine = new Set();
  try {
    const tracked = new Set(git(root, ['ls-files', '-z', '--', ...rels]).split('\0').filter(Boolean));
    const dirty = new Set(git(root, ['diff', '--name-only', '-z', '--relative', 'HEAD', '--', ...rels]).split('\0').filter(Boolean));
    const cands = rels.filter((r) => tracked.has(r) && !dirty.has(r));
    if (!cands.length) return pristine;
    const log = git(root, ['log', '--format=@@%H', '--name-only', '--relative', '--', MANIFEST_REL, ...cands]);
    const last = new Map(); const manifestCommits = new Set();
    let commit = null;
    for (const line of log.split('\n')) {
      if (line.startsWith('@@')) { commit = line.slice(2); continue; }
      if (!line || !commit) continue;
      if (line === MANIFEST_REL) manifestCommits.add(commit);
      else if (!last.has(line)) last.set(line, commit); // log is newest first
    }
    for (const r of cands) if (last.has(r) && manifestCommits.has(last.get(r))) pristine.add(r);
  } catch (_) { /* treat as no evidence */ }
  return pristine;
}

function removeManifestFiles(root, manifest, dryRun, rep, force) {
  const installedAt = Date.parse(manifest.installedAt);
  const dirs = new Set();
  const keep = [];
  const list = Array.isArray(manifest.files) ? manifest.files : [];
  let pristine; // lazily computed: only needed when an mtime looks newer than the install
  let modified = 0; let candidates = 0;
  for (const rel of list) {
    const abs = safeJoin(root, rel);
    if (!abs) { rep.skipped.push({ path: String(rel), reason: 'unsafe path in manifest' }); keep.push(rel); continue; }
    let st;
    try { st = fs.lstatSync(abs); } catch (_) { continue; } // already gone
    if (!st.isFile()) { rep.skipped.push({ path: rel, reason: 'not a regular file' }); keep.push(rel); continue; }
    candidates++;
    if (Number.isFinite(installedAt) && st.mtimeMs > installedAt + MTIME_GRACE_MS) {
      if (pristine === undefined) pristine = gitPristine(root, list.filter((r) => safeJoin(root, r)).map(posix));
      if (!(pristine && pristine.has(posix(rel)))) {
        if (!force) { modified++; rep.skipped.push({ path: rel, reason: 'modified after install (kept; --force removes it)' }); keep.push(rel); continue; }
        rep.forced.push(rel);
      }
    }
    if (!dryRun) fs.unlinkSync(abs);
    rep.removed.push(rel);
    dirs.add(path.dirname(abs));
  }
  const pruned = [];
  pruneEmptyDirs(root, dirs, dryRun, pruned);
  rep.prunedDirs.push(...pruned);
  if (candidates && modified === candidates) rep.allSkippedModified = modified;
  return keep;
}

// Uses the manifest's exact hookEntries when present; the anchored LEGACY_HOOK_RE only for manifests without them.
function filterHooks(settings, manifest) {
  const hasRecorded = Array.isArray(manifest && manifest.hookEntries) && manifest.hookEntries.length > 0;
  const recorded = hasRecorded ? manifest.hookEntries : [];
  const dropped = [];
  const unrecorded = []; // v1-looking hooks the manifest did not record: kept, reported
  for (const ev of Object.keys(settings.hooks || {})) {
    if (!Array.isArray(settings.hooks[ev])) continue;
    const out = [];
    for (const entry of settings.hooks[ev]) {
      if (!entry || !Array.isArray(entry.hooks)) { out.push(entry); continue; }
      const keepInner = entry.hooks.filter((h) => {
        const cmd = h && h.command;
        if (typeof cmd !== 'string') return true;
        const isRecorded = recorded.some((r) => r.event === ev && (r.matcher || '') === (entry.matcher || '') && r.command === cmd);
        const legacyLike = LEGACY_HOOK_RE.test(cmd.trim());
        if (isRecorded || (!hasRecorded && legacyLike)) { dropped.push(`${ev}: ${cmd}`); return false; }
        if (legacyLike) unrecorded.push(`${ev}: ${cmd}`);
        return true;
      });
      if (keepInner.length === entry.hooks.length) out.push(entry);
      else if (keepInner.length) out.push({ ...entry, hooks: keepInner });
    }
    if (out.length) settings.hooks[ev] = out; else delete settings.hooks[ev];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  if (unrecorded.length) dropped.unrecorded = unrecorded;
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
  for (const h of dropped.unrecorded || []) rep.skipped.push({ path: '.claude/settings.json', reason: `hook not recorded in the install manifest, kept (remove it by hand if it is the v1 hook): ${h}` });
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

// Remove v1 "## Shards — ..." blocks: heading through the line before the next "# "/"## " heading or v2 marker, or
// through the v1 block's known last line. v2 marker regions (<!-- shards:begin ... --> ... <!-- shards:end ... -->,
// written by `shards install --claude-md`) are v2-managed and kept verbatim, even though they contain the same heading.
// Headings inside a closed code fence in a v1 block do not end the block. An
// unbalanced fence must never swallow content past the block: a v2 `<!-- shards:begin` marker
// always ends the skip (fence or not), and if any fence is left open (at EOF, or cut off by a
// marker, an end line or a new v1 block) the strip is redone without fence tracking (the next
// heading ends the block, as before fences were tracked).
function stripClaudeMd(text) {
  const lines = text.split('\n');
  const first = stripLines(lines, true);
  const { text: t, removed } = first.unbalanced ? stripLines(lines, false) : first;
  return { text: t, removed };
}

function stripLines(lines, trackFences) {
  const out = [];
  let removed = 0;
  let skipping = false;
  let inV2 = false;
  let fence = null; // open code fence marker (``` or ~~~) inside a skipped block
  let unbalanced = false;
  const cut = () => { if (fence) unbalanced = true; fence = null; };
  for (const line of lines) {
    if (skipping && trackFences && !line.includes('<!-- shards:begin')) {
      const m = /^\s*(```|~~~)/.exec(line);
      if (m && !fence) fence = m[1];
      else if (m && fence === m[1]) fence = null;
      if (fence || m) { if (!BLOCK_LAST_LINES.includes(line.trim())) continue; }
    }
    if (inV2) { out.push(line); if (line.includes('<!-- shards:end')) inV2 = false; continue; }
    if (line.includes('<!-- shards:begin')) { skipping = false; cut(); inV2 = !line.includes('<!-- shards:end'); out.push(line); continue; }
    if (BLOCK_HEADINGS.includes(line.trimEnd())) { skipping = true; cut(); removed++; continue; }
    if (skipping && /^#{1,2} /.test(line)) skipping = false;
    if (skipping && BLOCK_LAST_LINES.includes(line.trim())) { skipping = false; cut(); continue; }
    if (!skipping) out.push(line);
  }
  cut();
  return { text: out.join('\n'), removed, unbalanced };
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
function removeLegacyInstall({ root, dryRun = false, force = false }) {
  const rep = { manifestFound: false, removed: [], forced: [], allSkippedModified: 0, skipped: [], prunedDirs: [], hooksRemoved: [], claudeMd: null, manifestAction: 'none', failures: 0 };
  const { manifest, file, error } = readManifest(root);
  if (error) { rep.skipped.push({ path: MANIFEST_REL, reason: `unreadable manifest (${error}); file removal skipped` }); rep.failures++; }
  if (manifest) {
    rep.manifestFound = true;
    let keep;
    try { keep = removeManifestFiles(root, manifest, dryRun, rep, force); } catch (e) { rep.failures++; rep.skipped.push({ path: '(manifest files)', reason: e.message }); keep = manifest.files; }
    cleanSettings(root, manifest, dryRun, rep);
    if (!dryRun) {
      if (keep.length) {
        // hookEntries stay: an empty list would make the next run fall back to LEGACY_HOOK_RE and delete
        // unrecorded v1-looking hooks this run reported as kept (the recorded ones are already gone).
        fs.writeFileSync(file, JSON.stringify({ ...manifest, files: keep }, null, 2));
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

module.exports = { removeLegacyInstall, stripClaudeMd, filterHooks, LEGACY_HOOK_RE, isSourceRepo, MANIFEST_REL };
