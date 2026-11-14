#!/usr/bin/env node
'use strict';
// Counts gate approvals in a project's .shards/state/sessions/*/gates.json.
// Harness for the OPEN criterion (phase policy <= 10 human approvals, plan policy 1).
// NOTE: live runs against a real host are NOT performed by this repo; this only counts recorded state.
//
// Usage: node scripts/count-approvals.js [projectRoot] [--json] [--check-max-human N]
const fs = require('fs');
const path = require('path');

const HUMAN = ['elicitation', 'host-prompt', 'chat-reply', 'operator-cli'];

function count(root) {
  const dir = path.join(root, '.shards', 'state', 'sessions');
  const out = { human: 0, 'auto-evidence': 0, 'plan-notice': 0, other: 0, by_kind: {} };
  let sessions = [];
  try { sessions = fs.readdirSync(dir); } catch (_) { /* none */ }
  for (const s of sessions) {
    let g;
    try { g = JSON.parse(fs.readFileSync(path.join(dir, s, 'gates.json'), 'utf8')); } catch (_) { continue; }
    for (const e of Object.values(g.gates || {})) {
      if (!e || e.status !== 'confirmed' || !e.proof) continue;
      const tier = e.proof.tier;
      const cat = HUMAN.includes(tier) ? 'human' : (tier === 'auto-evidence' || tier === 'plan-notice') ? tier : 'other';
      out[cat]++;
      const k = out.by_kind[e.kind] = out.by_kind[e.kind] || { human: 0, 'auto-evidence': 0, 'plan-notice': 0, other: 0 };
      k[cat]++;
    }
  }
  return out;
}

function main(argv) {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const mi = args.indexOf('--check-max-human');
  const max = mi >= 0 ? Number(args[mi + 1]) : null;
  const root = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--check-max-human') || '.');
  const r = count(root);
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`human approvals: ${r.human}\nauto-evidence:   ${r['auto-evidence']}\nplan-notices:    ${r['plan-notice']}\nother:           ${r.other}`);
    for (const [k, v] of Object.entries(r.by_kind)) console.log(`  ${k}: human=${v.human} auto-evidence=${v['auto-evidence']} plan-notice=${v['plan-notice']}`);
  }
  if (max != null && r.human > max) { console.error(`FAIL: ${r.human} human approvals exceeds max ${max}`); return 1; }
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { count, main };
