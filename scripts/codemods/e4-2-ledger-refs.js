#!/usr/bin/env node
'use strict';
// E4.2 codemod: Knowledge Ledger references in core/agents -> `{{protocol sources}}` / `{{knowledge.search ...}}` wording.
// Deterministic and idempotent. Usage: node scripts/codemods/e4-2-ledger-refs.js [--dry-run] [--root <dir>]   (default core/agents)
// Files under <root>/syn/ are skipped (hand-reviewed). Remaining hits are listed under RESIDUAL for hand review.
const fs = require('fs');
const path = require('path');
const { walk } = require('./lib-task-blocks');

const LEDGER_RE = /Knowledge Ledger|\.shards\/knowledge|knowledge[_-](?:retrieval|harvest|checkpoint)/g;

const SOURCES_BLOCK = (extra) =>
  '### Sources\n- **Sources checked:** <knowledge source(s) searched> | N/A — no knowledge source reachable\n' +
  '- **Relevant findings:** <N>\n  - <title> (<source>) — <1-line relevance>\n- **Or:** No relevant findings' + (extra || '');

const WRITEBACK_PARA =
  '**Write-back proposal.** Before closing, propose reusable knowledge to write back through the knowledge job.\n' +
  '{{protocol sources}} (write-back step) and follow it. Present candidates to the user; write only after the gate or explicit user confirmation, summaries only (never raw query results).';

const FEATURE_BLOCK = (n) =>
  '**Feature search.** Run `{{knowledge.search query="reusable features for <domain>"}}` (domain from Phase ' + n + ') and look for\n' +
  'features whose domain tags overlap with this project\'s data. For each relevant feature, present to the user with its\n' +
  'SQL snippet, grain, and verification metadata. Ask: "Would you like to import any of these into your feature candidates?"\n' +
  'Skip if no knowledge source is reachable.\n\n' +
  'If imported, note in feature candidates list: `(imported from knowledge source —\nverified by <agent> in <source_project>)`';

