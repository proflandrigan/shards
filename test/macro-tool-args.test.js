// Every {{auto_verify start}} and {{artifact.emit}} in core/ must render a call whose arguments
// pass the real runtime tool's inputSchema (and, for artifact_emit, the per-type meta schema).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const Ajv2020 = require('ajv/dist/2020');
const { expandText } = require('../build/macros.js');
const { resolveMacro, fileContext } = require('../build/resolve.js');
const { render, toolArgs } = require('../build/render.js');
const { loadCore } = require('../build/core.js');
const { parseMeta, typeMeta, formatMeta } = require('../build/meta.js');

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'core');
const core = loadCore(CORE);
const ajv = new Ajv({ allErrors: true, strict: false });
const ajv2020 = new Ajv2020({ allErrors: true, strict: false });
const avSchema = require('../runtime/tools/auto_verify_start.js').inputSchema;
const emitSchema = require('../runtime/tools/artifact_emit.js').inputSchema;
const validateAv = ajv.compile(avSchema);
const validateEmit = ajv.compile(emitSchema);
const metaValidator = (type) => ajv2020.compile(require(path.join(CORE, 'schema', 'artifacts', `${type}.schema.json`)));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Collect resolved models for the two macros across core/.
const found = [];
const rawCount = { auto_verify: 0, 'artifact.emit': 0 };
for (const file of walk(CORE)) {
  const rel = path.relative(CORE, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  rawCount.auto_verify += (text.match(/\{\{auto_verify start /g) || []).length;
  rawCount['artifact.emit'] += (text.match(/\{\{artifact\.emit /g) || []).length;
  expandText(text, (macro) => {
    if (!(macro.name === 'artifact.emit' || (macro.name === 'auto_verify' && macro.args && macro.args.positional[0] === 'start'))) return macro.raw;
    const r = resolveMacro(macro, core, fileContext(rel));
    found.push({ where: `${rel}:${macro.line}`, raw: macro.raw, ...r });
    return macro.raw;
  });
}

// Fill the placeholders an agent would fill in: '<current phase>' -> a phase number, an integer
// placeholder ({ placeholder }) -> a number, other '<...>' text -> a sample word.
function fill(v, key) {
  if (v && typeof v === 'object' && 'placeholder' in v) return 42;
  if (Array.isArray(v)) return v.map((x) => fill(x));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, k)]));
  if (typeof v === 'string') return key === 'phase' && v === '<current phase>' ? '3' : v.replace(/<[^<>]+>/g, 'x');
  return v;
}

describe('core macros render valid runtime tool arguments', () => {
  it('finds every use in core/', () => {
    const av = found.filter((f) => f.model ? f.model.macro === 'auto_verify' : /auto_verify/.test(f.raw));
    const em = found.filter((f) => f.model ? f.model.macro === 'artifact.emit' : /artifact\.emit/.test(f.raw));
    expect(av.length).toBe(rawCount.auto_verify);
    expect(em.length).toBe(rawCount['artifact.emit']);
    expect(av.length).toBeGreaterThanOrEqual(8);
    expect(em.length).toBeGreaterThanOrEqual(25);
    expect(found.filter((f) => f.errors).map((f) => `${f.where}: ${f.errors.join('; ')}`)).toEqual([]);
  });

  it('auto_verify start: args pass auto_verify_start inputSchema, rendered with ttl_s', () => {
    for (const f of found.filter((x) => x.model && x.model.macro === 'auto_verify')) {
      const args = fill(toolArgs(f.model));
      const ok = validateAv(args);
      expect(ok, `${f.where} ${JSON.stringify(args)}: ${ajv.errorsText(validateAv.errors)}`).toBe(true);
      for (const target of ['claude', 'codex', 'skills']) {
        const t = render(f.model, target);
        expect(t, f.where).toContain(`tool_budget=${args.tool_budget}, ttl_s=${args.ttl_s})`);
        expect(t, f.where).not.toMatch(/\bttl=/);
      }
    }
  });

  it('artifact.emit: args pass artifact_emit inputSchema and the artifact meta schema; meta rendered as an object', () => {
    for (const f of found.filter((x) => x.model && x.model.macro === 'artifact.emit')) {
      const args = fill(toolArgs(f.model));
      const ok = validateEmit(args);
      expect(ok, `${f.where} ${JSON.stringify(args)}: ${ajv.errorsText(validateEmit.errors)}`).toBe(true);
      const vm = metaValidator(args.type);
      expect(vm(args.meta || {}), `${f.where} meta ${JSON.stringify(args.meta)}: ${ajv2020.errorsText(vm.errors)}`).toBe(true);
      if (f.model.meta) {
        const t = render(f.model, 'claude');
        expect(t, f.where).toContain(`meta=${formatMeta(f.model.meta)})`);
        expect(t, f.where).not.toMatch(/meta="/);
      }
    }
  });

  it('pr-review meta: pr is an integer placeholder rendered unquoted', () => {
    const f = found.find((x) => x.model && x.model.type === 'pr-review');
    expect(f.model.meta).toEqual({ title: 'PR #<number>', pr: { placeholder: '<number>' } });
    expect(render(f.model, 'claude')).toContain('meta={"title": "PR #<number>", "pr": <number>}');
  });
});

describe('meta parsing', () => {
  const schema = require(path.join(CORE, 'schema', 'artifacts', 'pr-review.schema.json'));
  it('unquoted values with spaces run to the next key=', () => {
    expect(parseMeta('title=AR: <p> (branch: <b>) panel_id=ar-<p>-<b>')).toEqual({ title: 'AR: <p> (branch: <b>)', panel_id: 'ar-<p>-<b>' });
  });
  it('quoted values may contain key= text', () => {
    expect(parseMeta(`title='a b=c' note="x y"`)).toEqual({ title: 'a b=c', note: 'x y' });
  });
  it('types integers by schema and rejects non-integers and missing required keys', () => {
    expect(typeMeta({ title: 'T', pr: '12' }, schema)).toEqual({ meta: { title: 'T', pr: 12 }, errors: [] });
    expect(typeMeta({ title: 'T', pr: 'abc' }, schema).errors[0]).toMatch(/'pr' must be an integer/);
    expect(typeMeta({ pr: '1' }, schema).errors[0]).toMatch(/missing required 'title'/);
  });
  it('rejects malformed meta', () => {
    expect(() => parseMeta('just text')).toThrow(/expected key=value/);
    expect(() => parseMeta('title="open')).toThrow(/unterminated/);
    expect(() => parseMeta('a=1 a=2')).toThrow(/duplicate/);
  });
});
