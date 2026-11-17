'use strict';
// `shards migrate` (E10.1): migrate a legacy v1 install to the v2 layout.
//   --export-ledger  only the ledger-export step (E4.5a): .shards/knowledge/** -> docs/knowledge/*.md
//   (default)        full migrate: ledger export, gate-history import (E11.11), then manifest-driven
//                    removal of the legacy install. Never commits. Idempotent.
const fs = require('fs');
const path = require('path');

const CATEGORIES = ['entities', 'infrastructure', 'patterns', 'features'];
const DATE_KEYS = ['date', 'created', 'verified', 'updated', 'last_verified'];
const INDEX_NAME = 'INDEX.md';

const HELP = `Usage: shards migrate [--export-ledger] [--root <dir>] [--out <dir>] [--dry-run] [--force]

Full migrate (no --export-ledger): moves a legacy v1 Shards install to the v2 layout.
  1. Exports the Knowledge Ledger (.shards/knowledge/) to docs/knowledge/*.md (kept in place).
  2. Imports legacy gate history (.shards/gates/state.json, single-slot or v2 "sessions"
     format, plus gates.jsonl) into runtime state (.shards/state/sessions/legacy-import/)
     and a git note on HEAD (refs/notes/shards-legacy-gates). The old files are archived to
     .shards/archive/legacy-gates/, not deleted.
  3. Removes what the install manifest (.claude/.shards-manifest.json) recorded: legacy
     .claude/agents and .claude/commands files, .shards/ui, templates/, docs/shards-guide/.
     Files changed after install (mtime later than the manifest's installedAt) are NOT
     deleted; they are reported as skipped. Files not in the manifest are never touched.
  4. Removes the legacy gate and relay hook entries from .claude/settings.json (manifest
     hookEntries, plus gate-hook.js / relay.js / ui-push matches) and .shards/hooks/gate-hook*.
  5. Removes the "## Shards — Agent Suite" and "## Shards — Tool-call conventions" blocks
     from CLAUDE.md.
Output folders (analysis/, studies/, models/, ...) are never touched.

--export-ledger runs only step 1 (see below).

Ledger export: exports <root>/.shards/knowledge/ (INDEX.md plus entities/, infrastructure/,
patterns/, features/) to plain markdown under <root>/docs/knowledge/ (or --out). Each file gets
YAML front matter with source_path, category, any date fields, and the original front matter
verbatim under 'original:'; the original body follows unchanged. Output names:
<category>-<slug>.md (suffix -2, -3 on collision); the ledger index becomes INDEX.md.

Options:
  --export-ledger   run only the ledger export
  --root <dir>      project root (default: cwd)
  --out <dir>       ledger output dir (default: <root>/docs/knowledge)
  --dry-run         report what would change, write and delete nothing
  --force           overwrite differing existing ledger-export files (otherwise conflicts, exit 1)

Idempotent: re-running is a no-op. Does not commit; afterwards run:
  git add -A docs && git commit -m "chore: migrate legacy shards install"
`;

function slugify(s) {
  const r = s.toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
  return r || 'entry';
}

function splitFrontMatter(text) {
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { fm: null, body: text };
  return { fm: m[1], body: text.slice(m[0].length) };
}

function yamlScalar(v) { return JSON.stringify(v); }

function extractDates(fm) {
  const out = [];
  if (!fm) return out;
  for (const line of fm.split(/\r?\n/)) {
    const m = /^([A-Za-z_]+)\s*:\s*["']?(\d{4}-\d{2}-\d{2}[^"'\s]*)["']?\s*$/.exec(line);
    if (m && DATE_KEYS.includes(m[1].toLowerCase())) out.push([m[1].toLowerCase(), m[2]]);
  }
  return out;
}

function render(rel, category, text) {
  const { fm, body } = splitFrontMatter(text);
  const lines = ['---', `source_path: ${yamlScalar(rel)}`, `category: ${category}`];
  for (const [k, v] of extractDates(fm)) lines.push(`${k}: ${yamlScalar(v)}`);
  if (fm !== null) {
    lines.push('original: |');
    for (const l of fm.split(/\r?\n/)) lines.push(l === '' ? '' : `  ${l}`);
  }
  lines.push('---', '');
  return lines.join('\n') + body;
}

