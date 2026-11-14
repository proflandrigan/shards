#!/usr/bin/env node
'use strict';
// E11.9 codemod: legacy `::GATE:: id=.. phase=.. kind=.. ... ::ENDGATE::` text fences -> `{{gate ...}}` macros.
// Deterministic and idempotent. Usage: node scripts/codemods/e11-9-gate-fences.js [--dry-run] [--root <dir>]   (default root core/agents)
// Rules (see build/MACROS.md 3.8, build/resolve.js case 'gate'):
//   * phase files (`<agent>/phases[_quick|_deep]/phase-N.md`): agent/phase/track inferred; macro omits them. Elsewhere `phase=N` is explicit.
//   * id omitted when it equals the derived id (`<agent>[-track]-phase-N`); otherwise kept as `id=<fence id>`.
//   * kind missing -> `phase` (reported). checkpoint/confirm get `name=<slug>` (no id=), never `validates=`.
//   * validates=snake_case_agent -> kebab-case, must be a directory under the root.
//   * boilerplate fence bodies ("Read this section back... Wait for confirmation...") are dropped; substantive bodies
//     (questions, quoted prompts, evidence templates) are kept above the macro under a one-line lead.
//   * fences inside markdown code blocks (documentation examples) or with placeholder ids are NOT converted (reported).
// Anything not converted that still mentions fences is listed under MANUAL.
const fs = require('fs');
const path = require('path');
const { walk } = require('./lib-task-blocks');

const KINDS = ['phase', 'final', 'execute', 'handoff', 'checkpoint', 'confirm'];
const NON_ADVANCING = new Set(['checkpoint', 'confirm']);
const LEAD = 'Gate readback (pass this as the `summary`):';
const FENCE_RE = /^(\s*(?:[A-Za-z0-9]{1,2}[.)]\s+|[-*]\s+)?)::GATE::(?:\s+(.*?))?\s*$/;
const END_RE = /^\s*::ENDGATE::\s*$/;

// Mechanical text-hook-only sentences (whole-line removal).
const HOOK_PROSE = [
  /^\s*(?:\(?)\s*No more than ~?40 words (?:of prose )?after the (?:fence|gate)\.?\)?\s*$/i,
  /^\s*Emit the fence exactly(?: as shown)?\.?\s*$/i,
  /^\s*End your turn (?:immediately )?after the (?:gate|fence)\.?\s*$/i,
];

