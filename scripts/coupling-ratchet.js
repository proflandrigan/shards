#!/usr/bin/env node
'use strict';
/*
 * coupling-ratchet: coupling metrics may only go down. Compares the current
 * coupling-report against scripts/coupling-baseline.json; exits 1 if any metric
 * increased. `--update` rewrites the baseline (only if nothing increased; metrics new to the baseline are accepted at
 * their current value, whatever it is).
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

// opts.acceptNew: a top-level metric absent from the baseline (a newly introduced metric, e.g. after
// extending coupling-report) has no baseline to ratchet against, so it is recorded instead of counted as
// an increase. Sub-keys of an existing metric (by_kind entries) are never "new": they still ratchet from 0.
function compare(baseline, current, { acceptNew = false } = {}) {
  const b = flatten(baseline), c = flatten(current);
  const increased = [], decreased = [], added = [];
  for (const k of [...new Set([...Object.keys(b), ...Object.keys(c)])].sort()) {
    const from = b[k] || 0, to = c[k] || 0;
    const top = k.split('.')[0];
    if (acceptNew && !(k in b) && !Object.keys(b).some((x) => x.split('.')[0] === top)) { if (k in c) added.push({ metric: k, current: to }); continue; }
    if (to > from) increased.push({ metric: k, baseline: from, current: to });
    else if (to < from) decreased.push({ metric: k, baseline: from, current: to });
  }
  return { ok: increased.length === 0, increased, decreased, added };
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
  const r = compare(baseline, current, { acceptNew: update });
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
  for (const x of r.added) console.log(`New metric recorded: ${x.metric} = ${x.current}`);
  if (update) { fs.writeFileSync(baselinePath, stableStringify(current)); console.log('Baseline updated.'); }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { compare, extractCounts, flatten };