function walk(dir, base, acc) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { acc.errors.push({ rel: path.relative(base, dir), error: e.message }); return; }
  ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of ents) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (e.isSymbolicLink()) { acc.skipped.push(rel); continue; }
    if (e.isDirectory()) walk(full, base, acc);
    else if (e.isFile() && /\.md$/i.test(e.name)) acc.files.push(rel);
    else acc.skipped.push(rel);
  }
}

function exportLedger({ root, out, dryRun, force }) {
  const ledger = path.join(root, '.shards', 'knowledge');
  const res = { found: false, total: 0, exported: 0, unchanged: 0, written: [], conflicts: [], failures: [], skipped: [], outDir: out };
  if (!fs.existsSync(ledger) || !fs.statSync(ledger).isDirectory()) return res;
  res.found = true;
  const acc = { files: [], skipped: [], errors: [] };
  walk(ledger, ledger, acc);
  res.skipped = acc.skipped;
  for (const e of acc.errors) { res.total++; res.failures.push(`${e.rel}: ${e.error}`); }

  const used = new Set();
  const plan = [];
  for (const rel of acc.files) {
    res.total++;
    const parts = rel.split('/');
    let category; let name;
    if (rel === INDEX_NAME) { category = 'index'; name = INDEX_NAME; }
    else {
      category = CATEGORIES.includes(parts[0]) ? parts[0] : 'misc';
      const stem = (CATEGORIES.includes(parts[0]) ? parts.slice(1) : parts).join('-');
      let cand = `${category}-${slugify(stem)}.md`; let n = 2;
      while (used.has(cand.toLowerCase()) || cand.toLowerCase() === INDEX_NAME.toLowerCase()) cand = `${category}-${slugify(stem)}-${n++}.md`;
      name = cand;
    }
    used.add(name.toLowerCase());
    let text;
    try { text = fs.readFileSync(path.join(ledger, rel), 'utf8'); } catch (e) { res.failures.push(`${rel}: ${e.message}`); continue; }
    plan.push({ rel, name, content: render(rel, category, text) });
  }

  if (!dryRun && plan.length) fs.mkdirSync(out, { recursive: true });
  for (const p of plan) {
    const target = path.join(out, p.name);
    try {
      let exists = false; let same = false;
      if (fs.existsSync(target)) { exists = true; same = fs.readFileSync(target, 'utf8') === p.content; }
      if (exists && same) { res.unchanged++; res.exported++; continue; }
      if (exists && !force) { res.conflicts.push(p.name); continue; }
      if (!dryRun) fs.writeFileSync(target, p.content);
      res.written.push(p.name); res.exported++;
    } catch (e) { res.failures.push(`${p.rel}: ${e.message}`); }
  }
  return res;
}

function parseArgs(argv) {
  const o = { dryRun: false, force: false, exportLedger: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--export-ledger') o.exportLedger = true;
    else if (a === '--root') o.root = path.resolve(val());
    else if (a === '--out') o.out = path.resolve(val());
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--force') o.force = true;
    else throw new Error(`unknown option '${a}'`);
  }
  return o;
}

function reportLedger(r, o, out) {
  if (!r.found) { console.log(`no ledger found at ${path.join(o.root, '.shards', 'knowledge')}; nothing to export`); return; }
  const verb = o.dryRun ? 'would write' : 'wrote';
  for (const n of r.written) console.log(`  ${verb} ${path.join(out, n)}`);
  for (const n of r.conflicts) console.error(`  CONFLICT ${n}: exists and differs (hand-edited?); use --force to overwrite`);
  for (const f of r.failures) console.error(`  FAILED ${f}`);
  for (const s of r.skipped) console.log(`  skipped non-markdown/symlink: ${s}`);
  console.log(`exported ${r.exported} of ${r.total} entries (${r.written.length} ${o.dryRun ? 'to write' : 'written'}, ${r.unchanged} unchanged${o.dryRun ? ', dry run' : ''})`);
  if (r.conflicts.length || r.failures.length) console.error(`${r.conflicts.length} conflict(s), ${r.failures.length} failure(s)`);
}

