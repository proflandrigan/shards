#!/usr/bin/env node
'use strict';
// E1.4 codemod: legacy `Task(subagent_type="x", ...)` fenced blocks -> `{{consult x entry=e task="..."}}` + brief.
// Deterministic. Usage: node scripts/codemods/e1-4-subagent-macros.js [--write] [--core core] [--report file]
// Without --write prints a summary only. Cases where the wanted entry is missing on the target agent are
// mapped to the closest existing entry and listed under "fallbacks" (human-reviewed exceptions list).
// Generic placeholders (subagent_type="<specialist>") are left untouched: they are hand-edited.
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const { walk, findBlocks } = require('./lib-task-blocks');

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const coreDir = path.resolve(args.includes('--core') ? args[args.indexOf('--core') + 1] : 'core');

const agents = {};
for (const d of fs.readdirSync(path.join(coreDir, 'agents'))) {
  const y = path.join(coreDir, 'agents', d, 'agent.yaml');
  if (fs.existsSync(y)) agents[d] = yaml.parse(fs.readFileSync(y, 'utf8'));
}

const CHAIN = {
  service: ['service', 'review', 'advise'],
  review: ['review', 'service', 'advise'],
  advise: ['advise', 'review', 'service'],
};

function wanted(target, file, prompt) {
  if (target === 'syn') {
    if (/arbiter/i.test(file) || /ARBITER/.test(prompt)) return 'arbiter';
    if (/CODE REVIEW MODE/.test(prompt)) return 'code_review';
    return 'final_review';
  }
  if (/SERVICE MODE/i.test(prompt)) return 'service';
  if (/modes\/advise\.md$/.test(file) || /advisory/i.test(prompt.slice(0, 200))) return 'advise';
  return 'review';
}

function pickEntry(target, want) {
  const entries = Object.keys((agents[target] || {}).consult_entries || {});
  if (target === 'syn') return entries.includes(want) ? want : 'final_review';
  for (const e of CHAIN[want]) if (entries.includes(e)) return e;
  return null;
}

function cleanPrompt(p) {
  let s = p.replace(/^""\s*/, '').replace(/\s*""$/, '');
  const ls = s.split('\n');
  const rest = ls.slice(1).filter((l) => l.trim());
  const ind = rest.length ? Math.min(...rest.map((l) => /^\s*/.exec(l)[0].length)) : 0;
  return [ls[0].trimStart(), ...ls.slice(1).map((l) => l.slice(Math.min(ind, /^\s*/.exec(l)[0].length)))].join('\n').trim();
}

// Generic-placeholder sites (subagent_type="<specialist>") are hand-mapped: `rel:placeholder:ordinal`.
// A macro needs a literal agent id, so each is written for one example agent and the intro says to substitute.
const GENERIC = {
  'agents/syn/modes/pm.md:<specialist>:0': ['consult data-scientist entry=advise', 'consult'],
  'agents/syn/modes/pm.md:<specialist>:1': ['fanout ml-engineer slices=workstream_a,workstream_b', 'fanout'],
  'agents/syn/modes/fixer.md:<specialist>:0': ['consult data-scientist entry=review', 'consult'],
  'agents/syn/modes/brainstorm.md:<specialist>:0': ['fanout data-analyst slices=1', 'fanout'],
  'agents/syn/modes/knowledge.md:<specialist>:0': ['consult data-modeller entry=advise', 'consult'],
  'agents/syn/modes/slides.md:<specialist>:0': ['consult data-scientist entry=review', 'consult'],
  'agents/syn/modes/slides.md:<specialist>:1': ['consult data-scientist entry=review', 'consult'],
  'agents/syn/modes/panel_review.md:<specialist>:0': ['consult data-scientist entry=service', 'consult'],
  'agents/syn/modes/panel_review.md:<owning specialist>:0': ['fanout data-scientist slices=fix_a,fix_b', 'fanout'],
  'agents/syn/modes/panel_review.md:<bucket primary, e.g. data-scientist or analytics-engineer>:0': ['fanout data-scientist slices=fix_a,fix_b', 'fanout'],
  'agents/syn/modes/code_review.md:<data-scientist|ml-engineer>:0': ['consult data-scientist entry=service', 'consult'],
  'agents/syn/modes/code_review.md:<data-scientist|ml-engineer>:1': ['consult data-scientist entry=service', 'consult'],
  'protocols/autonomous_research.md:<reviewer>:0': ['consult researcher entry=service', 'consult'],
  'protocols/autonomous_research.md:<specialist>:0': ['fanout ml-engineer slices=approach_a,approach_b', 'fanout'],
  'protocols/diverge.md:<your specialist type>:0': ['fanout ml-engineer slices=branch_a,branch_b', 'fanout'],
  'protocols/swarm.md:<specialist>:0': ['fanout ml-engineer slices=slice_a,slice_b', 'fanout'],
};
const INTRO = {
  consult: (ex) => `Run this consult (shown for \`${ex}\`; for another specialist use the same call with its id and an entry its \`agent.yaml\` declares):`,
  fanout: (ex) => `Fan out one worker per slice (shown for \`${ex}\`; use the specialist that owns the slices and name the slices accordingly):`,
};
const seen = {};

