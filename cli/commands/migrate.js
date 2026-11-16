'use strict';
// `shards migrate`: only the ledger-export step exists so far (E4.5a). The full migrate arrives in E10.1.
// Exports .shards/knowledge/** (legacy Knowledge Ledger) to docs/knowledge/*.md. Never commits.
const fs = require('fs');
const path = require('path');

const CATEGORIES = ['entities', 'infrastructure', 'patterns', 'features'];
const DATE_KEYS = ['date', 'created', 'verified', 'updated', 'last_verified'];
const INDEX_NAME = 'INDEX.md';

const HELP = `Usage: shards migrate --export-ledger [--root <dir>] [--out <dir>] [--dry-run] [--force]

NOTE: this is only the ledger-export step of migration. The full \`shards migrate\`
(legacy install -> new layout) arrives in E10.1.

Exports the legacy Knowledge Ledger (<root>/.shards/knowledge/: INDEX.md plus
entities/, infrastructure/, patterns/, features/) to plain markdown under
<root>/docs/knowledge/ (or --out). Each file gets YAML front matter with
source_path, category, any date fields, and the original front matter verbatim
under 'original:'; the original body follows unchanged.

Output names: <category>-<slug>.md (suffix -2, -3 on collision); the ledger index
becomes INDEX.md.

Options:
  --export-ledger   run the ledger export (required)
  --root <dir>      project root (default: cwd)
  --out <dir>       output dir (default: <root>/docs/knowledge)
  --dry-run         report what would be written, write nothing
  --force           overwrite differing existing files (otherwise reported as conflicts, exit 1)

Idempotent: re-running yields byte-identical files. Does not commit; afterwards run:
  git add docs/knowledge && git commit -m "docs: export knowledge ledger"
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

function run(argv) {
  const o = { dryRun: false, force: false, exportLedger: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) throw new Error(`${a} requires a value`); return argv[++i]; };
    try {
      if (a === '--help' || a === '-h') { console.log(HELP); return 0; }
      else if (a === '--export-ledger') o.exportLedger = true;
      else if (a === '--root') o.root = path.resolve(val());
      else if (a === '--out') o.out = path.resolve(val());
      else if (a === '--dry-run') o.dryRun = true;
      else if (a === '--force') o.force = true;
      else throw new Error(`unknown option '${a}'`);
    } catch (e) { console.error(`shards migrate: ${e.message}\n\n${HELP}`); return 2; }
  }
  if (!o.exportLedger) { console.error(`shards migrate: only --export-ledger is available so far; the full migrate arrives in E10.1\n\n${HELP}`); return 2; }
  const out = o.out || path.join(o.root, 'docs', 'knowledge');
  const r = exportLedger({ root: o.root, out, dryRun: o.dryRun, force: o.force });
  if (!r.found) { console.log(`no ledger found at ${path.join(o.root, '.shards', 'knowledge')}; nothing to export`); return 0; }
  const verb = o.dryRun ? 'would write' : 'wrote';
  for (const n of r.written) console.log(`  ${verb} ${path.join(out, n)}`);
  for (const n of r.conflicts) console.error(`  CONFLICT ${n}: exists and differs (hand-edited?); use --force to overwrite`);
  for (const f of r.failures) console.error(`  FAILED ${f}`);
  for (const s of r.skipped) console.log(`  skipped non-markdown/symlink: ${s}`);
  console.log(`exported ${r.exported} of ${r.total} entries (${r.written.length} ${o.dryRun ? 'to write' : 'written'}, ${r.unchanged} unchanged${o.dryRun ? ', dry run' : ''})`);
  if (r.conflicts.length || r.failures.length) {
    console.error(`${r.conflicts.length} conflict(s), ${r.failures.length} failure(s)`);
    return 1;
  }
  if (!o.dryRun) console.log('\nNot committed. Review, then run:\n  git add docs/knowledge && git commit -m "docs: export knowledge ledger"');
  return 0;
}

module.exports = { run, exportLedger, HELP };