const BOILER_START = /^(Read (?:this|the|these|Phase \d+)\b[^"]*|Do not (?:proceed|begin|write|delete|touch|generate)\b|Wait for\b|Stop here\b|Confirm the proposed\b|Read back the captured\b)/;

function parseAttrs(s) {
  const attrs = {};
  const re = /([a-z_]+)=("[^"]*"|\S+)/g;
  let m;
  while ((m = re.exec(s || ''))) attrs[m[1]] = m[2].replace(/^"|"$/g, '');
  return attrs;
}

function fileCtx(rel) {
  const m = /^([^/]+)\/(.*)$/.exec(rel.split(path.sep).join('/'));
  if (!m) return { agent: null, phase: null, track: null };
  const pm = /^phases(?:_(quick|deep))?\/phase-(\d+(?:-\d+)*)\.md$/.exec(m[2]);
  return { agent: m[1], phase: pm ? pm[2] : null, track: pm ? pm[1] || null : null };
}

function isBoilerplate(body) {
  const text = body.map((l) => l.trim()).filter(Boolean).join(' ');
  if (!text) return true;
  if (/["]|\bAsk\b|^- /m.test(body.join('\n'))) return false;
  return BOILER_START.test(text);
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function nameFor(id, kind) {
  let m = new RegExp(`-${kind}-(.+)$`).exec(id) || /-(?:checkpoint|confirm)-(.+)$/.exec(id);
  if (m) return slug(m[1]);
  m = /phase-?\d+(?:-\d+)*-(.+)$/.exec(id);
  if (m) return slug(m[1]);
  return slug(id.split('-').pop());
}

// Converts one file's text. Returns { text, converted, defaulted, skipped, manual, errors }.
function convertText(text, rel, agents) {
  const ctx = fileCtx(rel);
  const lines = text.split('\n');
  const out = [];
  const res = { converted: 0, defaulted: [], skipped: [], manual: [], errors: [] };
  const usedNames = new Set();
  let code = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { code = !code; out.push(line); continue; }
    const fm = FENCE_RE.exec(line);
    if (!fm) {
      if (HOOK_PROSE.some((r) => r.test(line))) continue;
      if (/::GATE::|::ENDGATE::/.test(line) && !END_RE.test(line)) res.manual.push({ line: i + 1, text: line.trim() });
      out.push(line);
      continue;
    }
    const prefix = fm[1];
    const attrs = parseAttrs(fm[2]);
    let j = i + 1;
    while (j < lines.length && j < i + 60 && !END_RE.test(lines[j])) j++;
    const closed = j < lines.length && END_RE.test(lines[j]);
    if (code || !closed || /[<>]/.test(fm[2] || '')) {
      res.skipped.push({ line: i + 1, reason: code ? 'inside code block (doc example)' : !closed ? 'no closing ::ENDGATE::' : 'placeholder id' });
      out.push(line);
      continue;
    }
    const body = lines.slice(i + 1, j);
    const kindMissing = !attrs.kind;
    const kind = attrs.kind || 'phase';
    const fail = (why) => { res.errors.push({ line: i + 1, why }); out.push(line); };
    if (!KINDS.includes(kind)) { fail(`unknown kind '${kind}'`); continue; }
    if (!ctx.agent) { fail('file is not under an agent directory'); continue; }
    const phase = (attrs.phase || ctx.phase || '').replace(/\./g, '-') || null;
    if (!phase) { fail('no phase= and not a phase file'); continue; }
    if (ctx.phase && phase !== ctx.phase) { fail(`phase=${attrs.phase} mismatches phase file ${ctx.phase}`); continue; }
    let validates;
    if (attrs.validates) {
      validates = attrs.validates.replace(/_/g, '-');
      if (!agents.has(validates)) { fail(`validates=${attrs.validates} is not an agent`); continue; }
      if (NON_ADVANCING.has(kind)) { fail('validates= on non-advancing kind'); continue; }
    }
    const args = [`kind=${kind}`];
    if (!ctx.phase) args.push(`phase=${phase}`);
    if (validates) args.push(`validates=${validates}`);
    if (NON_ADVANCING.has(kind)) {
      let n = nameFor(attrs.id || `${ctx.agent}-phase-${phase}-${kind}-x`, kind) || 'step';
      const base = n;
      for (let k = 2; usedNames.has(`${kind}:${n}`); k++) n = `${base}-${k}`;
      usedNames.add(`${kind}:${n}`);
      args.push(`name=${n}`);
    } else {
      const derived = `${ctx.agent}${ctx.track ? `-${ctx.track}` : ''}-phase-${phase}`;
      if (attrs.id && attrs.id !== derived) args.push(`id=${attrs.id}`);
    }
    // body handling
    const keep = [];
    if (!isBoilerplate(body)) {
      for (const b of body) {
        if (/^\s*(Stop here\b|Do not interpret\b)/.test(b)) continue;
        keep.push(b.replace(/^\s+/, ''));
      }
    }
    let readback = keep;
    if (attrs.id === 'specific-instructions-syn-code-review-phase0' && !readback.length) {
      readback = ['The consolidated findings: the Analytics Engineer SQL review, the Backend Engineer Python script review, the notebook reviewer notebook review, and the MLOps Engineer config/infra review (each only if applicable). Do not apply any fixes or begin Step 5 until the user explicitly responds.'];
    }
    const indent = /^\s*/.exec(prefix)[0];
    if (readback.length) {
      if (out.length && out[out.length - 1].trim() !== '') out.push('');
      out.push(`${indent}${LEAD}`);
      out.push('');
      for (const r of readback) out.push(r ? `${indent}${r}` : '');
      out.push('');
    } else if (out.length && out[out.length - 1].trim() !== '' && !prefix.trim()) {
      out.push('');
    }
    out.push(`${prefix}{{gate ${args.join(' ')}}}`);
    if (kindMissing) res.defaulted.push({ line: i + 1, id: attrs.id });
    res.converted++;
    i = j; // skip through ENDGATE
  }
  return { ...res, text: out.join('\n') };
}

function run(root, { dryRun = false } = {}) {
  const agents = new Set(fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
  const report = { converted: 0, files: 0, defaulted: [], skipped: [], manual: [], errors: [] };
  for (const f of walk(root).sort()) {
    const rel = path.relative(root, f);
    const src = fs.readFileSync(f, 'utf8');
    if (!/::GATE::|::ENDGATE::|\bgate fence|The hook /.test(src) && !HOOK_PROSE.some((r) => src.split('\n').some((l) => r.test(l)))) continue;
    const r = convertText(src, rel, agents);
    const tag = (x) => ({ file: rel, ...x });
    report.converted += r.converted;
    report.defaulted.push(...r.defaulted.map(tag));
    report.skipped.push(...r.skipped.map(tag));
    report.manual.push(...r.manual.map(tag));
    report.errors.push(...r.errors.map(tag));
    // prose that still talks about fences (nuanced; reviewers decide)
    const outLines = r.text.split('\n');
    outLines.forEach((l, k) => {
      if (/\bgate fence\b|^The hook blocks|post-fence/i.test(l) && !/::GATE::/.test(l)) report.manual.push({ file: rel, line: k + 1, text: l.trim().slice(0, 140) });
    });
    if (r.text !== src) {
      report.files++;
      if (!dryRun) fs.writeFileSync(f, r.text);
    }
  }
  return report;
}

module.exports = { convertText, run, nameFor, isBoilerplate };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const ri = argv.indexOf('--root');
  const root = path.resolve(ri >= 0 ? argv[ri + 1] : 'core/agents');
  const r = run(root, { dryRun });
  const fmt = (x) => `${x.file}:${x.line}`;
  console.log(`${dryRun ? '[dry-run] ' : ''}converted ${r.converted} fence(s) in ${r.files} file(s)`);
  console.log(`kind defaulted to phase (${r.defaulted.length}):\n${r.defaulted.map((x) => `  ${fmt(x)} id=${x.id}`).join('\n')}`);
  console.log(`SKIPPED (${r.skipped.length}):\n${r.skipped.map((x) => `  ${fmt(x)} ${x.reason}`).join('\n')}`);
  console.log(`ERRORS (${r.errors.length}):\n${r.errors.map((x) => `  ${fmt(x)} ${x.why}`).join('\n')}`);
  console.log(`MANUAL (${r.manual.length}):\n${r.manual.map((x) => `  ${fmt(x)} ${x.text.slice(0, 120)}`).join('\n')}`);
}
