import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { run, HELP } = require('../cli/commands/migrate');
const { main, COMMANDS } = require('../cli/shards');

const FIXTURE = path.join(__dirname, 'fixtures', 'ledger');
let tmp;
function capture(fn) {
  const out = []; const err = [];
  const lo = console.log; const le = console.error;
  console.log = (...a) => out.push(a.join(' ')); console.error = (...a) => err.push(a.join(' '));
  try { return { code: fn(), out: out.join('\n'), err: err.join('\n') }; } finally { console.log = lo; console.error = le; }
}
function copyDir(a, b) { fs.cpSync(a, b, { recursive: true }); }
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')); copyDir(FIXTURE, tmp); });
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
const outDir = () => path.join(tmp, 'docs', 'knowledge');
function sources() {
  const base = path.join(tmp, '.shards', 'knowledge'); const acc = [];
  (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) w(f); else acc.push(path.relative(base, f).split(path.sep).join('/')); } })(base);
  return acc;
}

describe('migrate --export-ledger', () => {
  it('exports every entry with source_path, category and dates preserved', () => {
    const r = capture(() => run(['--export-ledger', '--root', tmp]));
    expect(r.code).toBe(0);
    const src = sources();
    expect(src.length).toBeGreaterThanOrEqual(5);
    expect(r.out).toContain(`exported ${src.length} of ${src.length} entries`);
    expect(r.out).toContain('git add docs/knowledge && git commit -m "docs: export knowledge ledger"');
    const files = fs.readdirSync(outDir());
    expect(files.length).toBe(src.length);
    const texts = files.map((f) => fs.readFileSync(path.join(outDir(), f), 'utf8'));
    for (const rel of src) {
      const t = texts.find((x) => x.includes(`source_path: ${JSON.stringify(rel)}`));
      expect(t, rel).toBeTruthy();
      const orig = fs.readFileSync(path.join(tmp, '.shards', 'knowledge', rel), 'utf8');
      const body = orig.replace(/^---\n[\s\S]*?\n---\n/, '');
      expect(t.endsWith(body)).toBe(true);
      const cat = rel === 'INDEX.md' ? 'index' : rel.split('/')[0];
      expect(t).toContain(`category: ${cat}`);
      const d = /^date: (\S+)/m.exec(orig);
      if (d) expect(t).toContain(`date: ${JSON.stringify(d[1])}`);
    }
    expect(files).toContain('INDEX.md');
    expect(files).toContain('entities-billing-user-id-is-string-uuid.md');
    expect(texts.join('')).toContain('original: |');
  });

  it('is idempotent and byte-identical on re-run', () => {
    capture(() => run(['--export-ledger', '--root', tmp]));
    const snap = (d) => Object.fromEntries(fs.readdirSync(d).map((f) => [f, fs.readFileSync(path.join(d, f), 'utf8')]));
    const a = snap(outDir());
    const r = capture(() => run(['--export-ledger', '--root', tmp]));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/0 written/);
    expect(snap(outDir())).toEqual(a);
  });

  it('reports hand-edited files as conflicts (exit 1) unless --force', () => {
    capture(() => run(['--export-ledger', '--root', tmp]));
    const f = path.join(outDir(), 'patterns-incremental-merge-for-scds.md');
    fs.appendFileSync(f, '\nhand edit\n');
    const r = capture(() => run(['--export-ledger', '--root', tmp]));
    expect(r.code).toBe(1);
    expect(r.err).toContain('CONFLICT patterns-incremental-merge-for-scds.md');
    expect(fs.readFileSync(f, 'utf8')).toContain('hand edit');
    const r2 = capture(() => run(['--export-ledger', '--root', tmp, '--force']));
    expect(r2.code).toBe(0);
    expect(fs.readFileSync(f, 'utf8')).not.toContain('hand edit');
  });

  it('dry-run writes nothing', () => {
    const r = capture(() => run(['--export-ledger', '--root', tmp, '--dry-run']));
    expect(r.code).toBe(0);
    expect(fs.existsSync(outDir())).toBe(false);
  });

  it('handles slug collisions without losing entries', () => {
    const d = path.join(tmp, '.shards', 'knowledge', 'patterns');
    fs.writeFileSync(path.join(d, 'a b.md'), 'one\n');
    fs.writeFileSync(path.join(d, 'a-b.md'), 'two\n');
    const r = capture(() => run(['--export-ledger', '--root', tmp]));
    expect(r.code).toBe(0);
    const n = sources().length;
    expect(fs.readdirSync(outDir()).length).toBe(n);
  });

  it('missing ledger: friendly message, exit 0, writes nothing', () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'noledger-'));
    try {
      const r = capture(() => run(['--export-ledger', '--root', empty]));
      expect(r.code).toBe(0);
      expect(r.out).toContain('no ledger found');
      expect(fs.existsSync(path.join(empty, 'docs'))).toBe(false);
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }
  });

  it('help and registration describe the migrate command', () => {
    expect(HELP).toContain('--export-ledger');
    expect(HELP).toMatch(/Full migrate/);
    expect(COMMANDS.migrate.summary).toMatch(/legacy/);
    const h = capture(() => run(['--help']));
    expect(h.code).toBe(0);
    expect(h.out).toContain('--dry-run');
    const top = capture(() => main(['--help']));
    expect(top.out).toMatch(/migrate .*--export-ledger/);
    expect(capture(() => run(['--bogus'])).code).toBe(2);
  });
});