function runExportLedger(o) {
  const out = o.out || path.join(o.root, 'docs', 'knowledge');
  const r = exportLedger({ root: o.root, out, dryRun: o.dryRun, force: o.force });
  reportLedger(r, o, out);
  if (r.found && (r.conflicts.length || r.failures.length)) return 1;
  if (r.found && !o.dryRun) console.log('\nNot committed. Review, then run:\n  git add docs/knowledge && git commit -m "docs: export knowledge ledger"');
  return 0;
}

// Full migrate (E10.1). Returns a Promise<exit code>.
async function runFull(o) {
  const { removeLegacyInstall, isSourceRepo } = require('./migrate-legacy');
  const { importLegacyGateHistory } = require('../../runtime/gates/legacy-import');
  if (isSourceRepo(o.root)) { console.error(`shards migrate: ${o.root} is the shards source repository, not a legacy install; refusing`); return 2; }
  const tag = o.dryRun ? '[dry run] ' : '';
  let code = 0;

  console.log(`${tag}1/4 knowledge ledger`);
  const out = o.out || path.join(o.root, 'docs', 'knowledge');
  const led = exportLedger({ root: o.root, out, dryRun: o.dryRun, force: o.force });
  reportLedger(led, o, out);
  if (led.found && (led.conflicts.length || led.failures.length)) code = 1;

  console.log(`${tag}2/4 gate history`);
  let gh;
  try { gh = await importLegacyGateHistory({ root: o.root, dryRun: o.dryRun }); } catch (e) { console.error(`  FAILED gate-history import: ${e.message}`); gh = { found: true, errors: [e.message] }; }
  if (!gh.found) console.log('  no legacy gate files found');
  else {
    for (const e of gh.errors || []) { console.error(`  FAILED ${e}`); code = 1; }
    if (!(gh.errors || []).length) {
      console.log(`  ${o.dryRun ? 'would import' : 'imported'} ${gh.imported} gate(s) (${gh.skippedExisting} already present, ${gh.openAbandoned} legacy-open marked abandoned${gh.bad ? `, ${gh.bad} unparsable jsonl line(s) ignored` : ''})`);
      console.log(`  git note: ${gh.notes.status}${gh.notes.reason ? ` (${gh.notes.reason})` : ''}`);
      if (gh.notes.status === 'failed') code = 1;
      for (const a of gh.archived) console.log(`  ${o.dryRun ? 'would archive' : 'archived'} -> ${a}`);
    }
  }

  console.log(`${tag}3/4 legacy install`);
  const rep = removeLegacyInstall({ root: o.root, dryRun: o.dryRun });
  if (!rep.manifestFound) console.log('  no readable install manifest (.claude/.shards-manifest.json); manifest-driven removal skipped');
  for (const f of rep.removed) console.log(`  ${o.dryRun ? 'would remove' : 'removed'} ${f}`);
  for (const d of rep.prunedDirs) console.log(`  ${o.dryRun ? 'would remove empty dir' : 'removed empty dir'} ${d}`);
  for (const h of rep.hooksRemoved) console.log(`  ${o.dryRun ? 'would remove' : 'removed'} hook ${h}`);
  if (rep.claudeMd) console.log(`  ${o.dryRun ? 'would remove' : 'removed'} ${rep.claudeMd.blocksRemoved} Shards block(s) from CLAUDE.md${rep.claudeMd.fileRemoved ? ' (file was installer-created and is now empty: removed)' : ''}`);
  if (rep.manifestFound) console.log(`  manifest: ${rep.manifestAction}`);
  for (const s of rep.skipped) console.log(`  SKIPPED ${s.path}: ${s.reason}`);
  if (rep.failures) code = 1;

  const changed = (gh.imported || 0) + (gh.archived ? gh.archived.length : 0) + led.written.length + rep.removed.length + rep.hooksRemoved.length + (rep.claudeMd ? 1 : 0);
  console.log(`4/4 summary: ${changed ? `${o.dryRun ? 'would change' : 'changed'} ${changed} item(s)` : 'nothing to do (already migrated)'}; ${rep.skipped.length} skipped; output folders untouched`);
  if (!o.dryRun && changed && code === 0) console.log('\nNot committed. Review, then run:\n  git add -A && git commit -m "chore: migrate legacy shards install"');
  return code;
}

function run(argv) {
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`shards migrate: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { console.log(HELP); return 0; }
  if (o.exportLedger) return runExportLedger(o);
  return runFull(o);
}

module.exports = { run, exportLedger, HELP };