const fallbacks = [];
const unresolved = [];
let converted = 0;

for (const f of walk(coreDir)) {
  const rel = path.relative(coreDir, f);
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const blocks = findBlocks(lines).filter((b) => {
    if (agents[b.target]) return true;
    const k = `${rel}:${b.target}`;
    b.ordinal = seen[k] = (seen[k] === undefined ? 0 : seen[k] + 1);
    b.generic = GENERIC[`${k}:${b.ordinal}`];
    return !!b.generic;
  });
  if (!blocks.length) continue;
  const out = [];
  let cur = 0;
  for (const b of blocks) {
    let s = b.start, e = b.end;
    let indent = b.indent;
    const fenceOpen = /^(\s*)(`{3,})\s*\w*\s*$/.exec(lines[s - 1] || '');
    const fenceClose = /^(\s*)`{3,}\s*$/.exec(lines[e + 1] || '');
    if (fenceOpen && fenceClose) { s -= 1; e += 1; indent = fenceOpen[1]; }
    if (b.generic) {
      const [macro, kind] = b.generic;
      const ex = macro.split(' ')[1];
      const brief = cleanPrompt(b.prompt);
      const fence = brief.includes('```') ? '````' : '```';
      const task = b.description && kind === 'fanout' ? [`Per-slice task: ${b.description}`, ''] : [];
      const blk = [INTRO[kind](ex), '', `{{${macro}${b.description && kind === 'consult' ? ` task="${b.description.replace(/"/g, '\\"')}"` : ''}}}`, '', ...task, 'Brief for each consultant or worker (fill the angle-bracket fields):', '', fence, ...brief.split('\n'), fence].map((l) => (l ? indent + l : l));
      out.push(...lines.slice(cur, s), ...blk);
      cur = e + 1;
      converted++;
      continue;
    }
    const want = wanted(b.target, rel, b.prompt);
    const entry = pickEntry(b.target, want);
    if (!entry) { unresolved.push(`${rel}:${b.start + 1} ${b.target} wants ${want}`); continue; }
    if (entry !== want && b.target !== 'syn' && agents[b.target].role !== 'reviewer') fallbacks.push(`${rel}:${b.start + 1} ${b.target}: wanted ${want}, used ${entry}`);
    const task = b.description ? ` task="${b.description.replace(/"/g, '\\"')}"` : '';
    const brief = cleanPrompt(b.prompt);
    const fence = brief.includes('```') ? '````' : '```';
    const block = [
      `{{consult ${b.target} entry=${entry}${task}}}`,
      '',
      'Brief for the consultant (fill the bracketed fields):',
      '',
      fence,
      ...brief.split('\n'),
      fence,
    ].map((l) => (l ? indent + l : l));
    out.push(...lines.slice(cur, s), ...block);
    cur = e + 1;
    converted++;
  }
  out.push(...lines.slice(cur));
  if (WRITE) fs.writeFileSync(f, out.join('\n'));
}

console.log(`converted ${converted} blocks${WRITE ? '' : ' (dry run)'}`);
console.log(`fallbacks (${fallbacks.length}):\n${fallbacks.join('\n')}`);
if (unresolved.length) console.log(`UNRESOLVED (${unresolved.length}):\n${unresolved.join('\n')}`);
