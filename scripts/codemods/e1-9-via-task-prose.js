#!/usr/bin/env node
'use strict';
// E1.9 codemod: strip host-specific "via Task" / "via the Task tool" prose from core/ in favour of host-neutral consult wording.
// Deterministic and idempotent. Usage: node scripts/codemods/e1-9-via-task-prose.js [--dry-run] [--root <dir>]   (default core)
// Rules run in order; the generic last rule just drops the " via Task" qualifier. Remaining hits are hand-fixed.
const fs = require('fs');
const path = require('path');
const { walk } = require('./lib-task-blocks');

const VIA = '(?:via|Via) (?:the )?Task(?: tool)?';

const RULES = [
  // "invoked by X via the Task tool [for ...]" -> "consulted by X"
  [new RegExp('invoked (by [^.\\n]*?) ' + VIA, 'g'), 'consulted $1'],
  // "invoked via Task by X" -> "consulted by X"; "invoked via Task with" -> "consulted with"
  [new RegExp('invoked ' + VIA + '( by [^,.\\n)]+)?', 'g'), (m, by) => 'consulted' + (by || '')],
  // generic: drop the qualifier
  [new RegExp(' ' + VIA + '(?=[\\s,.;:)]|$)', 'g'), ''],
];

function convertText(text) {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}

function main(argv) {
  const dry = argv.includes('--dry-run');
  const root = path.resolve(argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : 'core');
  let changed = 0;
  for (const f of walk(root).sort()) {
    const text = fs.readFileSync(f, 'utf8');
    const out = convertText(text);
    if (out === text) continue;
    changed++;
    console.log((dry ? 'would change ' : 'changed ') + path.relative(process.cwd(), f));
    if (!dry) fs.writeFileSync(f, out);
  }
  console.log(`${changed} file(s) ${dry ? 'would change' : 'changed'}`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { convertText };
