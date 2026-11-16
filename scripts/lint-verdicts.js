#!/usr/bin/env node
'use strict';
// Verdict-vocabulary lint. Every reviewer return format in core/ uses exactly APPROVED / NEEDS REVISION / BLOCKED
// (core/protocols/reviewer_verdict.md). Reviewer-specific nuance belongs in the review body, not the verdict word.
//
// Detection is line-based and deterministic. A line is a "verdict context" when it matches VERDICT_CTX (a
// `Verdict:` / `Status:` / `Overall:` label, "<role> verdict:", "return(s) (a) verdict", "return one of",
// "verdict definitions"). Inside a verdict context a finding is raised when:
//   1. a retired verdict word appears as a token (RETIRED), or
//   2. the line carries a `|` or `/` alternation and a capitalised alternative is not in ALLOWED or EXTRAS.
// The `{{SOUND | ... }}`-style template slots and `_WORD = meaning_` legend lines count as verdict contexts too.
// Usage: node scripts/lint-verdicts.js [--core core]   (exit 1 on findings)
const fs = require('fs');
const path = require('path');

const ALLOWED = new Set(['APPROVED', 'NEEDS REVISION', 'BLOCKED']);
// Non-verdict states that legitimately sit beside a verdict in a template line.
const EXTRAS = new Set(['SKIPPED', 'NOT APPLICABLE', 'NA', 'NONE']);
// Non-reviewer vocabularies that also use a `Verdict:` label: Syn's fixer complexity call and Autonomous Research
// loop control. They are not sign-offs on someone else's work, so they are exempt by name.
for (const w of ['GOOD', 'CAUTION', 'TOO COMPLEX', 'CONTINUE', 'REDIRECT', 'PAUSE', 'RETRO_REVERT']) EXTRAS.add(w);
const RETIRED = [
  /\bCONDITIONAL\b/, /\bSound\b/, /\bSOUND\b/, /\bRevise\b/, /\bREVISE\b/, /\bRedesign(?: needed)?\b/, /\bREDESIGN\b/,
  /\bDEPLOY\b/, /\bOPTIMIZE\b/, /\bConcerns raised\b/, /\bAligned\b/, /\bSuitable\b/, /\bNuanced\b/, /\bNUANCED\b/,
  /\bConsider Alternatives\b/, /\bCONSIDER ALTERNATIVES\b/, /\bMinor Issues\b/, /\bRefactor Required\b/,
  /\bIssues Found\b/,
  /\bConcerns\b(?=\s*[|\/])/, /[|\/]\s*Concerns\b/, /\bverdict:?\*{0,2}\s*[<\[]?\s*Concerns\b/i, /\bCONCERNS\b(?=\s*[|=}])/,
  /[|\/]\s*CONCERNS\b/,
];
const VERDICT_CTX = [
  /\b(?:verdict|status|overall)\s*:/i,
  /\bverdict\b[^.\n]*:\*\*/i,
  /\bverdicts?\s+(?:definitions?|vocabulary)\b/i,
  /\breturns?\s+(?:one of|a verdict|verdict)\b/i,
  /^\s*_[A-Z ]+ = .*_\s*$/,
  /\{\{[A-Z][A-Z ]+(?:\|[A-Z ]+)+\}\}/,
];
// A bullet that defines a verdict: "- **WORD** — meaning" inside a "Verdict definitions" block is checked in-block.
const DEF_BLOCK_START = /\*\*Verdict (?:definitions|vocabulary)[^*]*:?\*\*|Verdict vocabulary/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(md|yaml)$/.test(e.name)) out.push(p);
  }
  return out;
}

function altTokens(line) {
  // Take the text after the last label colon, strip template wrappers, split on | or /.
  let s = line.replace(/^.*?(?:verdict|status|overall)[^:]*:\*{0,2}\s*/i, '');
  s = s.replace(/N\/A/g, 'NA').replace(/[<>\[\]{}`*]/g, '');
  s = s.split(/\s+[—–-]\s+/)[0];
  if (!/[|\/]/.test(s)) return [];
  return s.split(/\s*[|\/]\s*/).map((t) => t.trim()).filter(Boolean);
}

function lintText(text, file) {
  const findings = [];
  const lines = text.split('\n');
  let inDefs = 0;
  lines.forEach((line, i) => {
    const n = i + 1;
    if (DEF_BLOCK_START.test(line)) inDefs = 12;
    else if (inDefs > 0) inDefs -= 1;
    const bulletDef = inDefs > 0 && /^\s*- \*\*[^*]+\*\*\s*(?:\([^)]*\)\s*)?—/.test(line);
    const ctx = VERDICT_CTX.some((re) => re.test(line)) || bulletDef;
    if (!ctx) return;
    for (const re of RETIRED) {
      const m = re.exec(line);
      if (m) {
        findings.push({ file, line: n, what: `retired verdict word "${m[0].trim()}"`, text: line.trim().slice(0, 120) });
        return;
      }
    }
    if (bulletDef) {
      const w = /^\s*- \*\*([^*]+)\*\*/.exec(line)[1].trim();
      if (!ALLOWED.has(w) && !EXTRAS.has(w.toUpperCase())) {
        findings.push({ file, line: n, what: `verdict definition "${w}" not in APPROVED / NEEDS REVISION / BLOCKED`, text: line.trim().slice(0, 120) });
      }
      return;
    }
    // `Status:` / `Overall:` lines are only reviewer verdicts when they mix in a reviewer-style word (project
    // lifecycle statuses such as "Planning | Executing" are out of scope); `Verdict:` lines are always checked.
    if (!/verdict/i.test(line) && !/\b(?:approved|blocked|clean|needs revision)\b/i.test(line)) return;
    for (const tok of altTokens(line)) {
      if (!/^[A-Z][A-Za-z_]*(?: [A-Za-z]+){0,2}$/.test(tok)) continue; // not a bare label-like word
      const up = tok.toUpperCase();
      if (ALLOWED.has(tok) || EXTRAS.has(up)) continue;
      if (/^[A-Z][a-z]+(?: [a-z]+)+$/.test(tok)) continue; // free prose, e.g. "Recommendations provided"
      findings.push({ file, line: n, what: `verdict alternative "${tok}" not in APPROVED / NEEDS REVISION / BLOCKED`, text: line.trim().slice(0, 120) });
      return;
    }
  });
  return findings;
}

function lintCore(coreDir) {
  const out = [];
  for (const f of walk(coreDir)) {
    // The protocol file documents the retired->canonical mapping on purpose.
    if (/protocols[\\/]reviewer_verdict\.md$/.test(f)) continue;
    out.push(...lintText(fs.readFileSync(f, 'utf8'), f));
  }
  return out;
}

module.exports = { lintText, lintCore, ALLOWED };

if (require.main === module) {
  const i = process.argv.indexOf('--core');
  const core = i > 0 ? process.argv[i + 1] : 'core';
  const findings = lintCore(core);
  for (const f of findings) console.error(`${f.file}:${f.line}: ${f.what}\n    ${f.text}`);
  if (findings.length) { console.error(`lint-verdicts: ${findings.length} finding(s)`); process.exit(1); }
  console.log('lint-verdicts: ok (reviewer verdicts use APPROVED / NEEDS REVISION / BLOCKED)');
}