// [regex, replacement] applied in order to the whole file text.
const RULES = [
  // A: Phase 0 doc template (AGENT.md + AR research.md); optional trailing "Relevant features" lines are folded into findings.
  [/### Knowledge Ledger\n- \*\*Entries checked:\*\*[^\n]*\n- \*\*Relevant entries found:\*\*[^\n]*\n  - <title>[^\n]*\n- \*\*Or:\*\* No relevant entries found(?:\n- \*\*Relevant features:\*\*[^\n]*(?:\n  - <title>[^\n]*)?)?/g, SOURCES_BLOCK()],
  // B
  [/- \*\*Check the Knowledge Ledger\.\*\* Before beginning Phase 1, check for relevant prior knowledge\. \{\{protocol knowledge_retrieval\}\} for the protocol\./g,
    '- **Check the knowledge sources.** Before beginning Phase 1, check for relevant prior knowledge. {{protocol sources}} for the protocol.'],
  // C
  [/\*\*Knowledge re-check:\*\* \{\{protocol knowledge_checkpoint\}\} before building\./g,
    '**Knowledge re-check:** {{protocol sources}} (mid-phase re-check) before building.'],
  // D
  [/\*\*Knowledge harvest\.\*\* Before closing, extract reusable knowledge from this project\.\n\{\{protocol knowledge_harvest\}\} and follow\nthe protocol\. Present candidates to the user for confirmation before writing\./g, WRITEBACK_PARA],
  // E (doc-template variants)
  [/- \*\*Knowledge harvested:\*\*\n  - <title> → \.shards\/knowledge\/<type>\/<filename>\.md\n  - Or: None — project did not produce reusable knowledge/g,
    '- **Write-backs proposed:**\n  - <title> → <knowledge job destination> (confirmed | declined | pending)\n  - Or: None — project did not produce reusable knowledge'],
  [/## Knowledge Harvested\n- <title> → \.shards\/knowledge\/<type>\/<filename>\.md\n- Or: None — project did not produce reusable knowledge/g,
    '## Write-backs Proposed\n- <title> → <knowledge job destination> (confirmed | declined | pending)\n- Or: None — project did not produce reusable knowledge'],
  // F: AR knowledge retrieval / harvest
  [/Read `knowledge_retrieval\.md` AR entry point\. Match on/g, 'Per {{protocol sources}} (AR entry point). Match on'],
  [/Per `knowledge_retrieval\.md` AR entry point\. Match/g, 'Per {{protocol sources}} (AR entry point). Match'],
  [/\{\{protocol knowledge_retrieval\}\} and\nfollow the AR entry point\./g, '{{protocol sources}} and\nfollow the AR entry point.'],
  [/prior research projects in the ledger often document/g, 'prior research projects in the knowledge sources often document'],
  [/5\. Knowledge harvest \(via `knowledge_harvest\.md`\)/g, '5. Write-back proposal (via {{protocol sources}}, write-back step)'],
  [/e\. Run harvest only after promotion\. Include cross-branch patterns from the\n   leaderboard in harvest candidates \(`knowledge_harvest\.md` AR fan-out special\n   case\)\./g,
    'e. Propose write-backs only after promotion. Include cross-branch patterns from the\n   leaderboard in the write-back candidates ({{protocol sources}}, AR fan-out special\n   case).'],
  [/\*\*Knowledge harvest is non-optional\.\*\* Every completed AR run contributes\n  candidates/g, '**Write-back proposal is non-optional.** Every completed AR run proposes\n  candidates'],
  // G: Feature Registry
  [/\*\*Feature Registry check\.\*\* If `\.shards\/knowledge\/features\/` exists, scan for features\nwhose domain tags overlap with this project's data domain \(from Phase (\d+)\)\. For each\nrelevant feature, present to the user with its SQL snippet, grain, and verification\nmetadata\. Ask: "Would you like to import any of these into your feature candidates\?"\n\nIf imported, note in feature candidates list: `\(imported from Knowledge Ledger —\nverified by <agent> in <source_project>\)`/g, (_m, n) => FEATURE_BLOCK(n)],
  [/- \*\*Feature Registry check:\*\* <N> relevant features found \| No features found \| N\/A — no features directory/g,
    '- **Feature search:** <N> relevant features found | No features found | N/A — no knowledge source reachable'],
  // service-mode bootstrap
  [/## Knowledge Bootstrap\n\n[\s\S]*?If `\.shards\/knowledge\/` does not exist or INDEX\.md is missing, skip this bootstrap entirely\./g,
    '## Knowledge Bootstrap\n\n' +
    'Before running the Service Mode Procedure, check whether the knowledge sources already document relevant facts about the tables or systems in this request. This reduces redundant exploration and starts the response from verified facts rather than fresh inference.\n\n' +
    '**Skip if already grounded:** If the caller\'s Task prompt already contains `(per knowledge source: ...)` citations, skip this bootstrap entirely — the caller has already re-grounded against the knowledge sources, and searching again here wastes context.\n\n' +
    '**Conditional search:** Extract 2–4 domain keywords from the caller\'s request (table names, entity names, system names) and run `{{knowledge.search query="<2-4 domain keywords from the request>"}}`. If nothing relevant comes back, skip directly to step 1 of the Service Mode Procedure below — do not search unconditionally.\n\n' +
    '**Bounded reads:** Read at most the top 3 matching results. Pre-populate your working context with that knowledge, marked `(from knowledge source, <confidence>)` in your response where those facts appear.\n\n' +
    '**Still validate:** Knowledge-source results are a starting point, not a substitute for validation. Still run exploration and validation queries per the procedure below. Confirm those facts against observed data, and contradict them if the data disagrees. If you observe a contradiction, flag it per {{protocol sources}} (mid-phase re-check).\n\n' +
    'If no knowledge source is reachable, skip this bootstrap entirely.'],
  // H: citations and prose
  [/\(per Knowledge Ledger:/g, '(per knowledge source:'],
  [/\(from Knowledge Ledger,/g, '(from knowledge source,'],
  [/No Knowledge Ledger harvest\./g, 'No write-back proposal.'],
];

function convertText(text) {
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep);
  return out;
}

function run(root, { dryRun = false } = {}) {
  const report = { files: 0, changed: [], residual: [] };
  for (const f of walk(root).sort()) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    if (rel.startsWith('syn/')) continue;
    const src = fs.readFileSync(f, 'utf8');
    const out = convertText(src);
    if (out !== src) {
      report.files++;
      report.changed.push(rel);
      if (!dryRun) fs.writeFileSync(f, out);
    }
    out.split('\n').forEach((l, i) => {
      if (/Knowledge Ledger|\.shards\/knowledge|knowledge[_-](?:retrieval|harvest|checkpoint)|Feature Registry|[Kk]nowledge harvest/.test(l)) {
        report.residual.push({ file: rel, line: i + 1, text: l.trim().slice(0, 140) });
      }
    });
  }
  return report;
}

module.exports = { convertText, run, RULES, LEDGER_RE };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const ri = argv.indexOf('--root');
  const root = path.resolve(ri >= 0 ? argv[ri + 1] : 'core/agents');
  const r = run(root, { dryRun });
  console.log(`${dryRun ? '[dry-run] ' : ''}changed ${r.files} file(s)`);
  console.log(`RESIDUAL (${r.residual.length}):\n${r.residual.map((x) => `  ${x.file}:${x.line} ${x.text}`).join('\n')}`);
}
