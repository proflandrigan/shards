#!/usr/bin/env node
'use strict';
/*
 * coupling-ratchet: coupling metrics may only go down. Compares the current
 * coupling-report against scripts/coupling-baseline.json; exits 1 if any metric
 * increased. `--update` rewrites the baseline (only if nothing increased).
 * Options: --roots a,b  --baseline file
 */
const fs = require('fs');
const path = require('path');
const { computeReport, stableStringify } = require('./coupling-report');

const DEFAULT_BASELINE = path.join(__dirname, 'coupling-baseline.json');

// Numeric scalars only (plus by_kind); ignores file lists and definitions.
function extractCounts(report) {
  const c = {};
  for (const k of Object.keys(report).sort()) {
    const x = report[k];
    if (typeof x.count === 'number') c[k] = x.count;
    if (k === 'gate_fences') c['gate_fences.by_kind'] = { ...x.by_kind };
    if (k === 'auto_verify') { c['auto_verify.opens'] = x.opens; c['auto_verify.closes'] = x.closes; }
  }
  return c;
}

function flatten(counts) {
  const f = {};
  for (const k of Object.keys(counts)) {
    if (counts[k] && typeof counts[k] === 'object') {
      for (const s of Object.keys(counts[k])) f[`${k}.${s}`] = counts[k][s];
    } else f[k] = counts[k];
  }
  return f;
}

function compare(baseline, current) {
  const b = flatten(baseline), c = flatten(current);
  const increased = [], decreased = [];
  for (const k of [...new Set([...Object.keys(b), ...Object.keys(c)])].sort()) {
    const from = b[k] || 0, to = c[k] || 0;
    if (to > from) increased.push({ metric: k, baseline: from, current: to });
    else if (to < from) decreased.push({ metric: k, baseline: from, current: to });
  }
  return { ok: increased.length === 0, increased, decreased };
}

function main(argv) {
  let roots = ['src', 'core'], baselinePath = DEFAULT_BASELINE, update = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--roots') roots = (argv[++i] || '').split(',').filter(Boolean);
    else if (argv[i] === '--baseline') baselinePath = argv[++i];
    else if (argv[i] === '--update') update = true;
  }
  const current = extractCounts(computeReport({ root: process.cwd(), roots }));
  let baseline = null;
  try { baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')); } catch (e) { /* missing */ }
  if (!baseline) {
    if (!update) { console.error(`No baseline at ${baselinePath}; run with --update`); return 1; }
    fs.writeFileSync(baselinePath, stableStringify(current));
    console.log('Baseline created.');
    return 0;
  }
  const r = compare(baseline, current);
  if (!r.ok) {
    console.error('Coupling increased:');
    for (const x of r.increased) console.error(`  ${x.metric}: ${x.baseline} -> ${x.current}`);
    return 1;
  }
  if (r.decreased.length) {
    console.log('Coupling decreased (nice):');
    for (const x of r.decreased) console.log(`  ${x.metric}: ${x.baseline} -> ${x.current}`);
    if (!update) console.log('Run with --update to lower the baseline.');
  } else console.log('Coupling unchanged.');
  if (update) { fs.writeFileSync(baselinePath, stableStringify(current)); console.log('Baseline updated.'); }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { compare, extractCounts, flatten };
