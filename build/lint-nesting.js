'use strict';
// Nesting lint (plan E5.6 / D2): consults never nest.
// For every {{consult X entry=E}} / {{fanout X ...}} under core/, the target's entry content file
// (core/agents/X/<consult_entries[E]>), plus any core/protocols/<name>.md it pulls in via {{protocol}},
// must not contain {{consult}}, {{fanout}}, {{switch}}, {{review_lead}} or {{verify}}. Macros are scanned with build/macros.js
// expandText, so escaped \{{ matches the compiler.
//
// Exceptions:
//  - NESTING_EXCEPTIONS: documented entries ('<agent>/<entry>') allowed to nest on every target.
//    Empty by design; add an entry only with a comment explaining why.
//  - options.allowDepth = { <target>: true } together with options.target: nesting is permitted for
//    that target only (e.g. Codex with max_depth > 1, see docs/compat.md). Default: none.
const fs = require('fs');
const path = require('path');
const { expandText } = require('./macros.js');
const { loadCore, walk, label } = require('./core.js');

const NESTING_EXCEPTIONS = [];
// review_lead (a review lead, depth 1) and verify (verifiers, depth 2) are nesting macros too: reachable from a
// consult/fanout entry they would nest a helper under a consultant.
const NESTING_MACROS = new Set(['consult', 'fanout', 'switch', 'review_lead', 'verify']);
// Files that must hold no nesting macro at all, whatever calls them: verifiers never spawn (verifier_contract.md is
// the verifier subagent's prompt, which has no Task tool).
const LEAF_PROTOCOLS = ['verifier_contract.md'];

function scan(file, text) {
  const hits = [];
  expandText(text, (m) => {
    if (NESTING_MACROS.has(m.name) || m.name === 'protocol') hits.push(m);
    return m.raw;
  });
  return hits.map((m) => ({ file, ...m }));
}

// Leaf files never nest on any target, not even where allowDepth permits nesting.
function leafErrors(coreDir) {
  const errors = [];
  for (const leaf of LEAF_PROTOCOLS) {
    const file = path.join(coreDir, 'protocols', leaf);
    if (!fs.existsSync(file)) continue;
    for (const m of scan(file, fs.readFileSync(file, 'utf8'))) {
      if (!NESTING_MACROS.has(m.name)) continue;
      errors.push(`${label(m.file)}:${m.line}: nested {{${m.name}}} in ${leaf}; verifiers are leaves and never spawn (D2)`);
    }
  }
  return errors;
}

function lintNesting(core, opts = {}) {
  const { allowDepth = {}, target = null } = opts;
  const coreDir = typeof core === 'string' ? core : core.coreDir;
  const errors = leafErrors(coreDir);
  if (target && allowDepth[target]) return errors;
  const loaded = typeof core === 'string' ? loadCore(core) : core;
  const reported = new Set();
  const cache = new Map();
  const read = (f) => {
    if (!cache.has(f)) cache.set(f, fs.existsSync(f) ? scan(f, fs.readFileSync(f, 'utf8')) : []);
    return cache.get(f);
  };

  // collect consult/fanout call sites across core/
  const sources = [];
  for (const [id, a] of loaded.agents) for (const f of a.files) if (f.endsWith('.md')) sources.push(path.join(a.dir, f));
  for (const f of walk(path.join(coreDir, 'protocols'))) if (f.endsWith('.md')) sources.push(path.join(coreDir, 'protocols', f));

  const checkFile = (file, chain, agentId, entry) => {
    for (const m of read(file)) {
      if (NESTING_MACROS.has(m.name)) {
        const key = `${m.file}:${m.line}`;
        if (reported.has(key)) continue;
        reported.add(key);
        errors.push(`${label(m.file)}:${m.line}: nested {{${m.name}}} inside entry '${entry}' of agent '${agentId}' (consulted from ${chain}); consults never nest (D2)`);
      } else if (m.name === 'protocol' && m.args && m.args.positional[0]) {
        const pf = path.join(coreDir, 'protocols', `${m.args.positional[0]}.md`);
        if (!visiting.has(pf)) { visiting.add(pf); checkFile(pf, chain, agentId, entry); }
      }
    }
  };
  let visiting = new Set();

  for (const src of sources) {
    for (const m of read(src)) {
      if (m.name !== 'consult' && m.name !== 'fanout') continue;
      if (!m.args) continue;
      const agentId = m.args.positional[0];
      const entry = m.name === 'fanout' ? m.args.named.entry || 'worker' : m.args.named.entry;
      const a = loaded.agents.get(agentId);
      if (!a || !entry) continue;
      if (NESTING_EXCEPTIONS.includes(`${agentId}/${entry}`)) continue;
      const rel = (a.doc.consult_entries || {})[entry];
      if (!rel) continue;
      visiting = new Set();
      checkFile(path.join(a.dir, rel), `${label(src)}:${m.line}`, agentId, entry);
    }
  }
  return errors;
}

module.exports = { lintNesting, NESTING_EXCEPTIONS };

if (require.main === module) {
  const coreDir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'core'));
  const errs = lintNesting(coreDir);
  if (errs.length) { console.error(errs.join('\n')); console.error(`${errs.length} nesting violation(s)`); process.exit(1); }
  console.log('lint-nesting: ok');
}
