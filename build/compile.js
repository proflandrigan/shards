'use strict';
// Compiler entry: compile({ target, coreDir, outDir, dev, strict }) -> { errors, files, report }.
// Pipeline: load core -> validate -> render every .md through the macro pass -> emit target layout.
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const { loadCore, label } = require('./core');
const { expandText } = require('./macros');
const { resolveMacro, fileContext } = require('./resolve');
const { render, TARGETS } = require('./render');
const { buildReport, formatTable } = require('./size');
const { emitTarget } = require('./emit');

const ROOT = path.resolve(__dirname, '..');
const STRICT_PATTERNS = [
  [/subagent_type/, 'subagent_type'], [/\.claude\//, '.claude/ path'], [/\/compact\b/, '/compact'],
  [/::ENDGATE::/, '::ENDGATE:: fence'], [/::GATE::/, '::GATE:: fence'],
  [/::AUTO-VERIFY::/, '::AUTO-VERIFY:: fence'], [/::ENDAUTO::/, '::ENDAUTO:: fence'],
];

function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: null, body: text, fmLines: 0 };
  let meta = null;
  try { meta = YAML.parse(m[1]); } catch (e) { meta = null; }
  return { meta, body: text.slice(m[0].length), fmLines: m[0].split('\n').length - 1, raw: m[1] };
}

// Renders one source file. rel is posix path relative to coreDir.
function processFile(core, rel, text, { target, strict }) {
  const errors = [];
  const file = label(path.join(core.coreDir, rel));
  const ctx = fileContext(rel);
  const add = (line, msg) => errors.push(`${file}:${line}: ${msg}`);
  const lines = text.split('\n');

  // links + strict checks on source lines
  let inFence = false;
  lines.forEach((ln, i) => {
    if (/^\s*(```|~~~)/.test(ln)) { inFence = !inFence; }
    if (!inFence && !/^\s*(```|~~~)/.test(ln)) {
      const re = /\[[^\]]*\]\(([^)\s]+)\)/g;
      let m;
      while ((m = re.exec(ln))) {
        const t = m[1];
        if (/^(https?:|mailto:|#|\/)/.test(t) || t.includes('{{')) continue;
        const p = t.split('#')[0];
        if (p && !fs.existsSync(path.join(core.coreDir, path.dirname(rel), p))) add(i + 1, `broken link '${t}'`);
      }
    }
    if (strict) for (const [re, what] of STRICT_PATTERNS) if (re.test(ln)) add(i + 1, `--strict: legacy ${what}`);
  });
  if (strict && /(^|\/)AGENT\.md$/.test(rel)) {
    const fm = splitFrontmatter(text);
    if (fm.raw) fm.raw.split('\n').forEach((ln, i) => { if (/^model\s*:/.test(ln)) add(i + 2, '--strict: model pin in frontmatter (D7)'); });
  }

  const seenGates = new Set();
  const out = expandText(text, (macro) => {
    const r = resolveMacro(macro, core, ctx);
    if (r.errors) { for (const e of r.errors) add(macro.line, e); return macro.raw; }
    if (r.model.macro === 'gate') {
      if (seenGates.has(r.model.id)) { add(macro.line, `duplicate gate id '${r.model.id}'`); return macro.raw; }
      seenGates.add(r.model.id);
    }
    return render(r.model, target);
  });
  return { text: out, errors };
}

function compile({ target, coreDir = path.join(ROOT, 'core'), outDir, dev = false, strict = false }) {
  if (!TARGETS.includes(target)) return { errors: [`unknown target '${target}'; expected ${TARGETS.join('|')}`] };
  coreDir = path.resolve(coreDir);
  const core = loadCore(coreDir);
  const errors = [...core.errors];
  const rendered = new Map(); // out-relative path -> content
  const personas = new Map();
  const agentBodies = new Map();

  const handle = (rel, outRel) => {
    const full = path.join(coreDir, rel);
    if (!rel.endsWith('.md')) { rendered.set(outRel, fs.readFileSync(full)); return null; }
    const src = fs.readFileSync(full, 'utf8');
    const r = processFile(core, rel, src, { target, strict });
    errors.push(...r.errors);
    const sp = splitFrontmatter(r.text);
    const meta = sp.meta;
    const body = sp.body.replace(/^\n+/, '');
    rendered.set(outRel, body);
    return { meta, body };
  };

  for (const [id, a] of core.agents) {
    for (const f of a.files) {
      const res = handle(`agents/${id}/${f}`, `content/agents/${id}/${f}`);
      if (f === 'AGENT.md' && res) { agentBodies.set(id, res); personas.set(id, res.body); }
    }
  }
  for (const f of core.protocols) handle(`protocols/${f}`, `content/protocols/${f}`);
  for (const f of core.templates) handle(`templates/${f}`, `content/templates/${f}`);

  if (strict) {
    for (const [id, a] of core.agents) if (a.doc && 'model' in a.doc) errors.push(`${label(path.join(a.dir, 'agent.yaml'))}:1: --strict: model key in agent.yaml (D7)`);
  }
  if (errors.length) return { errors: [...new Set(errors)] };

  const report = buildReport(target, rendered, personas);
  const files = emitTarget({ target, core, rendered, agentBodies, report, dev, outDir: path.resolve(outDir) });
  return { errors: [], files, report, table: formatTable(report) };
}

module.exports = { compile, processFile, splitFrontmatter };
